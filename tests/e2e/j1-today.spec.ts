import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(180000);

async function openFromSidebar(page: Page, testId: string) {
  const shell = page.locator(".app-shell");
  if (!(await shell.evaluate((el) => el.classList.contains("sidebar-open")))) await page.getByTitle("Toggle courses").click();
  await page.getByTestId(testId).click();
}

test("first 60 seconds: drop a file, see indexing, a cited summary, three actions and one prepared Continue", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `First minute ${Date.now()}`, "Cell basics");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await openFromSidebar(page, "open-home");
  await expect(page.getByTestId("home-surface")).toBeVisible();

  await expect(page.getByTestId("indexing-progress")).toContainText("No sources indexed yet");
  await page.getByTestId("home-file-input").setInputFiles({
    name: "cell-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("DNA lives in the nucleus. Energy is stored in chemical bonds."),
  });

  await expect(page.getByTestId("indexing-progress")).toContainText(/Indexing|sources indexed/, { timeout: 45000 });
  await expect(page.getByTestId("grounded-summary")).toContainText("DNA lives in the nucleus", { timeout: 45000 });
  await expect(page.getByTestId("summary-citation")).toHaveCount(1);
  await expect(page.getByTestId("first-action")).toHaveCount(3);
  await expect(page.getByTestId("home-continue")).toBeEnabled({ timeout: 45000 });
  await page.screenshot({ path: test.info().outputPath("j1-home.png") });

  await page.getByTestId("summary-citation").first().click();
  await expect(page.getByRole("dialog", { name: /Document preview|cell-notes/ })).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await openFromSidebar(page, "open-home");

  await page.getByTestId("home-continue").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId("studio-focus")).toHaveValue(/cell-notes/);
  await page.screenshot({ path: test.info().outputPath("j1-home-continue.png") });
});

test("return visit opens Today with the daily plan, a prepared Continue and quiet secondary suggestions", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Return day ${Date.now()}`, "Lesson home");
  const document = await request.post("/api/documents", {
    data: { courseId: course.id, name: "cell-notes.txt", content: "DNA lives in the nucleus." },
  });
  expect(document.ok()).toBeTruthy();
  const documentId = (await document.json()).id as string;
  for (const concept of ["Cell biology", "Genetics"]) {
    const created = await request.post("/api/study/questions", {
      data: {
        courseId: course.id, lessonId: lesson.id, concept,
        prompt: `What is true about ${concept}?`,
        choices: [{ id: "a", text: "From the source" }, { id: "b", text: "A guess" }],
        correctChoice: "a", explanation: `The source describes ${concept}.`,
        sourceDocumentId: documentId, sourceExcerpt: "DNA lives in the nucleus.", reviewed: true,
      },
    });
    expect(created.status()).toBe(201);
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.getByTestId("today-strip")).toBeVisible();
  await expect(page.getByTestId("today-strip")).toContainText(/step \d+ of \d+/);
  await page.getByTestId("today-continue").click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId("today-status")).toContainText("Ready in Study");
  await page.screenshot({ path: test.info().outputPath("j1-today-strip.png") });
  await page.getByRole("button", { name: "Close study session" }).click();

  await openFromSidebar(page, "open-today");
  await expect(page.getByTestId("today-surface")).toBeVisible();
  await expect(page.getByTestId("today-resume")).toContainText(lesson.title);
  await expect(page.getByTestId("today-plan")).toContainText("step");
  await expect(page.getByTestId("today-more")).toBeVisible();
  await page.getByTestId("today-more").click();
  await expect(page.getByTestId("today-secondary")).toBeVisible();
  await expect(page.getByTestId("today-secondary-item")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("j1-today.png") });
});

test("Home stays honest before any source exists and rejects an unsupported file", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Empty start ${Date.now()}`, "Empty lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await openFromSidebar(page, "open-home");

  await expect(page.getByTestId("grounded-summary")).toContainText("Add a source");
  await expect(page.getByTestId("home-continue")).toBeDisabled();
  await expect(page.getByTestId("first-action")).toHaveCount(3);

  await page.getByTestId("home-file-input").setInputFiles({ name: "notes.exe", mimeType: "application/octet-stream", buffer: Buffer.from("not course material") });
  await expect(page.getByTestId("home-error")).toContainText("Supported formats");
});

import { expect, test, type APIRequestContext } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function seedReviewedLesson(request: APIRequestContext, concepts: string[], title: string) {
  const { course, lesson } = await createCourseWithLesson(request, `Coach ${Date.now()} ${title}`, title);
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "cell-notes.txt", content: "DNA lives in the nucleus. Energy is stored in bonds." } });
  expect(document.ok()).toBeTruthy();
  const documentId = (await document.json()).id as string;
  for (const concept of concepts) {
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
  return { course, lesson };
}

async function openCoachedLesson(page: import("@playwright/test").Page, courseTitle: string, lessonTitle: string) {
  await page.goto("/");
  await selectCourseOnPage(page, courseTitle);
  await expect(page.getByRole("heading", { name: lessonTitle, exact: true })).toBeVisible();
  await expect(page.getByTestId("coach-surface")).toBeVisible();
}

test("Coach emits one ranked prompt with a preview and an accessible secondary list", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology", "Genetics"], "Lesson home");
  await openCoachedLesson(page, course.title, lesson.title);

  await expect(page.getByTestId("coach-reason")).toHaveCount(1);
  await expect(page.getByTestId("coach-continue")).toHaveCount(1);
  await expect(page.getByTestId("coach-preview")).toContainText("Opens your study session");
  await expect(page.getByTestId("coach-preview")).toContainText("review question ready");
  await expect(page.getByTestId("coach-secondary")).toBeHidden();

  const more = page.getByTestId("coach-more");
  await expect(more).toContainText("1 more");
  await more.click();
  await expect(page.getByTestId("coach-secondary")).toBeVisible();
  await expect(page.getByTestId("coach-secondary-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("coach-secondary")).toBeHidden();

  await page.waitForTimeout(600); // let the authored 220 ms entrance settle for a clean capture
  await page.screenshot({ path: "test-results/coach-lesson-home.png", fullPage: false });
});

test("Continue prepares the study session with the next question and the Coach stays there", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology"], "Prepared destination");
  await openCoachedLesson(page, course.title, lesson.title);

  const reason = await page.getByTestId("coach-reason").innerText();
  expect(reason).toContain("Cell biology");
  await page.getByTestId("coach-continue").click();

  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is true about Cell biology?" })).toBeVisible();
  await expect(page.getByTestId("coach-surface")).toBeVisible();
  await expect(page.getByTestId("coach-status")).toHaveText("Ready in Study. Your next question is loaded.");

  await page.waitForTimeout(600); // capture the settled destination, not a mid-transition frame
  await page.screenshot({ path: "test-results/coach-prepared-destination.png", fullPage: false });
});

test("Continue prepares Studio with the cited source focus", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Coach studio ${Date.now()}`, "Fresh lesson");
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "intro.txt", content: "This lesson introduces the scientific method." } });
  expect(document.ok()).toBeTruthy();
  await openCoachedLesson(page, course.title, lesson.title);

  await expect(page.getByTestId("coach-preview")).toContainText("Studio");
  await page.getByTestId("coach-continue").click();

  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await expect(page.getByTestId("studio-focus")).toHaveValue(/intro\.txt/);
  await expect(page.getByTestId("coach-surface")).toBeVisible();
  await expect(page.getByTestId("coach-status")).toHaveText("Ready in Studio. Your source focus is set.");
});

test("dismissal advances the stream and the keyboard path activates a prompt", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology", "Genetics"], "Dismissal");
  await openCoachedLesson(page, course.title, lesson.title);

  const before = await page.getByTestId("coach-reason").innerText();
  await page.getByTestId("coach-dismiss").click();
  await expect(page.getByTestId("coach-reason")).not.toHaveText(before);
  const after = await page.getByTestId("coach-reason").innerText();
  expect(["Cell biology", "Genetics"].some((concept) => after.includes(concept))).toBeTruthy();

  await page.getByTestId("coach-continue").focus();
  await expect(page.getByTestId("coach-continue")).toBeFocused();
  await page.keyboard.press("Enter");
  // The study service selects the weakest due question by id, so either seeded question is valid.
  await expect(page.getByRole("heading", { name: /^What is true about (Cell biology|Genetics)\?$/ })).toBeVisible();
  await expect(page.getByTestId("coach-surface")).toBeVisible();
});

test("a failed preparation shows a plain message and never invents a target", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology"], "Failed preparation");
  await page.route("**/api/study/ask*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) }));
  await openCoachedLesson(page, course.title, lesson.title);

  await page.getByTestId("coach-continue").click();
  await expect(page.getByTestId("coach-status")).toHaveText("That step is not available right now. Nothing was changed.");
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeHidden();
});

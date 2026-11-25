import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(90000);

async function openStudyStage(page: import("@playwright/test").Page, courseTitle: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, courseTitle);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
}

test("Study stage keeps one primary action in view", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Primary action ${Date.now()}`, "Primary lesson");
  const artifact = {
    id: "stage-pt", courseId: "c", lessonId: "l", kind: "practice", title: "Practice test", acceptance: "pending",
    content: { cards: [], questions: [{ concept: "Grounded fact", prompt: "What is in the source?", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }, { id: "d", text: "D" }], correctChoice: "a", explanation: "From the source.", sourceRef: "studyai://document/doc-1/page/1?chunk=0", sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: "A grounded fact." }] },
    sourceRefs: ["studyai://document/doc-1/page/1?chunk=0"], createdAt: new Date().toISOString(),
  };
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(artifact) }));
  await openStudyStage(page, course.title);
  const stage = page.getByRole("dialog", { name: "Study session" });
  await expect(stage.locator("button.button-primary")).toHaveCount(1);

  await stage.getByTestId("make-practice-test").click();
  await expect(page.getByTestId("practice-test")).toBeVisible();
  await expect(stage.locator("button.button-primary")).toHaveCount(1);
});

test("StudyStage mode buttons open the real surfaces", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Stage ${Date.now()}`, "Stage lesson");

  await openStudyStage(page, course.title);
  const stage = page.getByRole("dialog", { name: "Study session" });
  await expect(stage.getByRole("button", { name: /Adaptive quiz/ })).toHaveAttribute("aria-current", "step");
  await stage.getByRole("button", { name: /Course sources/ }).click();
  await expect(page.getByRole("heading", { name: "Document library" })).toBeVisible();

  await openStudyStage(page, course.title);
  await page.getByRole("dialog", { name: "Study session" }).getByRole("button", { name: /Activities/ }).click();
  await expect(page.getByRole("heading", { name: "Learning activities" })).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

const PASSAGE = "Zorblum alloy remains stable at four hundred kelvin under a load of five newtons.";

async function openGuideCitation(page: Page, courseId: string, lessonId: string, courseTitle: string, ref: string) {
  const guide = {
    id: `cite-highlight-${Date.now()}`, courseId, lessonId, kind: "study-guide", title: "Cited guide",
    content: { title: "Cited guide", overview: "From the source.", sections: [{ heading: "Evidence", body: PASSAGE, sourceRefs: [ref] }], keyTerms: [] },
    sourceRefs: [ref], createdAt: new Date().toISOString(),
  };
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(guide) }));
  await page.goto("/");
  await selectCourseOnPage(page, courseTitle);
  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-study-guide").click();
  await page.getByTestId("studio-generate").click();
  await page.getByTestId("citation-chip").first().click();
}

test("a citation opens and highlights the exact course passage", async ({ page }) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(page.request, `Citation highlight ${Date.now()}`, "Cited lesson");
  const response = await page.request.post("/api/documents", {
    data: { courseId: course.id, name: "highlight-source.txt", content: PASSAGE },
  });
  expect(response.ok()).toBeTruthy();
  const doc = await response.json() as { id: string };
  const ref = `studyai://document/${doc.id}/text/1?chunk=0`;
  await openGuideCitation(page, course.id, lesson.id, course.title, ref);

  const viewer = page.getByRole("dialog", { name: "highlight-source.txt" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("cited-passage").locator("mark")).toHaveText(PASSAGE);
  await expect(viewer.locator(".di-readable-text mark").first()).toHaveText(PASSAGE);
  await page.screenshot({ path: "test-results/shots/tutor-citation-highlight.png", fullPage: true });
});

test("a stale citation shows a plain message instead of a blank highlight", async ({ page }) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(page.request, `Stale citation ${Date.now()}`, "Cited lesson");
  const response = await page.request.post("/api/documents", {
    data: { courseId: course.id, name: "stale-source.txt", content: PASSAGE },
  });
  expect(response.ok()).toBeTruthy();
  const doc = await response.json() as { id: string };
  const ref = `studyai://document/${doc.id}/text/1?chunk=99`;
  await openGuideCitation(page, course.id, lesson.id, course.title, ref);

  const viewer = page.getByRole("dialog", { name: "stale-source.txt" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("citation-error")).toContainText(/no longer available/i);
  await expect(viewer.getByTestId("cited-passage")).toHaveCount(0);
});

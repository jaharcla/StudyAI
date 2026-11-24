import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

type Seam = (input: { kind: "quiz" | "cards" | "slides"; focus: string; count?: number }) => Promise<{ status: string; message: string }>;

async function openWithSeam(page: import("@playwright/test").Page, title: string) {
  await page.goto("/");
  await selectCourseOnPage(page, title);
  await page.waitForFunction(() => typeof (window as Window & { __studyaiMakeLibraryArtifact?: unknown }).__studyaiMakeLibraryArtifact === "function", null, { timeout: 30_000 });
}

test("a quiz request in Tutor chat creates a real artifact in the shared Library", async ({ page }) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(page.request, `Library artifact ${Date.now()}`, "Forces");
  const artifact = {
    id: "chat-forces-practice", courseId: course.id, lessonId: lesson.id, kind: "practice", title: "Forces practice",
    content: { cards: [{ id: "c1", front: "Net force", back: "Sum of forces" }], questions: [{ id: "q1", prompt: "What is equilibrium?", answer: "Net force is zero", choices: [], correctIndex: 0 }] },
    sourceRefs: [], createdAt: new Date().toISOString(),
  };
  let artifacts: unknown[] = [];
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(artifacts) }));
  await page.route("**/api/studio/generate", (route) => { artifacts = [artifact]; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(artifact) }); });
  await page.route("**/api/studio/import", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cardsAdded: 1, questionsAdded: 1, errors: [] }) }));
  await openWithSeam(page, course.title);

  const result = await page.evaluate(async () => (window as Window & { __studyaiMakeLibraryArtifact: Seam }).__studyaiMakeLibraryArtifact({ kind: "quiz", focus: "equilibrium", count: 2 }));
  expect(result.status).toBe("ok");
  expect(result.message).toContain("Library");

  await page.getByTestId("open-library").click();
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await expect(page.getByTestId("library-item").first()).toContainText("Forces practice");
  await page.screenshot({ path: "test-results/shots/tutor-library-quiz.png", fullPage: true });
});

test("a failed generation reports honestly and leaves the Library unchanged", async ({ page }) => {
  test.setTimeout(90_000);
  const { course } = await createCourseWithLesson(page.request, `Library failure ${Date.now()}`, "Forces");
  await page.route("**/api/studio/generate", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "upstream unavailable" }) }));
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await openWithSeam(page, course.title);

  const result = await page.evaluate(async () => (window as Window & { __studyaiMakeLibraryArtifact: Seam }).__studyaiMakeLibraryArtifact({ kind: "cards", focus: "equilibrium" }));
  expect(result.status).toBe("error");
  expect(result.message).toMatch(/isn't responding|unchanged/i);
});

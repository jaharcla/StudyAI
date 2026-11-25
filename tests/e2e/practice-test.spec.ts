import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

const REF = "studyai://document/doc-1/page/1?chunk=0";
const EXCERPT = "Planck set h = 6.626 x 10^-34 J s in his quantum hypothesis.";
const QUESTIONS = [
  { concept: "Quantum hypothesis", prompt: "What value did Planck set for h?", choices: [{ id: "a", text: "6.626 x 10^-34 J s" }, { id: "b", text: "9.8 m/s^2" }, { id: "c", text: "3.00 x 10^8 m/s" }, { id: "d", text: "1.602 x 10^-19 C" }], correctChoice: "a", explanation: "Planck's constant is 6.626 x 10^-34 J s.", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: EXCERPT },
  { concept: "Photon absorption", prompt: "What happens when an electron absorbs a photon?", choices: [{ id: "a", text: "It moves to a lower level" }, { id: "b", text: "It moves to a higher level" }, { id: "c", text: "It stays at the same level" }, { id: "d", text: "It leaves the atom" }], correctChoice: "b", explanation: "Absorbing a photon raises the electron to a higher energy level.", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: EXCERPT },
];
const ARTIFACT = {
  id: "pt-1", courseId: "c", lessonId: "l", kind: "practice", title: "Practice test · Quantum",
  content: { cards: [], questions: QUESTIONS }, sourceRefs: [REF], createdAt: new Date().toISOString(), acceptance: "pending",
};

function choice(page: Page, question: number, position: number) {
  return page.locator(`[data-testid="practice-choice"][data-question="${question}"]`).nth(position);
}

async function mockStudio(page: Page, generateStatus = 201) {
  let generateCalls = 0;
  let recordCalls = 0;
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", (route) => {
    generateCalls += 1;
    if (generateStatus !== 201) return route.fulfill({ status: generateStatus, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(ARTIFACT) });
  });
  await page.route("**/api/study/practice-answer", (route) => {
    recordCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ duplicate: false }) });
  });
  return {
    counts: () => ({ generateCalls, recordCalls }),
    failGeneration: async () => {
      await page.unroute("**/api/studio/generate");
      await page.route("**/api/studio/generate", (route) => {
        generateCalls += 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) });
      });
    },
    failRecording: async () => {
      await page.unroute("**/api/study/practice-answer");
      await page.route("**/api/study/practice-answer", (route) => {
        recordCalls += 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) });
      });
    },
  };
}

async function openTestFromLibrary(page: Page, courseTitle: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, courseTitle);
  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-practice").click();
  await expect(page.getByTestId("practice-view")).toBeVisible();
  await page.getByTestId("take-practice-test").click();
  await expect(page.getByTestId("practice-test")).toBeVisible();
}

test("checking grades locally against the stored key, with four choices and clickable citations", async ({ page, request }) => {
  const studio = await mockStudio(page);
  const { course } = await createCourseWithLesson(request, `Practice test ${Date.now()}`, "Quantum lesson");
  await openTestFromLibrary(page, course.title);

  await expect(page.getByTestId("practice-question")).toHaveCount(2);
  await expect(page.getByTestId("practice-choice")).toHaveCount(8);
  await expect(page.getByTestId("practice-citation")).toHaveCount(2);
  await expect(page.getByTestId("practice-score")).toHaveCount(0);
  await expect(page.getByTestId("practice-test-progress")).toHaveText("0 of 2 answered");
  await page.screenshot({ path: "test-results/shots/practice-test-01-built.png" });

  await choice(page, 0, 1).click();
  await choice(page, 1, 1).click();
  await expect(page.getByTestId("practice-test-progress")).toHaveText("2 of 2 answered");
  await expect(page.getByTestId("check-practice-test")).toBeEnabled();
  await page.getByTestId("check-practice-test").click();

  await expect(page.getByTestId("practice-score")).toContainText("1 of 2 correct · graded from this lesson's answer key");
  await expect(page.getByTestId("practice-result")).toHaveCount(2);
  await expect(page.getByTestId("practice-result").first()).toContainText("Not quite");
  await expect(page.getByTestId("practice-result").nth(1)).toContainText("Correct");
  await expect(page.getByTestId("practice-answer-key").first()).toContainText("6.626 x 10^-34 J s");
  await expect(page.getByTestId("practice-answer-key").nth(1)).toContainText("higher energy level");
  await expect(page.getByTestId("practice-checking")).toHaveCount(0);
  await expect(page.getByTestId("practice-sync")).toHaveText("Progress saved");
  expect(studio.counts().recordCalls).toBe(2);
  await page.screenshot({ path: "test-results/shots/practice-test-02-graded.png" });

  await page.getByTestId("practice-citation").first().click();
  await expect(page.getByRole("dialog", { name: "Document preview" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/practice-test-03-citation.png" });
});

test("grading still works while the provider is down and progress recording fails", async ({ page, request }) => {
  const studio = await mockStudio(page);
  const { course } = await createCourseWithLesson(request, `Offline practice ${Date.now()}`, "Quantum lesson");
  await openTestFromLibrary(page, course.title);

  await studio.failGeneration();
  await studio.failRecording();
  await choice(page, 0, 0).click();
  await choice(page, 1, 1).click();
  await page.getByTestId("check-practice-test").click();

  await expect(page.getByTestId("practice-score")).toContainText("2 of 2 correct");
  await expect(page.getByTestId("practice-result")).toHaveCount(2);
  await expect(page.getByTestId("practice-answer-key").first()).toContainText("6.626 x 10^-34 J s");
  await expect(page.getByTestId("practice-sync")).toContainText("Progress sync paused");
  await expect(page.getByTestId("practice-sync-retry")).toBeVisible();
  await expect(page.getByTestId("practice-test-error")).toHaveCount(0);
  await expect(page.getByTestId("practice-test")).not.toContainText("isn't responding");
  expect(studio.counts().recordCalls).toBe(2);
  await page.screenshot({ path: "test-results/shots/practice-test-04-provider-down.png" });
});

test("a provider failure is honest only on generation, with Retry still available", async ({ page, request }) => {
  const studio = await mockStudio(page, 503);
  const { course } = await createCourseWithLesson(request, `Offline generation ${Date.now()}`, "Quantum lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-practice").click();

  await expect(page.getByTestId("studio-error")).toContainText("isn't responding right now");
  await expect(page.getByTestId("studio-error")).not.toContainText("temporarily unavailable");
  await expect(page.getByTestId("studio-error-retry")).toBeVisible();
  await expect(page.getByTestId("studio-error-retry")).toHaveText("Try again");
  await page.screenshot({ path: "test-results/shots/practice-test-05-generation-retry.png" });

  await page.getByTestId("studio-error-retry").click();
  await expect(page.getByTestId("studio-error")).toBeVisible();
  expect(studio.counts().generateCalls).toBe(2);
});

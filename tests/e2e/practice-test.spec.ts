import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

const REF = "studyai://document/doc-1/page/1?chunk=0";
const EXCERPT = "Planck set h = 6.626 x 10^-34 J s in his quantum hypothesis.";
const questions = [
  { concept: "Quantum hypothesis", prompt: "What value did Planck set for h?", choices: [{ id: "a", text: "6.626 x 10^-34 J s" }, { id: "b", text: "9.8 m/s^2" }], correctChoice: "a", explanation: "Planck's constant is 6.626 x 10^-34 J s.", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: EXCERPT },
  { concept: "Photon absorption", prompt: "What happens when an electron absorbs a photon?", choices: [{ id: "a", text: "It moves to a lower level" }, { id: "b", text: "It moves to a higher level" }], correctChoice: "b", explanation: "Absorbing a photon raises the electron to a higher energy level.", sourceRef: REF, sourceDocumentId: "doc-1", sourcePage: 1, sourceExcerpt: EXCERPT },
];
const artifact = {
  id: "pt-1", courseId: "c", lessonId: "l", kind: "practice", title: "Practice test · Quantum",
  content: { cards: [], questions }, sourceRefs: [REF], createdAt: new Date().toISOString(), acceptance: "pending",
};

async function mockPracticeTest(page: Page) {
  const answers: Array<{ questionIndex: number; choiceId: string }> = [];
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(artifact) }));
  await page.route("**/api/study/practice-answer", async (route) => {
    const input = route.request().postDataJSON() as { questionIndex: number; choiceId: string };
    answers.push({ questionIndex: input.questionIndex, choiceId: input.choiceId });
    const question = questions[input.questionIndex];
    const correct = input.choiceId === question.correctChoice;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        duplicate: false, correct, selectedChoiceId: input.choiceId,
        correctChoiceId: question.correctChoice,
        correctAnswerText: question.choices.find((choice) => choice.id === question.correctChoice)?.text,
        explanation: question.explanation,
        source: { title: "c120 module", page: 1, excerpt: EXCERPT, sourceRef: REF },
        mastery: correct ? 0.6 : 0.2, dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
  });
  return answers;
}

test("one click makes a practice test; checking answers shows the key, score and clickable citations", async ({ page, request }) => {
  const answers = await mockPracticeTest(page);
  const { course } = await createCourseWithLesson(request, `Practice test ${Date.now()}`, "Quantum lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open quizzes and flashcards").click();
  await page.getByTestId("make-practice-test").click();
  await expect(page.getByTestId("practice-test")).toBeVisible();
  await expect(page.getByTestId("practice-question")).toHaveCount(2);
  await expect(page.getByTestId("practice-citation")).toHaveCount(2);
  await expect(page.getByTestId("practice-answer-key")).toHaveCount(0);
  await expect(page.getByTestId("practice-test-progress")).toHaveText("0 of 2 answered");
  await page.screenshot({ path: "test-results/shots/practice-test-01-built.png" });

  await page.getByTestId("practice-choice").nth(1).click();
  await page.getByTestId("practice-choice").nth(3).click();
  await expect(page.getByTestId("practice-test-progress")).toHaveText("2 of 2 answered");
  await expect(page.getByTestId("check-practice-test")).toBeEnabled();
  await page.getByTestId("check-practice-test").click();

  await expect(page.getByTestId("practice-checking")).toBeVisible();
  await expect(page.getByTestId("practice-score")).toContainText("1 of 2 correct");
  await expect(page.getByTestId("practice-result")).toHaveCount(2);
  await expect(page.getByTestId("practice-result").first()).toContainText("Not quite");
  await expect(page.getByTestId("practice-result").nth(1)).toContainText("Correct");
  await expect(page.getByTestId("practice-answer-key").first()).toContainText("6.626 x 10^-34 J s");
  await expect(page.getByTestId("practice-answer-key").nth(1)).toContainText("higher energy level");
  expect(answers).toEqual([{ questionIndex: 0, choiceId: "b" }, { questionIndex: 1, choiceId: "b" }]);
  await page.screenshot({ path: "test-results/shots/practice-test-02-graded.png" });

  await page.getByTestId("practice-citation").first().click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/shots/practice-test-03-citation.png" });
});

test("a practice artifact in the library opens as a test with an honest error and retry", async ({ page, request }) => {
  await mockPracticeTest(page);
  const { course } = await createCourseWithLesson(request, `Library practice ${Date.now()}`, "Quantum lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);

  await page.getByTestId("open-library").click();
  await page.getByTestId("library-open-studio").click();
  await page.getByTestId("studio-tab-practice").click();
  await page.getByTestId("studio-generate").click();
  await expect(page.getByTestId("practice-view")).toBeVisible();
  await page.getByTestId("take-practice-test").click();
  await expect(page.getByTestId("practice-test")).toBeVisible();

  await page.unroute("**/api/study/practice-answer");
  await page.route("**/api/study/practice-answer", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) }));
  await page.getByTestId("practice-choice").nth(0).click();
  await page.getByTestId("practice-choice").nth(2).click();
  await page.getByTestId("check-practice-test").click();
  await expect(page.getByTestId("practice-test-error")).toContainText("isn't responding right now");
  await expect(page.getByTestId("practice-retry")).toBeVisible();
  await expect(page.getByTestId("practice-test-error")).not.toContainText("temporarily unavailable");
  await page.screenshot({ path: "test-results/shots/practice-test-04-error.png" });
});

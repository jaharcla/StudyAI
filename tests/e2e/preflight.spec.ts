import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

const REF = "studyai://document/doc-1/page/1?chunk=0";
const EXCERPTS: Record<string, string> = {
  Nucleus: "DNA lives in the nucleus.",
  Energy: "Energy is stored in bonds.",
  Genetics: "Genes encode traits.",
};
const CONCEPTS = [
  { id: "c3", label: "Genetics", mastery: 0.7 },
  { id: "c1", label: "Nucleus", mastery: 0.2 },
  { id: "c2", label: "Energy", mastery: 0.5 },
];
const QUESTION = {
  presentationId: "presentation-1", questionId: "question-1", conceptId: "c1",
  concept: "Nucleus", prompt: "Where is DNA stored?",
  choices: [{ id: "a", text: "Nucleus" }, { id: "b", text: "Ribosome" }],
  source: { documentId: "doc-1", title: "Notes", page: 1, excerpt: EXCERPTS.Nucleus },
};

type Options = {
  concepts?: typeof CONCEPTS;
  ask?: unknown;
  graphError?: boolean;
};
function hit(sourceRef: string, excerpt: string) {
  return { documentId: "doc-1", title: "Notes", filename: "notes.txt", unitType: "page", unitNumber: 1, chunkIndex: 0, sourceRef, excerpt, score: 0.9 };
}

async function stubPreflight(page: Page, options: Options = {}) {
  let graphFailing = Boolean(options.graphError);
  await page.route(/\/api\/concepts\/graph/, (route) =>
    graphFailing
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Graph unavailable" }) })
      : route.fulfill({ json: { title: "Course", nodes: (options.concepts ?? CONCEPTS).map((item) => ({ ...item, parentId: null, lessonId: "lesson-1", lessonTitle: "Lesson 1", sourceRef: REF, canPractice: true })), edges: [] } }));

  await page.route(/\/api\/document-intelligence\/documents/, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    const excerpt = EXCERPTS[q];
    return route.fulfill({ json: { documents: [], results: excerpt ? [hit(REF, excerpt)] : [] } });
  });
  await page.route(/\/api\/study\/ask/, (route) =>
    route.fulfill({ json: options.ask === undefined ? QUESTION : options.ask }));
  return { setGraphFailure: (failed: boolean) => { graphFailing = failed; } };
}

async function openTodayWithCourse(page: Page, courseTitle: string, lessonTitle: string) {
  await page.goto("/");
  await selectCourseOnPage(page, courseTitle);
  await expect(page.getByRole("heading", { name: lessonTitle, exact: true })).toBeVisible();
  await page.getByTitle("Toggle courses").click();
  await page.getByTestId("open-today").click();
  await expect(page.getByTestId("today-surface")).toBeVisible();
}

test("Pre-flight shows three cited passages, one reviewed question and a start action", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Preflight ${Date.now()}`, "Warm up lesson");
  await stubPreflight(page);
  await openTodayWithCourse(page, course.title, lesson.title);

  await expect(page.getByTestId("preflight-card")).toBeVisible();
  await expect(page.getByTestId("preflight-item")).toHaveCount(3);
  await expect(page.getByTestId("preflight-excerpt")).toHaveText([
    EXCERPTS.Nucleus, EXCERPTS.Energy, EXCERPTS.Genetics,
  ]);
  await expect(page.getByTestId("preflight-citation")).toHaveCount(3);
  await expect(page.getByTestId("preflight-question")).toHaveText("Where is DNA stored?");
  await expect(page.getByTestId("preflight-start")).toBeEnabled();

  await page.getByTestId("preflight-start").click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
});

test("Pre-flight shows an honest empty state when no weak concept is available", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Preflight empty ${Date.now()}`, "Warm up lesson");
  await stubPreflight(page, { concepts: [] });
  await openTodayWithCourse(page, course.title, lesson.title);

  await expect(page.getByTestId("preflight-empty")).toBeVisible();
  await expect(page.getByTestId("preflight-empty")).toContainText("No weak concepts");
  await expect(page.getByTestId("preflight-item")).toHaveCount(0);
  await expect(page.getByTestId("preflight-start")).toHaveCount(0);
});

test("Pre-flight never shows a fake question when none has been reviewed", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Preflight no question ${Date.now()}`, "Warm up lesson");
  await stubPreflight(page, { ask: { status: "no-reviewed-questions", reason: "No reviewed questions for this lesson yet.", nextAction: { kind: "author-question", label: "Create a question from course text" } } });
  await openTodayWithCourse(page, course.title, lesson.title);

  await expect(page.getByTestId("preflight-item")).toHaveCount(3);
  await expect(page.getByTestId("preflight-question")).toHaveCount(0);
  await expect(page.getByTestId("preflight-no-question")).toContainText("Create a question from course text");
  await expect(page.getByTestId("preflight-start")).toHaveCount(0);
});

test("Pre-flight recovers from a failed graph call through retry", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Preflight retry ${Date.now()}`, "Warm up lesson");
  const control = await stubPreflight(page);
  control.setGraphFailure(true);
  await openTodayWithCourse(page, course.title, lesson.title);

  await expect(page.getByTestId("preflight-error")).toContainText("Graph unavailable");
  control.setGraphFailure(false);
  await page.getByTestId("preflight-retry").click();
  await expect(page.getByTestId("preflight-error")).toHaveCount(0);
  await expect(page.getByTestId("preflight-item")).toHaveCount(3);
  await expect(page.getByTestId("preflight-start")).toBeEnabled();
});

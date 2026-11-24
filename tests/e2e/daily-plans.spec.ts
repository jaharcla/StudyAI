import { expect, test } from "@playwright/test";
import { createCourseWithLesson } from "./helpers";

test("daily plans endpoint returns dated plan and validates course", async ({ request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Daily plan ${Date.now()}`, "Lesson home");
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "cell-notes.txt", content: "DNA lives in the nucleus." } });
  expect(document.ok()).toBeTruthy();
  const documentId = (await document.json()).id as string;
  const created = await request.post("/api/study/questions", {
    data: {
      courseId: course.id, lessonId: lesson.id, concept: "Cell biology",
      prompt: "What is true about Cell biology?",
      choices: [{ id: "a", text: "From the source" }, { id: "b", text: "A guess" }],
      correctChoice: "a", explanation: "The source describes Cell biology.",
      sourceDocumentId: documentId, sourceExcerpt: "DNA lives in the nucleus.", reviewed: true,
    },
  });
  expect(created.status()).toBe(201);

  const res = await request.get(`/api/daily-plans?course=${course.id}&lesson=${lesson.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.date).toBeTruthy();
  expect(body.courseId).toBe(course.id);
  expect(body.lessonId).toBe(lesson.id);
  expect(Array.isArray(body.items)).toBe(true);
  for (const item of body.items) {
    expect(item.day).toBeTruthy();
    expect(item.grounding).toMatch(/cited|derived/);
    if (item.source) {
      expect(item.source.title).toBeTruthy();
      expect(item.source.excerpt).toBeTruthy();
    }
  }

  const bad = await request.get("/api/daily-plans");
  expect(bad.status()).toBe(400);
});

import { selectCourseOnPage } from "./helpers";

async function seedReviewedLesson(request: import("@playwright/test").APIRequestContext, concepts: string[], title: string) {
  const { course, lesson } = await (await import("./helpers")).createCourseWithLesson(request, `Daily ${Date.now()} ${title}`, title);
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

test("daily plan shows one Coach prompt with a dated step line", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology", "Genetics"], "Lesson home");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
  await expect(page.getByTestId("coach-surface")).toBeVisible();

  await expect(page.getByTestId("coach-plan")).toContainText("step");
  await expect(page.getByTestId("coach-plan")).toContainText("of");
  await expect(page.getByTestId("coach-surface")).toHaveCount(1);
  await expect(page.getByTestId("coach-continue")).toHaveCount(1);

  const more = page.getByTestId("coach-more");
  await expect(more).toContainText("1 more");
  await more.click();
  await expect(page.getByTestId("coach-secondary")).toBeVisible();
});

test("Continue prepares the grounded destination from the daily plan", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology"], "Prepared destination");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();

  await page.getByTestId("coach-continue").click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
  await expect(page.getByTestId("coach-status")).toHaveText("Ready in Study. Your next question is loaded.");
});

test("switching lesson clears the plan line", async ({ page, request }) => {
  const { course, lesson } = await seedReviewedLesson(request, ["Cell biology"], "Lesson home");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
  await expect(page.getByTestId("coach-plan")).toBeVisible();
});

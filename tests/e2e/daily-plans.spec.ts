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

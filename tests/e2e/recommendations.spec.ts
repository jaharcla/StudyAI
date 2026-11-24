import { expect, test } from "@playwright/test";
import { createCourseWithLesson } from "./helpers";

// The Coach producer is verified at the HTTP contract level. Presentation and
// activation belong to the unified Coach surface, not to this feature.
test("GET /api/recommendations returns a cited, lesson-scoped prompt", async ({ request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Recommendations ${Date.now()}`, "Cell biology");
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "cell-notes.txt", content: "DNA lives in the nucleus." } });
  expect(document.ok()).toBeTruthy();
  const documentId = (await document.json()).id as string;
  const question = await request.post("/api/study/questions", { data: { courseId: course.id, lessonId: lesson.id, concept: "Cell biology", prompt: "Where is DNA located?", choices: [{ id: "nucleus", text: "Nucleus" }, { id: "ribosome", text: "Ribosome" }], correctChoice: "nucleus", explanation: "The source states DNA is in the nucleus.", sourceDocumentId: documentId, sourceExcerpt: "DNA lives in the nucleus.", reviewed: true } });
  expect(question.status()).toBe(201);

  const response = await request.get(`/api/recommendations?course=${course.id}&lesson=${lesson.id}`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.recommendations[0]).toMatchObject({
    kind: "review",
    concept: "Cell biology",
    lessonId: lesson.id,
    reason: expect.stringContaining("due"),
    action: { kind: "study", lessonId: lesson.id },
    source: { title: "cell-notes.txt", excerpt: "DNA lives in the nucleus." },
  });
  expect(body.recommendations.every((item: { lessonId: string }) => item.lessonId === lesson.id)).toBe(true);
});

test("a fresh lesson yields a cited Studio prompt and an unknown course yields none", async ({ request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Recommendations start ${Date.now()}`, "New lesson");
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "intro.txt", content: "This lesson introduces the scientific method." } });
  expect(document.ok()).toBeTruthy();

  const response = await request.get(`/api/recommendations?course=${course.id}&lesson=${lesson.id}`);
  const body = await response.json();
  expect(body.recommendations[0]).toMatchObject({ kind: "start", action: { kind: "studio" }, source: { title: "intro.txt" } });

  const empty = await request.get("/api/recommendations?course=unknown-course");
  expect(await empty.json()).toEqual({ recommendations: [] });
});

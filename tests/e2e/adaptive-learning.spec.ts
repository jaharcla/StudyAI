import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("adaptive study asks, grades, schedules, and resumes from persistent state", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Adaptive ${Date.now()}`, "Adaptive learning");
  const document = await request.post("/api/documents", { data: { courseId: course.id, name: "cell-biology.txt", content: "A cell contains DNA in its nucleus." } });
  expect(document.ok()).toBeTruthy();
  const documentId = (await document.json()).id as string;
  const question = await request.post("/api/study/questions", { data: { courseId: course.id, lessonId: lesson.id, concept: "Cell biology", prompt: "Where is DNA located?", choices: [{ id: "nucleus", text: "Nucleus" }, { id: "ribosome", text: "Ribosome" }], correctChoice: "nucleus", explanation: "The lesson source states DNA is in the nucleus.", sourceDocumentId: documentId, sourceExcerpt: "A cell contains DNA in its nucleus.", reviewed: true } });
  expect(question.status()).toBe(201);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Study this lesson" }).click();
  await page.getByRole("button", { name: "Ask a reviewed question" }).click();
  await expect(page.getByRole("heading", { name: "Where is DNA located?" })).toBeVisible();
  await page.getByRole("button", { name: "Nucleus", exact: true }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText("Review scheduled for", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Study this lesson" }).click();
  await expect(page.getByRole("button", { name: "Ask a reviewed question" })).toBeVisible();
  const attempts = await request.get(`/api/study/resume?course=${course.id}&lesson=${lesson.id}`);
  expect(await attempts.json()).toMatchObject({ phase: "ready", dueCard: { concept: "Cell biology" } });
});

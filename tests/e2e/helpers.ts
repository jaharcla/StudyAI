import type { APIRequestContext } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function createCourse(request: APIRequestContext, title: string, code = ""): Promise<{ id: string; title: string; code: string; color: string }> {
  const response = await request.post("/api/courses", { data: { title, code } });
  if (!response.ok()) throw new Error(`Course creation failed: ${await response.text()}`);
  return response.json();
}

export async function createLesson(request: APIRequestContext, courseId: string, title: string): Promise<{ id: string; title: string }> {
  const response = await request.post("/api/lessons", { data: { courseId, title } });
  if (!response.ok()) throw new Error(`Lesson creation failed: ${await response.text()}`);
  return response.json();
}

export async function createCourseWithLesson(request: APIRequestContext, courseTitle = `CHEM 120 ${Date.now()}`, lessonTitle = "Atomic structure & bonding") {
  const course = await createCourse(request, courseTitle, courseTitle);
  const lesson = await createLesson(request, course.id, lessonTitle);
  return { course, lesson };
}

export async function selectCourseOnPage(page: Page, title: string): Promise<void> {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.locator(".course-list").getByRole("button", { name: new RegExp(escaped) }).click();
}

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

export async function drawCarbonDioxide(page: Page, leaveInspectorOpen = true): Promise<void> {
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  const y = box.y + 200, left = box.x + 280;
  for (const [index, element] of ["O", "C", "O"].entries()) {
    await page.getByRole("combobox", { name: "Placement element", exact: true }).selectOption(element);
    await page.mouse.click(left + index * 80, y);
  }
  await page.getByRole("button", { name: "Connect atoms", exact: true }).click();
  await page.getByRole("combobox", { name: "Drawing bond order", exact: true }).selectOption("2");
  await page.locator('[data-element="O"] .atom-hit').first().click();
  await page.locator('[data-element="C"] .atom-hit').click();
  await page.locator('[data-element="C"] .atom-hit').click();
  await page.locator('[data-element="O"] .atom-hit').last().click();
  await page.getByRole("button", { name: "Place atoms", exact: true }).click();
  for (const oxygen of [page.locator('[data-element="O"] .atom-hit').first(), page.locator('[data-element="O"] .atom-hit').last()]) {
    await oxygen.click();
    await page.getByRole("button", { name: "Add lone pair", exact: true }).click();
    await page.getByRole("button", { name: "Add lone pair", exact: true }).click();
  }
  await page.getByRole("button", { name: "Finish molecule", exact: true }).click();
  await page.getByRole("button", { name: "Inspect molecule", exact: true }).click();
  await page.getByLabel("Molecule name", { exact: true }).fill("Carbon dioxide");
  if (!leaveInspectorOpen) await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
}

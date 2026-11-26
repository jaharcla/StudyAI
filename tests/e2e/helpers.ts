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
  // Course intake shows its own loading shell; wait for the ready shell first.
  const toggle = page.getByTitle("Toggle courses");
  await toggle.waitFor({ state: "visible" });
  // The immersive shell keeps courses in a slide-over until the hamburger opens it.
  if (!(await page.locator(".app-shell").evaluate((el) => el.classList.contains("sidebar-open")))) {
    await toggle.click();
  }
  const showMore = page.getByRole("button", { name: /Show \d+ more courses/ });
  while (await showMore.isVisible()) await showMore.click();
  await page.locator(".course-list button.course-item").filter({ hasText: new RegExp(escaped) }).click();
}

export async function drawCarbonDioxide(page: Page, leaveInspectorOpen = true): Promise<void> {
  const closeLewis = page.getByRole("button", { name: "Close Lewis tools", exact: true });
  if (await closeLewis.isVisible()) await closeLewis.click();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  const y = box.y + 300, left = box.x + 560;
  for (const [index, element] of ["O", "C", "O"].entries()) {
    // A board load or tool event can dismiss the Lewis panel between placements.
    if (!(await page.getByTestId(`lewis-element-row-${element}`).isVisible())) {
      const reopen = page.getByRole("button", { name: "Open canvas tools", exact: true });
      if (await reopen.isVisible()) await reopen.click();
      await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
    }
    await page.getByTestId("lewis-place").click();
    await page.getByTestId(`lewis-element-row-${element}`).click();
    await page.mouse.click(left + index * 120, y);
  }
  await page.getByTestId("lewis-connect").click();
  await page.getByTestId("lewis-bond-row-toggle").click();
  await page.getByTestId("lewis-bond-2").click();
  await page.locator('[data-element="O"] .atom-hit').first().click();
  await page.locator('[data-element="C"] .atom-hit').click();
  await page.locator('[data-element="C"] .atom-hit').click();
  await page.locator('[data-element="O"] .atom-hit').last().click();
  await page.getByTestId("lewis-place").click();
  for (const oxygen of [page.locator('[data-element="O"] .atom-hit').first(), page.locator('[data-element="O"] .atom-hit').last()]) {
    await oxygen.click();
    await page.getByTestId("radial-add-pair").click();
    await page.getByTestId("radial-add-pair").click();
  }
  await page.getByTestId("lewis-finish").click();
  await page.getByTestId("lewis-inspect").click();
  await page.getByLabel("Molecule name", { exact: true }).fill("Carbon dioxide");
  if (!leaveInspectorOpen) await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
}

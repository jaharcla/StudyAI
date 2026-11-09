import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function openActivityLibrary(page: Page, courseTitle: string) {
  await page.goto("/");
  await selectCourseOnPage(page, courseTitle);
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Learning activities" })).toBeVisible();
}

async function addSource(request: APIRequestContext, courseId: string, lessonId: string) {
  const content = "Net force equals mass times acceleration. Acceleration is the slope of a velocity-time graph. Final velocity equals initial velocity plus acceleration multiplied by elapsed time. For a linear graph, slope measures rise over run and the y-intercept is the value at x equals zero.";
  const response = await request.post("/api/document-intelligence/import", { data: { courseId, lessonId, files: [{ name: "Motion and graphs.txt", contentBase64: Buffer.from(content).toString("base64") }] } });
  if (!response.ok()) throw new Error(`Course material import failed: ${await response.text()}`);
}

async function selectSourceAndTemplate(page: Page, template: "force" | "graph") {
  await page.getByRole("textbox", { name: "Search course sources" }).fill(template === "force" ? "net force acceleration" : "linear graph slope");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Motion and graphs/ }).first().click();
  await page.getByRole("button", { name: `Use in ${template} template`, exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "generated canvas validated" })).toBeVisible();
}

test("force activity edits a model, checks it, records evidence, and resumes", async ({ page, request }) => {
  test.setTimeout(180_000);
  const { course, lesson } = await createCourseWithLesson(request, `Activity force ${Date.now()}`, "Activity force");
  await addSource(request, course.id, lesson.id);
  await openActivityLibrary(page, course.title);
  await selectSourceAndTemplate(page, "force");
  await expect(page.getByText(/6 generated canvas objects/)).toBeVisible();
  await page.getByRole("button", { name: "Save and start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use the signed horizontal forces and mass to predict acceleration in m\/s²\." })).toBeVisible();
  await expect(page.locator(".canvas-board-button")).toContainText("Activity · Force and motion");

  await page.locator('[data-kind="force"]').first().dblclick();
  const editor = page.locator(".canvas-object-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("x", { exact: true }).fill("10");
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("textbox", { name: "Activity answer" }).fill("4");
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("The numeric relationship matches the supported one-dimensional model.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Using the current model, predict velocity after 2 seconds in m/s\." })).toBeVisible();
  await page.getByRole("textbox", { name: "Activity answer" }).fill("11");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Update the linked graph so its slope matches the current force model, then enter that slope in m/s²\." })).toBeVisible();
  await page.locator('[data-kind="equation"]').dblclick();
  const equationEditor = page.locator(".canvas-object-editor");
  await expect(equationEditor).toBeVisible();
  await equationEditor.getByRole("spinbutton", { name: "Math parameter m", exact: true }).fill("4");
  await equationEditor.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("textbox", { name: "Activity answer" }).fill("4");
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make the graph's y-intercept match the current initial velocity, then enter the intercept in m/s\." })).toBeVisible();
  await page.getByRole("textbox", { name: "Activity answer" }).fill("3");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("All tasks complete")).toBeVisible();

  await page.getByRole("button", { name: "Close activity", exact: true }).click();
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect(page.getByText("All tasks complete")).toBeVisible();
  const attempts = await request.get(`/api/activities?course=${course.id}&lesson=${lesson.id}`);
  const values = await attempts.json();
  expect(values.attempts[0].attempt).toMatchObject({ status: "completed", responses: [{ result: { status: "correct" } }, { result: { status: "correct" } }, { result: { status: "correct" } }, { result: { status: "correct" } }] });
});

test("graph activity constructs a linked function, checks its interpretation, and resumes", async ({ page, request }) => {
  test.setTimeout(180_000);
  const { course, lesson } = await createCourseWithLesson(request, `Activity graph ${Date.now()}`, "Activity graph");
  await addSource(request, course.id, lesson.id);
  await openActivityLibrary(page, course.title);
  await selectSourceAndTemplate(page, "graph");
  await expect(page.getByText(/2 generated canvas objects/)).toBeVisible();
  await page.getByRole("button", { name: "Save and start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What is the slope of the current linked graph\?" })).toBeVisible();
  await expect(page.locator('[data-kind="equation"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="graph"]')).toHaveCount(1);

  await page.locator('[data-kind="equation"]').dblclick();
  const equationEditor = page.locator(".canvas-object-editor");
  await expect(equationEditor).toBeVisible();
  await equationEditor.getByRole("spinbutton", { name: "Math parameter m", exact: true }).fill("4");
  await equationEditor.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("textbox", { name: "Activity answer" }).fill("4");
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("The answer matches the linked graph equation.")).toBeVisible();
  await expect(page.getByText("All tasks complete")).toBeVisible();
  await page.getByRole("button", { name: "Close activity", exact: true }).click();
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect(page.getByText("All tasks complete")).toBeVisible();
  const attempts = await request.get(`/api/activities?course=${course.id}&lesson=${lesson.id}`);
  const values = await attempts.json();
  expect(values.attempts[0].attempt).toMatchObject({ status: "completed", responses: [{ response: "4", result: { status: "correct" } }] });
});

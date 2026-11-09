import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function chooseTool(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Open canvas tools", exact: true }).isVisible()) await page.getByRole("button", { name: "Open canvas tools", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function readDocument(request: APIRequestContext, courseId: string, lessonId: string) {
  const boards = await (await request.get(`/api/canvases?course=${courseId}&lesson=${lessonId}`)).json();
  return JSON.parse((await (await request.get(`/api/canvases/${boards[0].id}?course=${courseId}&lesson=${lessonId}`)).json()).document);
}

async function typeLatex(page: Page, latex: string) {
  const field = page.locator('math-field[aria-label="Math notation"]');
  await field.evaluate((element, value) => {
    const mathField = element as HTMLElement & { value: string };
    mathField.value = value as string;
    mathField.dispatchEvent(new Event("input", { bubbles: true }));
  }, latex);
  return field.evaluate((element) => (element as HTMLElement & { getValue: (format: string) => string }).getValue("ascii-math"));
}

test("MathLive ASCII round-trips, parameters update linked SVG graphs, and legacy Quickdraw stays available", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await chooseTool(page, "Equation"); await page.mouse.click(box.x + 300, box.y + 180);
  await page.getByRole("button", { name: "Inspect selected object", exact: true }).click();
  await page.getByRole("button", { name: "Open MathLive editor", exact: true }).click();
  const field = page.locator('math-field[aria-label="Math notation"]');
  await expect(field).toBeVisible();

  const fraction = await typeLatex(page, "\\frac{1}{2}");
  expect(fraction.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Apply notation", exact: true }).click();
  await expect(page.locator(".expression-result")).toHaveText("Result: 0.5");

  const root = await typeLatex(page, "\\sqrt{x}");
  expect(root.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Apply notation", exact: true }).click();
  await expect(page.locator(".math-workspace-expression")).toContainText("sqrt");

  const exponent = await typeLatex(page, "x^{2} + a");
  expect(exponent.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Apply notation", exact: true }).click();
  await field.focus();
  await field.press("Control+A");
  await field.pressSequentially("x^2+a");
  const keyboardExpression = await field.evaluate((element) => (element as HTMLElement & { getValue: (format: string) => string }).getValue("ascii-math"));
  expect(keyboardExpression).toContain("x");
  await page.getByRole("button", { name: "Apply notation", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Math parameter a", exact: true }).fill("4");
  await page.getByRole("button", { name: "Create linked graph", exact: true }).click();
  await expect(page.locator('[data-kind="graph"]')).toHaveCount(1);
  const graph = page.locator('[data-kind="graph"]');
  await expect.poll(async () => (await readDocument(request, course.id, lesson.id)).objects.find((object: { kind: string }) => object.kind === "graph")?.points).toContainEqual([0, 4]);
  await page.getByRole("button", { name: "Inspect selected object", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Math parameter a", exact: true }).fill("6");
  await expect.poll(async () => (await readDocument(request, course.id, lesson.id)).objects.find((object: { kind: string }) => object.kind === "graph")?.points).toContainEqual([0, 6]);

  const beforeInvalid = (await readDocument(request, course.id, lesson.id)).objects.find((object: { kind: string }) => object.kind === "equation").expression;
  await page.getByRole("button", { name: "Open MathLive editor", exact: true }).click();
  await typeLatex(page, "\\frac{1}{");
  const malformed = await field.evaluate((element) => (element as HTMLElement & { getValue: (format: string) => string }).getValue("ascii-math"));
  expect(malformed.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Apply notation", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await readDocument(request, course.id, lesson.id)).objects.find((object: { kind: string }) => object.kind === "equation").expression).toBe(beforeInvalid);

  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.locator('[data-kind="equation"]')).toHaveCount(1);
  await expect(graph).toHaveCount(1);
  const saved = await readDocument(request, course.id, lesson.id);
  const equation = saved.objects.find((object: { kind: string }) => object.kind === "equation");
  expect(equation).toMatchObject({ mathWorkspace: { schemaVersion: 1, parameters: { a: { value: 6 } }, expressionAst: expect.any(Object) } });
  expect(saved.objects.find((object: { kind: string }) => object.kind === "graph")).toMatchObject({ sourceEquationId: equation.id, points: expect.arrayContaining([[0, 6]]) });
  await expect(page.locator(".quickdraw-native")).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1800, height: 1100 } });
test.setTimeout(120_000);
async function tool(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Open canvas tools", exact: true }).isVisible()) await page.getByRole("button", { name: "Open canvas tools", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}

test("measurements and connections follow concepts; native shapes anchor forces; history and reload retain references", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const read = async () => { const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json(); return JSON.parse((await (await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`)).json()).document); };
  const box = (await page.locator(".canvas-board").boundingBox())!;
  for (const x of [270, 600]) {
    await tool(page, "Concept"); await page.mouse.click(box.x + x, box.y + 200);
    await expect(page.locator(".canvas-object-editor")).toHaveCount(0);
  }
  const concepts = page.locator('[data-kind="concept"]');
  await expect(concepts).toHaveCount(2);
  await tool(page, "Relationship"); await drag(page, box.x + 300, box.y + 200, 270, 0);
  await tool(page, "Measurement"); await drag(page, box.x + 270, box.y + 225, 330, 0);
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "measurement")?.value).toBe(330);
  const initial = await read();
  const relation = initial.objects.find((o: { kind: string }) => o.kind === "relationship");
  expect(relation.geometry.tailRef.id).toBe(initial.objects[0].id); expect(relation.geometry.tipRef.id).toBe(initial.objects[1].id);
  await drag(page, box.x + 650, box.y + 170, 40, 50);
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "measurement")?.value).toBeCloseTo(Math.hypot(370, 50), 3);
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "relationship")?.geometry.tip).toEqual({ x: relation.geometry.tip.x + 40, y: relation.geometry.tip.y + 50 });
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "measurement")?.value).toBe(330);
  await page.getByRole("button", { name: "Redo canvas change", exact: true }).click();
  await tool(page, "Shapes"); await drag(page, box.x + 270, box.y + 350, 100, 80);
  await tool(page, "Force"); await drag(page, box.x + 320, box.y + 350, 0, -80);
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "force")?.geometry.tailRef?.scope).toBe("quickdraw");
  const before = (await read()).objects.find((o: { kind: string }) => o.kind === "force");
  await tool(page, "Select and move"); await drag(page, box.x + 270, box.y + 390, 45, 25);
  await expect.poll(async () => (await read()).objects.find((o: { kind: string }) => o.kind === "force")?.pointOfApplication).toEqual({ x: before.geometry.tail.x + 45, y: before.geometry.tail.y + 25 });
  expect((await read()).objects.find((o: { kind: string }) => o.kind === "force").components).toEqual(before.components);
  const saved = await read();
  await page.reload(); await expect(page.locator('[data-kind="force"]')).toHaveCount(1);
  expect((await read()).objects).toEqual(saved.objects);
  await expect(page.locator(".canvas-object-editor")).toHaveCount(0);
});

test("places equations and graphs, evaluates variables, traces/resizes plots, and persists mathematical edits", async ({ page, request }, testInfo) => {
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await tool(page, "Equation"); await expect(page.locator('[data-kind="equation"]')).toHaveCount(0);
  await page.mouse.click(box.x + 300, box.y + 180);
  await page.getByRole("button", { name: "Inspect selected object", exact: true }).click();
  await page.getByRole("textbox", { name: "Equation", exact: true }).fill("a*sqrt(b)");
  await page.getByLabel("Variable a", { exact: true }).fill("3"); await page.getByLabel("Variable b", { exact: true }).fill("16");
  await expect(page.locator(".expression-result")).toHaveText("Result: 12");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-kind="equation"]')).toContainText("= 12");
  await tool(page, "Graph data"); await page.mouse.click(box.x + 550, box.y + 350);
  await page.getByRole("button", { name: "Inspect selected object", exact: true }).click();
  await page.getByLabel("Graph expression", { exact: true }).fill("2*x+1");
  await expect(page.locator(".expression-result")).toHaveText("121 sampled points");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done", exact: true }).click();
  const graph = page.locator('[data-kind="graph"]');
  await graph.locator(".graph-surface").hover(); await expect(graph.locator(".graph-trace")).toBeVisible();
  const handle = (await graph.locator("[data-resize]").boundingBox())!;
  const oldWidth = (await graph.locator(".graph-surface").boundingBox())!.width;
  await drag(page, handle.x + 5, handle.y + 5, 35, 20);
  await expect.poll(async () => (await graph.locator(".graph-surface").boundingBox())!.width).toBeCloseTo(oldWidth + 70, 0);
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved");
  await page.reload(); await expect(page.locator('[data-kind="equation"]')).toContainText("= 12");
  const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json();
  const doc = JSON.parse((await (await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`)).json()).document);
  expect(doc.objects[1].points).toContainEqual([0, 1]);
  expect(doc.objects[1].expression).toBe("2*x+1");
  expect(doc.objects[0]).toMatchObject({ variables: { a: 3, b: 16 }, result: 12 });
  if (await page.getByRole("button", { name: "Collapse canvas tools", exact: true }).isVisible()) await page.getByRole("button", { name: "Collapse canvas tools", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("equation-graph.png") });
});

test("remaining tools place on click, retain scientific stacking, and open inspectors only explicitly", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  for (const name of ["Anatomy label", "Concept", "Practice question", "Flashcard"]) {
    const count = await page.locator("[data-scientific-id]").count();
    await tool(page, name); await expect(page.locator("[data-scientific-id]")).toHaveCount(count);
    await page.mouse.click(box.x + 350, box.y + 230);
    await expect(page.locator("[data-scientific-id]")).toHaveCount(count + 1);
    await expect(page.locator(".canvas-object-editor")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Send scientific object to back", exact: true }).click();
  await expect(page.locator("[data-scientific-id]").first()).toHaveAttribute("data-kind", "flashcard");
  await page.locator('[data-kind="question"] .scene-node').dblclick();
  await expect(page.locator(".canvas-object-editor")).toBeVisible();
});

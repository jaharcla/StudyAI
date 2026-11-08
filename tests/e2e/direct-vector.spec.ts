import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
}
async function tool(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Open canvas tools", exact: true }).isVisible()) await page.getByRole("button", { name: "Open canvas tools", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("vectors and forces draw at the pointer, manipulate endpoints, inspect, pan/zoom, undo and reload", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request);
  await page.goto("/"); await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const read = async () => { const boards = await (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`)).json(); const row = await (await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`)).json(); return JSON.parse(row.document); };
  await tool(page, "Vector");
  await expect(page.locator('[data-kind="vector"]')).toHaveCount(0);
  const box = (await page.locator(".canvas-board").boundingBox())!;
  const tail = { x: box.x + 280, y: box.y + 170 }, tip = { x: tail.x + 120, y: tail.y - 60 };
  await page.mouse.move(tail.x, tail.y); await page.mouse.down(); await page.mouse.move(tip.x, tip.y, { steps: 6 });
  await expect(page.locator('[data-kind="vector"]')).toHaveCount(1);
  expect((await read()).objects).toHaveLength(0);
  await page.mouse.up();
  await expect.poll(async () => (await read()).objects[0]?.components).toEqual([120, 60, 0]);
  const arrow = page.locator('[data-kind="vector"]');
  const handle = (await arrow.locator('[data-endpoint="tip"]').boundingBox())!;
  await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: tip.x + 30, y: tip.y + 40 });
  await expect.poll(async () => (await read()).objects[0]?.components).toEqual([150, 20, 0]);
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => (await read()).objects[0]?.components).toEqual([120, 60, 0]);
  await page.getByRole("button", { name: "Redo canvas change", exact: true }).click();
  await expect.poll(async () => (await read()).objects[0]?.components).toEqual([150, 20, 0]);
  await arrow.locator(".science-hit").dblclick();
  await page.getByLabel("x", { exact: true }).fill("200"); await page.getByLabel("y", { exact: true }).fill("80");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await read()).objects[0]?.components).toEqual([200, 80, 0]);
  const beforeMove = (await read()).objects[0];
  const line = (await arrow.locator(".science-hit").boundingBox())!;
  await drag(page, { x: line.x + line.width / 2, y: line.y + line.height / 2 }, { x: line.x + line.width / 2 + 40, y: line.y + line.height / 2 + 25 });
  await expect.poll(async () => (await read()).objects[0]?.geometry.tail.x).toBe(beforeMove.geometry.tail.x + 40);
  expect((await read()).objects[0].components).toEqual([200, 80, 0]);
  const saved = (await read()).objects[0];
  await tool(page, "Pan canvas");
  const screenBefore = (await arrow.locator(".science-arrow-line").boundingBox())!;
  await drag(page, { x: box.x + 600, y: box.y + 240 }, { x: box.x + 650, y: box.y + 270 });
  await expect.poll(async () => (await arrow.locator(".science-arrow-line").boundingBox())!.x).toBeCloseTo(screenBefore.x + 50, 0);
  await page.mouse.move(box.x + 400, box.y + 180); await page.keyboard.down("Control"); await page.mouse.wheel(0, -120); await page.keyboard.up("Control");
  await expect.poll(async () => arrow.locator(".science-arrow-line").evaluate((line) => (line as unknown as SVGGraphicsElement).getScreenCTM()!.a)).toBeGreaterThan(1);
  expect((await read()).objects[0]).toEqual(saved);
  await page.reload(); await expect(arrow).toHaveCount(1);
  expect((await read()).objects[0]).toEqual(saved);
  await tool(page, "Force");
  const fresh = (await page.locator(".canvas-board").boundingBox())!;
  await drag(page, { x: fresh.x + 480, y: fresh.y + 240 }, { x: fresh.x + 480, y: fresh.y + 130 });
  await expect.poll(async () => (await read()).objects[1]?.components).toEqual([0, 110, 0]);
  expect((await read()).objects[1]).toMatchObject({ units: "", pointOfApplication: (await read()).objects[1].geometry.tail });
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click(); await expect(page.locator('[data-kind="force"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Redo canvas change", exact: true }).click(); await expect(page.locator('[data-kind="force"]')).toHaveCount(1);
  await tool(page, "Freehand pen"); await drag(page, { x: fresh.x + 70, y: fresh.y + 250 }, { x: fresh.x + 130, y: fresh.y + 290 });
  await expect.poll(async () => Object.keys((await read()).snapshot.document.store).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => Object.keys((await read()).snapshot.document.store).length).toBe(0);
  await expect(page.locator('[data-kind="vector"]')).toHaveCount(1);
});

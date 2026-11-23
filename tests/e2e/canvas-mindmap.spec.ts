import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("mind map places as a glyph, drags as one unit, and persists across reload", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Mindmap ${Date.now()}`, "Mindmap lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Mind map", exact: true }).click();
  const board = page.locator(".canvas-board");
  const box = (await board.boundingBox())!;
  await board.click({ position: { x: box.width / 2, y: box.height / 2 } });

  const root = page.getByTestId("mindmap-root");
  await expect(root).toBeVisible();
  await expect(root.getByTestId("mindmap-node-n0")).toBeVisible();
  await expect(root.getByTestId("mindmap-node-n1")).toBeVisible();
  await expect(root.getByTestId("mindmap-node-n2")).toBeVisible();
  await expect(root.getByText("Branch one")).toBeVisible();
  await expect(root.getByText("Branch two")).toBeVisible();
  await expect(root.locator("line")).toHaveCount(2);

  const before = (await root.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 50, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = await root.boundingBox();
    return after !== null && Math.abs(after.x - before.x) > 30;
  }, { timeout: 5_000 }).toBe(true);

  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 15_000 });
  const rows = await request.get(`/api/canvases?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  expect(rows.length).toBe(1);
  const saved = await request.get(`/api/canvases/${encodeURIComponent(rows[0].id)}?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`).then((response) => response.json());
  const document = JSON.parse(saved.document);
  expect(document.objects.some((object: { kind: string }) => object.kind === "mindmap")).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(root.getByText("Branch one")).toBeVisible({ timeout: 20_000 });
});

import { expect, test } from "@playwright/test";
import { createCourse, createCourseWithLesson, createLesson, drawCarbonDioxide, selectCourseOnPage } from "./helpers";

test("switching canvas tools mid-drag ends the active gesture", async ({ page }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await drawCarbonDioxide(page, false);

  const object = page.locator("[data-scientific-id]").first();
  const board = (await page.locator(".canvas-board").boundingBox())!;
  const native = page.locator(".quickdraw-native").first();
  const position = async () => {
    const box = (await object.boundingBox())!;
    return { x: Math.round(box.x), y: Math.round(box.y) };
  };
  const startX = board.x + Math.min(board.width - 80, 700);
  const startY = board.y + 80;

  await page.getByRole("button", { name: "Hand — H", exact: true }).click();
  await native.focus();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 100, { steps: 8 });
  const afterPan = await position();

  // Quickdraw's setTool() leaves its pointer session alive; the app must end it.
  await native.focus();
  await page.keyboard.press("d");
  await page.mouse.move(startX + 250, startY + 250, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Draw — D", exact: true })).toHaveClass(/on/);
  expect(await position()).toEqual(afterPan);
});

test("canvas creates, calculates, saves, reloads, and separates boards by course", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(page.request);
  const otherCourse = await createCourse(page.request, `BIOL 130 ${Date.now()}`, "Cell biology");
  await createLesson(page.request, otherCourse.id, "Cell structure");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("heading", { name: "Atomic structure & bonding", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  await page.getByRole("button", { name: "Choose canvas board" }).click();
  await page.getByRole("button", { name: "New board" }).click();
  await expect(page.locator("[data-scientific-id], .canvas-object")).toHaveCount(0);

  await drawCarbonDioxide(page);
  await expect(page.getByRole("heading", { name: "Carbon dioxide" })).toBeVisible();
  await page.getByRole("button", { name: "Convert with OpenChemLib" }).click();
  await expect(page.getByText("OpenChemLib SMILES: O=C=O")).toBeVisible();
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();
  await expect(page.locator("[data-scientific-id], .canvas-object").getByText("3 atoms · 2 bonds · 1 form")).toBeVisible();
  await expect(page.locator(".top-actions .saved")).toHaveText("All changes saved", { timeout: 10_000 });

  const boardsResponse = await page.request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`);
  const boards = await boardsResponse.json();
  const board = boards[0];
  const savedResponse = await page.request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`);
  const saved = await savedResponse.json();
  expect(JSON.parse(saved.document).objects[0].kind).toBe("molecule");

  await page.reload();
  await expect(page.locator("[data-scientific-id], .canvas-object").getByText("3 atoms · 2 bonds · 1 form")).toBeVisible();
  await page.getByRole("button", { name: "Choose canvas board" }).click();
  await page.getByRole("button", { name: "New board" }).click();
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toContainText("Board");
  await expect(page.locator("[data-scientific-id], .canvas-object")).toHaveCount(0);

  await selectCourseOnPage(page, otherCourse.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toContainText("Board 1");
  await expect(page.locator("[data-scientific-id], .canvas-object")).toHaveCount(0);
});

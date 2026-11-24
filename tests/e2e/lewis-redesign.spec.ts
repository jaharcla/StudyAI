import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function openLewis(page: import("@playwright/test").Page, courseTitle: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, courseTitle);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  return page.getByRole("toolbar", { name: "Lewis tools" });
}

test("Lewis panel slides out beside the main palette and closes and reopens cleanly", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Lewis dock ${Date.now()}`, "Bonding");
  const sidebar = await openLewis(page, course.title);
  const palette = page.locator(".canvas-tool-palette");
  await expect(palette).toBeVisible();
  await expect(sidebar).toBeVisible();
  const panel = (await palette.boundingBox())!;
  const dock = (await sidebar.boundingBox())!;
  expect(dock.x).toBeGreaterThanOrEqual(panel.x + panel.width);
  expect(dock.x - (panel.x + panel.width)).toBeLessThan(24);
  await expect(page.getByTestId("lewis-element-row-C")).toBeVisible();
  await expect(page.getByTestId("lewis-place")).toBeVisible();
  await expect(page.getByTestId("lewis-finish")).toBeVisible();

  await page.getByRole("button", { name: "Close Lewis tools", exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(palette).toBeVisible();

  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId("lewis-element-row-O")).toBeVisible();
});

test("radial actions surround the atom, are keyboard reachable, and change lone pairs", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Radial craft ${Date.now()}`, "Bonding");
  await openLewis(page, course.title);
  await page.getByTestId("lewis-element-row-O").click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.click(box.x + 600, box.y + 520);

  const radial = page.getByTestId("radial-actions");
  await expect(radial).toBeVisible();
  for (const id of ["radial-add-pair", "radial-remove-pair", "radial-element", "radial-charge", "radial-remove", "radial-bond-from", "radial-bond-order", "radial-resonance"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const center = await radial.evaluate((element) => ({ x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top) }));
  const atom = (await page.locator('[data-element="O"] .atom-hit').boundingBox())!;
  const board = (await page.locator(".canvas-board").boundingBox())!;
  expect(Math.abs(board.x + center.x - (atom.x + atom.width / 2))).toBeLessThan(40);
  expect(Math.abs(board.y + center.y - (atom.y + atom.height / 2))).toBeLessThan(60);

  const before = await page.locator('[data-element="O"] .lone-electron').count();
  const add = page.getByTestId("radial-add-pair");
  await add.focus();
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-element="O"] .lone-electron').first()).toBeVisible();
  expect(await page.locator('[data-element="O"] .lone-electron').count()).toBeGreaterThan(before);
});

test("bond order chosen in the panel is applied to a new bond", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Bond craft ${Date.now()}`, "Bonding");
  await openLewis(page, course.title);
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await page.getByTestId("lewis-element-row-O").click();
  await page.mouse.click(box.x + 600, box.y + 460);
  await page.getByTestId("lewis-element-row-C").click();
  await page.mouse.click(box.x + 760, box.y + 460);
  await page.getByTestId("lewis-bond-row-toggle").click();
  await page.getByTestId("lewis-bond-2").click();
  await expect(page.getByTestId("lewis-bond-row-toggle")).toContainText("Double");
  await page.getByTestId("lewis-connect").click();
  await page.locator('[data-element="O"] .atom-hit').click();
  await page.locator('[data-element="C"] .atom-hit').click();
  await expect(page.locator('[data-bond-id][data-order="2"]')).toHaveCount(1);
});

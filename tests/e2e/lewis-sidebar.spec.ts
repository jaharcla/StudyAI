import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("Lewis tool opens a sidebar with bond orders and element rows", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Lewis ${Date.now()}`, "Lewis lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Lewis tools" })).toBeVisible();
  await expect(page.getByTestId("lewis-bond-row")).toBeVisible();
  await expect(page.getByTestId("lewis-element-row-O")).toBeVisible();
  await page.getByTestId("lewis-element-row-N").click();
  const board = page.locator(".canvas-board");
  const box = (await board.boundingBox())!;
  await page.mouse.click(box.x + 360, box.y + 220);
  await expect(page.locator('[data-kind="molecule"]')).toBeVisible();
  await expect(page.locator('[data-kind="molecule"] [data-element="N"]')).toHaveCount(1);
  await page.getByTestId("lewis-bond-row-toggle").click();
  await expect(page.getByTestId("lewis-bond-2")).toBeVisible();
  await expect(page.getByTestId("lewis-bond-3")).toBeVisible();
  await page.getByTestId("lewis-bond-2").click();
});

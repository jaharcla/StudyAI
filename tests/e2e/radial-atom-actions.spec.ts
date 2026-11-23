import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("radial actions appear around a selected atom and can add a lone pair", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Radial ${Date.now()}`, "Radial lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  await page.getByTestId("lewis-element-row-O").click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.click(box.x + 360, box.y + 220);
  await expect(page.getByTestId("radial-actions")).toBeVisible();
  await expect(page.getByTestId("radial-add-pair")).toBeVisible();
  const before = await page.locator('[data-element="O"] .lone-electron').count();
  await page.getByTestId("radial-add-pair").click();
  await expect(page.locator('[data-element="O"] .lone-electron').first()).toBeVisible();
  expect(await page.locator('[data-element="O"] .lone-electron').count()).toBeGreaterThan(before);
});

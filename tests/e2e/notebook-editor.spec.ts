import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("the object editor keeps all molecule controls in notebook styling", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Notebook editor ${Date.now()}`, "Notebook lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Lewis structure", exact: true }).click();
  await page.getByTestId("lewis-element-row-O").click();
  const box = (await page.locator(".canvas-board").boundingBox())!;
  await page.mouse.click(box.x + 560, box.y + 260);
  await page.getByTestId("lewis-inspect").click();
  const editor = page.locator(".canvas-object-editor.notebook-editor");
  await expect(editor.getByRole("combobox", { name: "Resonance form" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Add atom" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Add bond" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Convert with OpenChemLib" })).toBeVisible();
  const bg = await editor.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(bg).toBe("rgb(255, 253, 247)");
});

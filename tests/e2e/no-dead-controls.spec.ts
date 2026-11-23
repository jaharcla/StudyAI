import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(90000);

test("no control advertises an unavailable feature", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Controls ${Date.now()}`, "Controls lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  await expect(page.locator('[title*="not available yet"]')).toHaveCount(0);
});

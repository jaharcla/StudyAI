import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("the canvas uses lab-notebook paper", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Lab paper ${Date.now()}`, "Lab paper lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".canvas-viewport.lab-paper")).toBeVisible();
  const background = await page.locator(".canvas-viewport.lab-paper").evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain("radial-gradient");
});

import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(90000);

async function openStudyStage(page: import("@playwright/test").Page, courseTitle: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, courseTitle);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
}

test("StudyStage mode buttons open the real surfaces", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Stage ${Date.now()}`, "Stage lesson");

  await openStudyStage(page, course.title);
  const stage = page.getByRole("dialog", { name: "Study session" });
  await expect(stage.getByRole("button", { name: /Adaptive quiz/ })).toHaveAttribute("aria-current", "step");
  await stage.getByRole("button", { name: /Course sources/ }).click();
  await expect(page.getByRole("heading", { name: "Document library" })).toBeVisible();

  await openStudyStage(page, course.title);
  await page.getByRole("dialog", { name: "Study session" }).getByRole("button", { name: /Activities/ }).click();
  await expect(page.getByRole("heading", { name: "Learning activities" })).toBeVisible();
});

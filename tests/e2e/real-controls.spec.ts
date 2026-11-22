import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

async function importSource(page: import("@playwright/test").Page, courseId: string, lessonId: string) {
  const content = Buffer.from("Cell biology marker TUTOR-DNasearch. DNA is located in the nucleus of a cell.").toString("base64");
  const response = await page.request.post("/api/document-intelligence/import", {
    data: { courseId, lessonId, files: [{ name: "cell-biology.txt", contentBase64: content }] },
  });
  expect(response.ok()).toBeTruthy();
}

test("global search finds an indexed source and opens it", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request);
  await importSource(page, course.id, lesson.id);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Toggle courses").click();
  await page.getByTitle("Search anything").click();
  const dialog = page.getByRole("dialog", { name: "Search course materials" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("nucleus");
  await expect(dialog.getByText(/nucleus/i).first()).toBeVisible();
  await dialog.getByRole("button", { name: /open source/i }).first().click();
  await expect(page.locator(".lecture-pane")).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("learning progress opens with real or honestly empty data", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Toggle courses").click();
  await page.getByRole("button", { name: "Learning progress" }).click();
  const dialog = page.getByRole("dialog", { name: "Learning progress" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/No study activity yet|Questions answered/)).toBeVisible();
});

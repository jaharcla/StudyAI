import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(90000);

test("a practice question hides its answer until revealed", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Question ${Date.now()}`, "Question lesson");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Practice question", exact: true }).click();
  await page.locator(".canvas-board").click({ position: { x: 200, y: 200 } });
  await page.getByRole("button", { name: "Inspect selected object" }).click();
  await page.getByRole("textbox", { name: "Question" }).fill("Where is DNA?");
  await page.getByRole("textbox", { name: "Answer" }).fill("the answer text");
  await page.locator(".canvas-object-editor").getByRole("button", { name: "Done" }).click();

  await expect(page.getByTestId("reveal-answer")).toBeVisible();
  await expect(page.getByText("the answer text")).toBeHidden();
  await page.getByTestId("reveal-answer").click();
  await expect(page.getByText("the answer text")).toBeVisible();
  await page.getByTestId("reveal-answer").click();
  await expect(page.getByText("the answer text")).toBeHidden();
});

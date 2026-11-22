import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("Cards opens flashcard review and a rated card advances", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Cards ${Date.now()}`, "Cards lesson");
  const created = await request.post("/api/study/cards", { data: { courseId: course.id, lessonId: lesson.id, conceptId: "Water", front: "Formula?", back: "H2O" } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  await page.locator(".sidebar-scrim").click();
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(page.getByTestId("flashcard-review")).toBeVisible();
  await expect(page.getByText("H2O", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Reveal card" }).click();
  await expect(page.getByText("H2O", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/Next review/)).toBeVisible();
  await expect(page.getByText("No flashcards are due")).toBeVisible();
});

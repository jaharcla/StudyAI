import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(180000);

async function seed(request: import("@playwright/test").APIRequestContext, courseId: string) {
  const response = await request.post("/api/documents", {
    data: { courseId, name: "Smoke lesson.txt", content: "Smoke lesson: a cell contains DNA in its nucleus. The nucleus holds the cell's genetic material." },
  });
  expect(response.ok()).toBeTruthy();
}

test("every primary action has a DOM result or an honest failure", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Final push smoke ${Date.now()}`, "Smoke lesson");
  await seed(request, course.id);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, course.title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();

  await expect(page.locator('[title*="not available yet"]')).toHaveCount(0);

  // One Studio surface: artifact and deck creation share a single create rail.
  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await page.getByRole("button", { name: "Generate a mind map" }).click();
  await expect(page.getByTestId("studio-surface")).toContainText(/mind map|couldn't|didn't|unchanged|Generating/i, { timeout: 45000 });
  await page.getByTestId("deck-generate").click();
  await expect(page.getByTestId("studio-surface")).toContainText(/deck|Presenton|couldn't|didn't|Building/i, { timeout: 45000 });
  await page.getByRole("button", { name: "Close Studio" }).click();

  // Concepts opens without a lesson-scoped guard.
  await page.getByTestId("open-concept-graph").click();
  await expect(page.getByRole("dialog", { name: "Course concept graph" })).toBeVisible();
  await page.getByRole("button", { name: "Close concept graph" }).click();

  // Study: one-click quiz produces a question or an honest empty state.
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
  await page.getByRole("button", { name: "Make quiz" }).click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toContainText(/Source:|Check answer|No reviewed questions|No course sources|didn't|did not|unchanged|usable/i, { timeout: 45000 });
  await page.getByRole("button", { name: "Close study session" }).click();

  // Cards: one-click cards produce a card or an honest empty state.
  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByTestId("flashcard-review")).toBeVisible();
  const makeCards = page.getByRole("button", { name: "Make cards from this lesson" });
  if (await makeCards.isVisible()) {
    await makeCards.click();
    await expect(page.getByTestId("flashcard-review")).toContainText(/QUESTION|ANSWER|No flashcards|couldn't|didn't|unchanged/i, { timeout: 45000 });
  } else {
    await expect(page.getByTestId("flashcard-review")).toContainText(/QUESTION|ANSWER/i);
  }
  await page.getByRole("button", { name: "Close flashcard review" }).click();

  // Board switching changes the active board and stays on a real board.
  const switcher = page.getByRole("button", { name: "Choose canvas board" });
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menu = page.locator(".canvas-board-menu");
  await expect(menu).toBeVisible();
  const before = await switcher.innerText();
  await menu.getByRole("button", { name: "New board" }).click();
  await expect(switcher).not.toHaveText(before);
  await switcher.click();
  await page.locator(".canvas-board-menu").getByRole("button", { name: before.trim(), exact: true }).click();
  await expect(switcher).toHaveText(before);

  // Continue offers one prepared action, or says plainly that none is available.
  await expect(page.getByTestId("coach-surface")).toBeVisible();
  await expect(page.getByTestId("coach-continue")).toBeVisible();
});

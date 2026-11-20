import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("tutor math renders as KaTeX in the sidebar", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await createCourseWithLesson(request, `Tutor math ${Date.now()}`, "Synthetic canvas context");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  const tutor = page.locator(".copilot-slot");
  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("what is v?");
  await chat.press("Enter");
  await expect(tutor.locator('[data-testid="custom-markdown-renderer"]').first()).toBeVisible({ timeout: 90_000 });
  await expect(tutor.locator(".katex").first()).toBeVisible({ timeout: 90_000 });
  await expect(tutor.locator(".katex-error")).toHaveCount(0);
  const visible = await tutor.locator('[data-testid="custom-markdown-renderer"]').last().evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll(".katex-mathml").forEach((n) => n.remove());
    return c.textContent ?? "";
  });
  expect(visible).not.toMatch(/\\(frac|times|text)|\$/);
  await page.screenshot({ path: "test-results/tutor-math.png", fullPage: false });
});

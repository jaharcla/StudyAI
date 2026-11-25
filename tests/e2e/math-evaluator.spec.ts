import { expect, test } from "@playwright/test";

type MathResult = { status: string; result?: string; reason?: string; computed?: boolean };
type MathWindow = Window & { __studyaiCalculateMath?: (input: unknown) => Promise<MathResult> };

async function openWithTool(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => typeof (window as MathWindow).__studyaiCalculateMath)).toBe("function");
}

test("the Tutor math tool renders a labelled calculation with no citation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("**/api/math/evaluate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", operation: "simplify", result: "5/6", method: "exact rational arithmetic", computed: true }),
    }));
  await openWithTool(page);

  const result = await page.evaluate((input) => (window as MathWindow).__studyaiCalculateMath?.(input), {
    operation: "simplify",
    arguments: { expression: "1/2 + 1/3" },
    reason: "Adding two fractions.",
  });
  expect(result?.status).toBe("ok");

  const card = page.getByTestId("math-result");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("math-result-label")).toHaveText("Calculated by StudyAI");
  await expect(page.getByTestId("math-result-value")).toHaveText("5/6");
  await expect(card.locator('[data-testid*="citation"]')).toHaveCount(0);
  await expect(card).not.toContainText(/source excerpt|page \d/i);
});

test("a failed calculation shows an error and never a value", async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("**/api/math/evaluate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "error", reason: "Division by zero." }) }));
  await openWithTool(page);

  await page.evaluate((input) => (window as MathWindow).__studyaiCalculateMath?.(input), {
    operation: "simplify",
    arguments: { expression: "1/0" },
    reason: "Checking a quotient.",
  });

  await expect(page.getByTestId("math-result-error")).toHaveText("Division by zero.");
  await expect(page.getByTestId("math-result-value")).toHaveCount(0);
});

test("a malformed API response never renders a calculation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("**/api/math/evaluate", (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "broken" }));
  await openWithTool(page);

  await page.evaluate((input) => (window as MathWindow).__studyaiCalculateMath?.(input), {
    operation: "simplify",
    arguments: { expression: "2+2" },
    reason: "Checking a sum.",
  });

  await expect(page.getByTestId("math-result-value")).toHaveCount(0);
  await expect(page.getByTestId("math-result-error")).toBeVisible();
});

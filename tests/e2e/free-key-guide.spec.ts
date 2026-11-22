import { test, expect } from "@playwright/test";

test("settings shows the free-tier keys guide", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings" }).first().click();

  const guide = page.getByTestId("free-key-guide");
  await expect(guide).toBeVisible();

  const beforeModel = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="free-key-guide"]');
    const model = document.querySelector('[data-testid="model-select"]');
    return Boolean(el && model && (el.compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(beforeModel).toBe(true);

  await page.getByTestId("free-key-groq").locator("summary").click();
  await expect(page.getByTestId("free-key-groq")).toContainText("GROQ_API_KEY=gsk_...");
  await expect(page.getByTestId("free-key-groq").getByRole("link", { name: "console.groq.com" })).toHaveAttribute("target", "_blank");

  await expect(page.getByTestId("free-key-config-link")).toHaveAttribute("href", "docs/CONFIGURATION.md");
});

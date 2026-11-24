import { test, expect } from "@playwright/test";

test("settings hides the dormant paid rail by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings" }).first().click();

  // BYOK / local stays fully available.
  await expect(page.getByTestId("free-key-guide")).toBeVisible();
  await expect(page.getByTestId("model-select")).toBeVisible();

  // Paid rail is absent unless VITE_STUDYAI_PAID_ENABLED=1.
  await expect(page.getByTestId("credit-provider-option")).toHaveCount(0);
  await expect(page.getByText("StudyAI Credits")).toHaveCount(0);
  await expect(page.getByTestId("credit-balance")).toHaveCount(0);
  await expect(page.getByTestId("support-panel")).toHaveCount(0);
  await expect(page.getByText("Support StudyAI")).toHaveCount(0);
});

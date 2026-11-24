import { test, expect } from "@playwright/test";

// Paid rail is dormant by default (PRODUCT_ROADMAP, 2026-11-23).
test.skip(process.env.VITE_STUDYAI_PAID_ENABLED !== "1", "Set VITE_STUDYAI_PAID_ENABLED=1 to run paid-rail UI tests.");

test("credits provider shows balance, redeems a code, and chats", async ({ page }) => {
  let balanceMicros = 500_000;
  await page.route("**/v1/wallet", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balanceMicros }),
    });
  });
  await page.route("**/v1/redeem", async (route) => {
    balanceMicros += 100_000;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ creditedMicros: 100_000 }),
    });
  });
  await page.route("**/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text: "Credit answer", balanceMicros: 499_550 }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings" }).first().click();

  const provider = page.getByTestId("credit-provider-option");
  await expect(provider).toBeVisible();
  await provider.selectOption("credits");

  await expect(page.getByTestId("credit-balance")).toContainText("$0.50");
  await expect(page.getByTestId("credit-recovery-code")).not.toBeEmpty();

  const disclosureBeforeInput = await page.evaluate(() => {
    const disclosure = document.querySelector('[data-testid="credit-disclosure"]');
    const input = document.querySelector('[data-testid="credit-redeem-input"]');
    return Boolean(disclosure && input && (disclosure.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(disclosureBeforeInput).toBe(true);

  await page.getByTestId("credit-redeem-input").fill("SC-1234-5678-9abc-def0");
  await page.getByTestId("credit-redeem-button").click();
  await expect(page.getByTestId("credit-balance")).toContainText("$0.60");

  await page.getByTestId("credit-chat-input").fill("Hello");
  await page.getByTestId("credit-chat-send").click();
  await expect(page.getByTestId("credit-chat-answer")).toContainText("Credit answer");
});

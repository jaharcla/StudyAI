import { test, expect } from "@playwright/test";

// Paid rail is dormant by default (PRODUCT_ROADMAP, 2026-11-23).
test.skip(process.env.VITE_STUDYAI_PAID_ENABLED !== "1", "Set VITE_STUDYAI_PAID_ENABLED=1 to run paid-rail UI tests.");

test("support panel offers donations and credit packs through Stripe", async ({ page }) => {
  let checkoutBody = "";
  await page.route("**/v1/checkout", async (route) => {
    checkoutBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/mock" }),
    });
  });
  await page.route("https://checkout.stripe.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Mock Stripe</h1>" });
  });
  await page.route("**/v1/wallet", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ balanceMicros: 500_000 }) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings" }).first().click();

  await expect(page.getByTestId("support-panel")).toBeVisible();
  await expect(page.getByTestId("support-kind-donation")).toBeVisible();
  await expect(page.getByTestId("support-kind-credits")).toBeVisible();

  await page.getByTestId("support-kind-credits").click();
  await page.getByTestId("support-amount").selectOption("medium");
  await page.getByTestId("support-checkout-button").click();

  expect(JSON.parse(checkoutBody)).toMatchObject({ kind: "credits", choice: "medium" });
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
});

test("returning from Stripe refreshes the wallet and shows pending credits", async ({ page }) => {
  let walletCalls = 0;
  await page.route("**/v1/wallet", async (route) => {
    walletCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ balanceMicros: 1_000_000 }) });
  });
  await page.goto("/?checkout=success", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.getByTestId("support-status")).toContainText("credits may take a moment");
  expect(walletCalls).toBeGreaterThan(0);
});

import { expect, test } from "@playwright/test";

const opencodeGoStatus = {
  mode: "opencode-go",
  provider: "opencode-go",
  model: "hy4-flash-free",
  pickerActive: false,
  note: "The local model picker is inactive: the Tutor uses opencode-go with hy4-flash-free from configuration (TUTOR_PROVIDER=opencode-go).",
};

test("Settings and Tutor header show the active provider and model, not an Ollama error", async ({ page }) => {
  await page.route("**/api/tutor-status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opencodeGoStatus) }));
  await page.route("**/api/models", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Ollama is unavailable" }) }));
  await page.goto("/");

  const header = page.getByTestId("tutor-provider-status");
  await expect(header).toContainText("opencode-go");
  await expect(header).toContainText("hy4-flash-free");
  await expect(header).not.toContainText("Ollama is unavailable");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/tutor-provider-header.png", fullPage: false });

  await page.locator(".top-actions button[title='Settings']").click();
  await expect(page.getByTestId("active-tutor-provider").locator("input")).toHaveValue("opencode-go · hy4-flash-free");
  await expect(page.getByTestId("model-provider-note")).toContainText("inactive");
  await expect(page.getByTestId("model-provider-note")).toContainText("hy4-flash-free");
  await expect(page.locator('label:has-text("Local model service (Ollama)") input')).toHaveValue("Ollama is unavailable");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/tutor-provider-settings.png", fullPage: false });
});

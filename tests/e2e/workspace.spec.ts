import { expect, test } from "@playwright/test";

async function status(page: import("@playwright/test").Page, url: string) {
  try { return (await page.request.get(url, { timeout: 1000 })).status(); } catch { return 0; }
}

test("workspace renders, saves its canvas, and switches study views", async ({ page }) => {
  test.setTimeout(240_000);
  await expect.poll(() => status(page, "http://127.0.0.1:8201/api/courses"), { timeout: 30_000 }).toBe(200);
  await expect.poll(() => status(page, "http://127.0.0.1:8200/api/copilotkit/info"), { timeout: 30_000 }).toBe(200);
  await expect.poll(() => status(page, "http://127.0.0.1:8123/ok"), { timeout: 30_000 }).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atomic structure & bonding" })).toBeVisible();
  await expect(page.getByText("STUDY CANVAS")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  const model = page.getByTestId("model-select");
  await expect(model.locator("option")).not.toHaveCount(0);
  await model.selectOption("qwen3:latest");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("Reply with exactly STUDYAI-OLLAMA-OK");
  await chat.press("Enter");
  await expect(page.getByText("STUDYAI-OLLAMA-OK", { exact: false }).last()).toBeVisible({ timeout: 180_000 });
  const board = page.locator(".canvas-board");
  await board.hover({ position: { x: 240, y: 180 } });
  await page.mouse.down();
  await page.mouse.move(280, 210, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => {
    const response = await page.request.get("http://127.0.0.1:8201/api/drawings?course=chem-120");
    return Boolean((await response.json())?.snapshot);
  }).toBe(true);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Document library" })).toBeVisible();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByText("STUDY CANVAS")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Document library" })).toBeVisible();
});

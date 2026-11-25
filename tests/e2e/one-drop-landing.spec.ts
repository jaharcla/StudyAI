import { expect, test, type Page } from "@playwright/test";

async function emptyWorkspace(page: Page): Promise<void> {
  await page.route("**/api/courses", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.continue();
  });
}

const source = {
  name: "1.1 Right Triangles KIN 120.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Right triangle trigonometry defines sine as opposite over hypotenuse."),
};

test("intake lands in one grounded question the student sends", async ({ page }) => {
  test.setTimeout(90_000);
  await emptyWorkspace(page);
  await page.goto("/");
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await page.getByTestId("one-drop-input").setInputFiles(source);
  const prepared = page.getByTestId("prepared-question");
  await expect(prepared).toContainText("KIN 120");
  await expect(prepared).toContainText("opposite over hypotenuse");
  await expect(prepared.locator(".di-citation")).toBeVisible();
  await expect(page.getByTestId("one-drop-zone")).toHaveCount(0);
  await expect(page.getByTestId("prepared-question-send")).toBeVisible();
  await page.getByTestId("prepared-question-send").click();
  await expect(page.getByTestId("tutor-provider-status")).toBeVisible();
});

test("an empty workspace shows one intake surface and no competing chrome", async ({ page }) => {
  await emptyWorkspace(page);
  await page.goto("/");
  const surface = page.getByTestId("one-drop-surface");
  await expect(surface).toBeVisible();
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await expect(page.getByTestId("one-drop-input")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Choose files" })).toHaveCount(1);
  await expect(surface).toContainText(/PDF, DOCX, PPTX.*TXT/);
  await expect(surface).toContainText(/20 MB/i);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".tutor-panel")).toHaveCount(0);
  await expect(page.locator(".canvas-pane")).toHaveCount(0);
  await expect(page.locator(".workspace-toolbar")).toHaveCount(0);
  await expect(page.locator(".lesson-header")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await expect(surface).toBeVisible();
});

test("no retrieved passage abstains without a citation or send button", async ({ page }) => {
  test.setTimeout(90_000);
  await emptyWorkspace(page);
  await page.route("**/api/document-intelligence/retrieve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "no_evidence", message: "No matching excerpts were found in this course.", courseId: "", results: [] }),
  }));
  await page.goto("/");
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await page.getByTestId("one-drop-input").setInputFiles(source);
  const prepared = page.getByTestId("prepared-question");
  await expect(prepared).toContainText(/no supported passage/i);
  await expect(page.getByTestId("prepared-question-send")).toHaveCount(0);
  await expect(prepared.locator(".di-citation")).toHaveCount(0);
});

test("course storage loading is its own state before the intake surface", async ({ page }) => {
  await page.route("**/api/courses", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("intake-loading")).toBeVisible();
  await expect(page.getByTestId("one-drop-zone")).toHaveCount(0);
  await expect(page.getByTestId("one-drop-surface")).toHaveCount(0);
  await expect(page.getByTestId("intake-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
});

test("course storage failure offers retry instead of an upload invitation", async ({ page }) => {
  let unavailable = true;
  await page.route("**/api/courses", (route) => unavailable
    ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Local storage is unavailable."}' })
    : route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/");

  const failure = page.getByTestId("intake-error");
  await expect(failure).toBeVisible();
  await expect(failure).toHaveAttribute("role", "alert");
  await expect(failure).toContainText(/storage/i);
  await expect(page.getByTestId("one-drop-zone")).toHaveCount(0);
  await expect(page.getByTestId("one-drop-input")).toHaveCount(0);

  unavailable = false;
  await page.getByTestId("intake-retry").click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
});

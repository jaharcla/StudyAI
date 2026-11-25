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

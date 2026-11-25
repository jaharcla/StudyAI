import { expect, test, type Page } from "@playwright/test";

async function workspaceRoutes(page: Page, options: { onCoursePost?: () => void } = {}): Promise<void> {
  await page.route("**/api/courses", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    options.onCoursePost?.();
    return route.continue();
  });
}

const source = {
  name: "1.1 Right Triangles KIN 120.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Right triangle trigonometry defines sine as opposite over hypotenuse."),
};

test("one drop creates a course and lesson and reports progress", async ({ page }) => {
  test.setTimeout(90_000);
  await workspaceRoutes(page);
  await page.goto("/");
  const zone = page.getByTestId("one-drop-zone");
  await expect(zone).toBeVisible();
  await expect(page.getByTestId("one-drop-progress")).toContainText(/no files/i);
  await page.getByTestId("one-drop-input").setInputFiles(source);
  await expect(page.getByTestId("one-drop-progress")).toContainText(/index/i);
  await expect(page.getByTestId("one-drop-ready")).toBeVisible();
  await expect(page.getByTestId("one-drop-ready")).toContainText("KIN 120");
});

test("an empty drop leaves no course, no lesson and an honest empty state", async ({ page }) => {
  let created = false;
  await workspaceRoutes(page, { onCoursePost: () => { created = true; } });
  await page.goto("/");
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await expect(page.getByTestId("one-drop-progress")).toContainText(/no files/i);
  await expect(page.getByTestId("one-drop-ready")).toHaveCount(0);
  expect(created).toBe(false);
});

test("an unsupported file shows an inline error without creating a course", async ({ page }) => {
  let created = false;
  await workspaceRoutes(page, { onCoursePost: () => { created = true; } });
  await page.goto("/");
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await page.getByTestId("one-drop-input").setInputFiles({ name: "installer.exe", mimeType: "application/octet-stream", buffer: Buffer.from("not course material") });
  await expect(page.getByTestId("one-drop-error")).toContainText(/supported/i);
  await expect(page.getByTestId("one-drop-retry")).toBeVisible();
  await expect(page.getByTestId("one-drop-ready")).toHaveCount(0);
  expect(created).toBe(false);
});

test("a failed document-service upload shows an error and retry, never indexed", async ({ page }) => {
  test.setTimeout(90_000);
  await workspaceRoutes(page);
  await page.route("**/api/document-intelligence/import", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Document service unavailable." }) }));
  await page.goto("/");
  await expect(page.getByTestId("one-drop-zone")).toBeVisible();
  await page.getByTestId("one-drop-input").setInputFiles(source);
  await expect(page.getByTestId("one-drop-error")).toContainText(/document service unavailable/i);
  await expect(page.getByTestId("one-drop-retry")).toBeVisible();
  await expect(page.getByTestId("one-drop-ready")).toHaveCount(0);
  await expect(page.getByTestId("one-drop-progress")).not.toContainText(/indexed/i);
});

import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function seededWorkspace(page: import("@playwright/test").Page) {
  await page.route("**/api/courses", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json([{ id: "kin-120", title: "KIN 120", code: "Biomechanics", color: "#888888" }]));
    }
    return route.continue();
  });
  await page.route("**/api/lessons?course=kin-120", (route) => route.fulfill(json([{ id: "lesson-kin", title: "kin120" }])));
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill(json([])));
  await page.route("**/api/progress*", (route) => route.fulfill(json({ lessons: [], totalAttempts: 0, totalCorrect: 0, conceptsMastered: 0, dueReviews: 0 })));
  await page.route("**/api/concepts/graph*", (route) => route.fulfill(json({ title: "KIN 120", nodes: [], edges: [] })));
  await page.addInitScript(() => {
    localStorage.setItem("studyai.course", "kin-120");
    localStorage.setItem("studyai.lesson.kin-120", "lesson-kin");
  });
}

test("first paint keeps one-drop start and shows no mode-surface loading state", async ({ page }) => {
  await seededWorkspace(page);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByTestId("surface-next")).toBeVisible();
  await expect(page.getByText("STUDY CANVAS")).toBeVisible();
  await expect(page.getByTestId("mode-surface-loading")).toHaveCount(0);
});

test("a mode-gated surface shows its loading state while the chunk is fetched", async ({ page }) => {
  await seededWorkspace(page);
  await page.route("**/src/lab/StudyStage.tsx*", async (route) => {
    await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByTestId("surface-next")).toBeVisible();
  await expect(page.getByTestId("mode-surface-loading")).toHaveCount(0);

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(page.getByTestId("mode-surface-loading")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
  await expect(page.getByTestId("mode-surface-loading")).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";

async function emptyWorkspace(page: Page): Promise<void> {
  await page.route("**/api/courses", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.continue();
  });
}

test("later surfaces are de-emphasised until there is work in them", async ({ page }) => {
  test.setTimeout(90_000);
  await emptyWorkspace(page);
  await page.goto("/");
  await expect(page.getByTestId("surface-next")).toBeVisible();
  await expect(page.getByTestId("surface-next")).toHaveAttribute("data-target", "canvas");
  await expect(page.getByTestId("open-canvas")).not.toHaveAttribute("data-deemphasised", "true");
  await expect(page.getByTestId("open-studio")).toHaveAttribute("data-deemphasised", "true");
  await expect(page.getByTestId("open-study")).toHaveAttribute("data-deemphasised", "true");
  await expect(page.getByTestId("open-concept-graph")).toHaveAttribute("data-deemphasised", "true");
});

test("a real artifact makes Studio the next surface without hiding navigation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/courses", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "kin-120", title: "KIN 120", code: "Biomechanics", color: "#888888" }]) });
    return route.continue();
  });
  await page.route("**/api/lessons?course=kin-120", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "lesson-kin", title: "kin120" }]) }));
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "artifact-1", kind: "study-guide", title: "Right triangles guide" }]) }));
  await page.route("**/api/progress*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lessons: [], totalAttempts: 0, totalCorrect: 0, conceptsMastered: 0, dueReviews: 0 }) }));
  await page.route("**/api/concepts/graph*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: "KIN 120", nodes: [], edges: [] }) }));
  await page.addInitScript(() => { localStorage.setItem("studyai.course", "kin-120"); localStorage.setItem("studyai.lesson.kin-120", "lesson-kin"); });
  await page.goto("/");
  await expect(page.getByTestId("open-studio")).not.toHaveAttribute("data-deemphasised", "true");
  await expect(page.getByTestId("surface-next")).toHaveAttribute("data-target", "studio");
  await expect(page.getByTestId("open-study")).toBeVisible();
  await expect(page.getByTestId("open-concept-graph")).toBeVisible();
});

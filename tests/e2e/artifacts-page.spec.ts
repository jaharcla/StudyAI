import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const REF = "studyai://document/doc-1/page/1?chunk=0";
const deck = {
  id: "deck-1", courseId: "c", lessonId: "l", kind: "slide_deck",
  title: "Forces study deck", createdAt: new Date().toISOString(), collection: "Revision",
  filePath: "deck-1/final.pptx", sourceRefs: [REF],
  content: {
    id: "sd1", kind: "slide_deck", sourceRefs: [REF], claims: [], objective: "Understand forces",
    templateId: "general-en", language: "en",
    slides: [
      { role: "title", title: "Forces", claims: [], notes: "Introduce forces." },
      { role: "mechanism", title: "Equilibrium",
        claims: [{ claim: "Forces cancel at equilibrium.", sourceRef: REF, excerpt: "Forces cancel at equilibrium.", relationship: "direct" }],
        visual: { kind: "diagram", altText: "Opposing force arrows" }, notes: "Explain the sum." },
    ],
  },
};

async function mockArtifacts(page: Page) {
  let items = [deck];
  await page.route("**/api/slide-decks/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(deck) }));
  await page.route("**/api/slide-decks/download**", (route) => route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: "pptx-bytes" }));
  await page.route("**/api/slide-decks/artifact", async (route) => {
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON() as { title: string };
      items = items.map((item) => ({ ...item, title: patch.title }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items[0]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/slide-decks/artifact?id=**", async (route) => {
    if (route.request().method() === "DELETE") {
      items = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"deleted":true}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items[0] ?? { error: "not found" }) });
  });
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(items),
  }));
  return { getItems: () => items };
}

test("Artifacts page lists, opens and organizes a slide deck", async ({ page }) => {
  const state = await mockArtifacts(page);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/");
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open Artifacts").click();
  await expect(page.getByTestId("artifacts-page")).toBeVisible();
  await expect(page.getByTestId("artifact-row")).toHaveCount(1);
  await expect(page.getByTestId("artifact-row")).toContainText("Forces study deck");

  await page.getByTestId("artifact-filter-collection").fill("Revision");
  await expect(page.getByTestId("artifact-row")).toHaveCount(1);
  await page.getByTestId("artifact-filter-collection").fill("Missing");
  await expect(page.getByTestId("artifact-row")).toHaveCount(0);
  await page.getByTestId("artifact-filter-collection").fill("");

  await page.getByTestId("artifact-open").click();
  await expect(page.getByTestId("slide-card")).toHaveCount(2);
  await expect(page.getByText("Opposing force arrows")).toBeVisible();
  await page.getByTestId("slide-citation").click();
  await expect(page.getByTestId("artifacts-page")).toHaveCount(0);

  await page.getByTitle("Open Artifacts").click();
  await page.getByTestId("artifact-open").click();
  await expect(page.getByTestId("artifact-download")).toHaveAttribute("href", /api\/slide-decks\/download/);

  await page.getByTestId("artifact-rename").fill("Renamed deck");
  await page.getByTestId("artifact-save").click();
  await expect(page.getByTestId("artifact-row")).toContainText("Renamed deck");
  expect(state.getItems()[0].title).toBe("Renamed deck");

  await page.getByTestId("artifact-delete").click();
  await expect(page.getByTestId("artifact-row")).toHaveCount(0);
});

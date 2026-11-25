import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const REF = "studyai://document/doc-1/page/1?chunk=0";
const deck = {
  id: "deck-local-1", courseId: "c", lessonId: "l", kind: "slide_deck",
  title: "Forces study deck", createdAt: new Date().toISOString(), collection: "",
  filePath: "deck-local-1/deck.pptx", sourceRefs: [REF],
  content: {
    id: "sd1", kind: "slide_deck", sourceRefs: [REF], claims: [], objective: "Forces",
    templateId: "general-en", language: "en",
    slides: [
      { role: "title", title: "Forces", claims: [], notes: "Introduce forces." },
      { role: "mechanism", title: "Forces cancel at equilibrium",
        claims: [{ claim: "Forces cancel at equilibrium.", sourceRef: REF, excerpt: "Forces cancel at equilibrium.", relationship: "direct" }],
        visual: { kind: "diagram", altText: "Opposing force arrows" }, notes: "Explain the sum." },
    ],
  },
};

async function mockDeck(page: Page) {
  await page.route("**/api/slide-decks/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(deck) }));
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([deck]) }));
  await page.route("**/api/slide-decks/artifact?id=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deck) }));
  await page.route("**/api/slide-decks/download**", (route) => route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: "pptx-bytes" }));
}

test("Deck opens in a real in-site viewer with navigation, notes and citations", async ({ page }) => {
  await mockDeck(page);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-tab-slide_deck")).toBeVisible();
  await page.getByTestId("studio-tab-slide_deck").click();
  await expect(page.getByTestId("deck-detail")).toBeVisible();

  await expect(page.getByTestId("artifact-download")).toHaveAttribute("download", "forces-study-deck.pptx");
  await expect(page.getByTestId("artifact-download")).toHaveAttribute("href", /api\/slide-decks\/download/);

  await page.getByTestId("deck-viewer-present").click();
  const viewer = page.getByTestId("deck-viewer");
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId("deck-viewer-count")).toContainText("1 of 2");
  await expect(page.getByTestId("deck-viewer-title")).toContainText("Forces");
  await expect(page.getByTestId("deck-viewer-prev")).toBeDisabled();

  await page.getByTestId("deck-viewer-next").click();
  await expect(page.getByTestId("deck-viewer-count")).toContainText("2 of 2");
  await expect(page.getByTestId("deck-viewer-title")).toContainText("Forces cancel at equilibrium");
  await expect(page.getByTestId("deck-viewer-notes")).toContainText("Explain the sum.");
  await expect(page.getByTestId("deck-viewer-citation")).toContainText("Open source · page 1");

  await page.getByTestId("deck-viewer-citation").click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);
});

test("Deck viewer supports keyboard navigation and closes back to the grid", async ({ page }) => {
  await mockDeck(page);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("slide-card")).toHaveCount(2);

  await page.getByTestId("deck-viewer-present").click();
  await expect(page.getByTestId("deck-viewer-count")).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("deck-viewer-count")).toContainText("2 of 2");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("deck-viewer-count")).toContainText("1 of 2");

  await page.getByTestId("deck-viewer-close").click();
  await expect(page.getByTestId("deck-viewer")).toHaveCount(0);
  await expect(page.getByTestId("slide-card")).toHaveCount(2);
});

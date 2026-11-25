import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

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
      { role: "mechanism", title: "Forces cancel at equilibrium",
        claims: [{ claim: "Forces cancel at equilibrium.", sourceRef: REF, excerpt: "Forces cancel at equilibrium.", relationship: "direct" }],
        visual: { kind: "diagram", altText: "Opposing force arrows" }, notes: "Explain the sum." },
    ],
  },
};

async function mockArtifacts(page: Page, generateDelayMs = 0) {
  let items = [deck];
  await page.route("**/api/slide-decks/generate", async (route) => {
    if (generateDelayMs) await new Promise((resolve) => setTimeout(resolve, generateDelayMs));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(deck) });
  });
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

test("Artifacts page builds, lists, opens and organizes a slide deck", async ({ page }) => {
  const state = await mockArtifacts(page, 1200);
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await expect(page.getByTestId("library-item")).toContainText("Forces study deck");

  await page.getByText("Advanced").last().click();
  await page.getByTestId("deck-focus").fill("Forces and equilibrium");
  await page.getByTestId("deck-generate").click();
  await expect(page.getByTestId("artifacts-status")).toContainText("Building your deck");
  await expect(page.getByTestId("artifacts-status")).toContainText("Deck ready", { timeout: 5000 });
  await expect(page.getByTestId("slide-card")).toHaveCount(2);

  await page.getByTestId("library-filter-slide_deck").click();
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await page.getByTestId("library-filter-infographic").click();
  await expect(page.getByTestId("library-item")).toHaveCount(0);
  await expect(page.getByTestId("library-empty")).toContainText("No artifacts match that filter.");
  await page.getByTestId("library-filter-all").click();

  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("slide-card")).toHaveCount(2);
  await expect(page.getByTestId("slide-card").filter({ hasText: "Forces cancel at equilibrium" })).toBeVisible();
  await expect(page.getByTestId("slide-citation")).toContainText("Open source · page 1");
  await expect(page.getByText("Opposing force arrows")).toBeVisible();
  await expect(page.getByText(/speaker notes/i).first()).toBeVisible();
  await page.getByTestId("slide-citation").click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("artifact-download")).toHaveAttribute("download", "forces-study-deck.pptx");
  await expect(page.getByTestId("artifact-download")).toHaveAttribute("href", /api\/slide-decks\/download/);

  await page.getByTestId("artifact-rename").fill("Renamed deck");
  await page.getByTestId("artifact-save").click();
  await expect(page.getByTestId("library-item")).toContainText("Renamed deck");
  expect(state.getItems()[0].title).toBe("Renamed deck");

  await page.getByTestId("artifact-delete").click();
  await expect(page.getByTestId("artifacts-status")).toContainText("Delete this deck?");
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await page.getByTestId("artifact-delete").click();
  await expect(page.getByTestId("library-item")).toHaveCount(0);
  await expect(page.getByTestId("artifacts-status")).toContainText("Deck deleted.");
});

test("Artifacts page names the missing service instead of saying the deck service is busy", async ({ page }) => {
  await mockArtifacts(page);
  await page.route("**/api/slide-decks/generate", (route) => route.fulfill({
    status: 502, contentType: "application/json", body: JSON.stringify({ error: "The local presentation service (Presenton) is not available." }),
  }));
  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("deck-generate").click();
  const status = page.getByTestId("artifacts-status");
  await expect(status).toContainText("presentation service");
  await expect(status).not.toContainText("busy");
  await expect(status).not.toContainText("502");
  await expect(page.getByTestId("deck-generate")).toBeEnabled();
  await page.screenshot({ path: "test-results/shots/artifacts-error-after.png" });
});

test("Artifacts page keeps a semantic deck usable when the renderer is absent", async ({ page }) => {
  const semanticDeck = { ...deck, filePath: "", notice: "Your deck's slides and citations are ready. The .pptx download needs the local presentation service (Presenton), which isn't running. Start it and build again to export." };
  await page.route("**/api/slide-decks/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(semanticDeck) }));
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([semanticDeck]) }));
  await page.route("**/api/slide-decks/artifact?id=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(semanticDeck) }));

  const { course } = await createCourseWithLesson(page.request);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await selectCourseOnPage(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("deck-generate").click();
  const status = page.getByTestId("artifacts-status");
  await expect(status).toContainText("slides and citations are ready");
  await expect(page.getByTestId("slide-card")).toHaveCount(2);
  await expect(page.getByTestId("slide-citation")).toHaveCount(1);
  await expect(page.getByTestId("artifact-download")).toHaveCount(0);
  await expect(page.getByTestId("artifact-download-unavailable")).toBeDisabled();
  await expect(page.getByTestId("artifact-download-note")).toContainText("Presenton");
  await page.screenshot({ path: "test-results/shots/artifacts-degraded-after.png" });
});

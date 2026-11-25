import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

const REF = "studyai://document/doc-1/page/1?chunk=0";
const studio = {
  id: "art-map", courseId: "c", lessonId: "l", kind: "mind-map", title: "Forces mind map",
  content: { title: "Forces", nodes: [{ id: "root", label: "Forces", parentId: null, sourceRef: REF }] },
  sourceRefs: [REF], createdAt: new Date().toISOString(),
};
const deck = {
  id: "deck-1", courseId: "c", lessonId: "l", kind: "slide_deck", title: "Forces study deck",
  createdAt: new Date().toISOString(), filePath: "deck-1/final.pptx", sourceRefs: [REF],
  content: { id: "sd1", kind: "slide_deck", sourceRefs: [REF], claims: [], objective: "Forces", slides: [] },
};

async function mockLibrary(page: Page, studioItems: unknown[] = [studio], deckItems: unknown[] = [deck], delayMs = 0) {
  await page.route(/\/api\/studio\/artifacts(\?|$)/, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(studioItems) });
  });
  await page.route(/\/api\/slide-decks(\?|$)/, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deckItems) });
  });
  await page.route(/\/api\/slide-decks\/artifact(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deck) }));
}

async function openStudio(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
}

test("one Studio surface lists studio artifacts and decks, opens each and filters by type", async ({ page, request }) => {
  await mockLibrary(page, [studio], [deck], 600);
  const { course } = await createCourseWithLesson(request, `Library ${Date.now()}`, "Library lesson");
  await openStudio(page, course.title);

  await expect(page.getByTestId("library-status")).toContainText("Loading your library");
  await expect(page.getByTestId("library-item")).toHaveCount(2);
  await expect(page.getByTestId("library-item").first()).toContainText("Forces");
  await expect(page.getByTestId("library-status")).toHaveCount(0);
  await page.screenshot({ path: "test-results/shots/library-unified.png" });

  await page.getByTestId("library-filter-slide_deck").click();
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await expect(page.getByTestId("library-item")).toContainText("Forces study deck");

  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("deck-detail")).toBeVisible();
  await expect(page.getByTestId("deck-detail")).toContainText("Forces study deck");
  await page.screenshot({ path: "test-results/shots/studio-unified-deck.png" });
  await page.getByRole("button", { name: "Close Studio" }).click();

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("library-filter-mind-map").click();
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await expect(page.getByTestId("mind-map")).toBeVisible();
});

test("unified library shows either empty or error, never both, and Retry actually reloads", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Library empty ${Date.now()}`, "Empty lesson");
  await mockLibrary(page, [], []);
  await openStudio(page, course.title);
  await expect(page.getByTestId("library-empty")).toContainText("No artifacts yet");
  await expect(page.getByTestId("library-status")).toHaveCount(0);
  await page.screenshot({ path: "test-results/shots/library-empty.png" });
  await page.getByRole("button", { name: "Close Studio" }).click();

  await page.unroute(/\/api\/studio\/artifacts(\?|$)/);
  await page.unroute(/\/api\/slide-decks(\?|$)/);
  await page.route(/\/api\/studio\/artifacts(\?|$)/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.route(/\/api\/slide-decks(\?|$)/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("library-status")).toContainText("couldn't be loaded");
  await expect(page.getByTestId("library-status")).toContainText("unchanged");
  await expect(page.getByTestId("library-status")).not.toContainText("unavailable");
  await expect(page.getByTestId("library-empty")).toHaveCount(0);
  await expect(page.getByTestId("studio-empty")).toHaveCount(0);
  await page.screenshot({ path: "test-results/shots/library-error.png" });

  await page.unroute(/\/api\/studio\/artifacts(\?|$)/);
  await page.unroute(/\/api\/slide-decks(\?|$)/);
  await page.route(/\/api\/studio\/artifacts(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([studio]) }));
  await page.route(/\/api\/slide-decks(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([deck]) }));
  await page.getByTestId("library-retry").click();
  await expect(page.getByTestId("library-status")).toHaveCount(0);
  await expect(page.getByTestId("library-item")).toHaveCount(2);
});

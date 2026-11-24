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

async function openLibrary(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  await page.getByTestId("open-library").click();
  await expect(page.getByTestId("library-surface")).toBeVisible();
}

test("one library lists studio artifacts and decks, opens each and filters by type", async ({ page, request }) => {
  await mockLibrary(page, [studio], [deck], 600);
  const { course } = await createCourseWithLesson(request, `Library ${Date.now()}`, "Library lesson");
  await openLibrary(page, course.title);

  await expect(page.getByTestId("library-status")).toContainText("Loading your library");
  await expect(page.getByTestId("library-item")).toHaveCount(2);
  await expect(page.getByTestId("library-item").first()).toContainText("Forces");
  await page.screenshot({ path: "test-results/shots/library-unified.png" });

  await page.getByTestId("library-filter").selectOption("slide_deck");
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await expect(page.getByTestId("library-item")).toContainText("Forces study deck");

  await page.getByTestId("library-open").click();
  await expect(page.getByRole("dialog", { name: "Artifacts" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Artifacts" })).toContainText("Forces study deck");
  await page.getByRole("button", { name: "Close artifacts" }).click();

  await page.getByTestId("open-library").click();
  await page.getByTestId("library-filter").selectOption("mind-map");
  await expect(page.getByTestId("library-item")).toHaveCount(1);
  await page.getByTestId("library-open").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await expect(page.getByTestId("mind-map")).toBeVisible();
});

test("library shows an honest empty state and a retryable error state", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Library empty ${Date.now()}`, "Empty lesson");
  await mockLibrary(page, [], []);
  await openLibrary(page, course.title);
  await expect(page.getByTestId("library-empty")).toContainText("No artifacts yet");
  await page.screenshot({ path: "test-results/shots/library-empty.png" });
  await page.getByRole("button", { name: "Close library" }).click();

  await page.unroute(/\/api\/studio\/artifacts(\?|$)/);
  await page.unroute(/\/api\/slide-decks(\?|$)/);
  await page.route(/\/api\/studio\/artifacts(\?|$)/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.route(/\/api\/slide-decks(\?|$)/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await page.getByTestId("open-library").click();
  await expect(page.getByTestId("library-status")).toContainText("couldn't be loaded");
  await expect(page.getByTestId("library-status")).not.toContainText("unavailable");
  await page.screenshot({ path: "test-results/shots/library-error.png" });
});

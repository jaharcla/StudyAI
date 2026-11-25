import { expect, test, type Page } from "@playwright/test";
import { createCourse, createCourseWithLesson, createLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(120000);
test.use({ viewport: { width: 1440, height: 900 } });

async function openCourse(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
}

async function pickLesson(page: Page, lessonId: string) {
  // A modal surface covers the sidebar; context changes arrive through the shell,
  // so exercise the same select the Coach path uses without a pointer click.
  await page.getByLabel("Active lesson").evaluate((element: HTMLSelectElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, lessonId);
}

async function contrastOf(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let node: Element | null = element;
    let background = [255, 255, 255];
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0.5)) {
        background = parts.slice(0, 3);
        break;
      }
      node = node.parentElement;
    }
    const foreground = rgb(getComputedStyle(element).color);
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test("shared chrome gives every surface one header with back and close", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);

  const surfaces = [
    { open: () => page.getByTitle("Open StudyAI Studio").click(), dialog: "StudyAI Studio", eyebrow: "Studio", title: "StudyAI Studio", back: "Back to workspace", close: "Close Studio" },
    { open: () => page.getByTestId("open-concept-graph").click(), dialog: "Course concept graph", eyebrow: "Concepts", title: "Concept graph", back: "Back to workspace", close: "Close concept graph" },
    { open: () => page.getByRole("button", { name: "Study", exact: true }).click(), dialog: "Study session", eyebrow: "Study", title: "Study tutor", back: "Back to canvas", close: "Close study session" },
  ];

  for (const surface of surfaces) {
    await surface.open();
    const dialog = page.getByRole("dialog", { name: surface.dialog });
    await expect(dialog).toBeVisible();
    const header = dialog.locator(".surface-header");
    await expect(header).toHaveCount(1);
    await expect(header.locator(".surface-eyebrow")).toHaveText(surface.eyebrow);
    await expect(header.locator(".surface-title")).toHaveText(surface.title);
    await expect(header.getByRole("button", { name: surface.back })).toHaveCount(1);
    await expect(header.getByRole("button", { name: surface.close })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("shared notice uses the status role on the unified library", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion notice ${Date.now()}`, "Cohesion lesson");
  await page.route("**/api/studio/artifacts**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/slide-decks?course=**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await openCourse(page, course.title);
  await page.getByTitle("Open StudyAI Studio").click();

  const notice = page.locator('[data-testid="studio-surface"] [data-testid="library-status"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice).toHaveAttribute("aria-live", "polite");
  await expect(notice).toContainText("Loading your library");
});

test("topbar Study and lesson header open the same study stage", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion entry ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);
  const stage = page.locator(".study-stage");

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(stage).toHaveCount(1);
  await expect(stage.locator(".surface-subtitle")).toContainText("Cohesion lesson");
  await page.keyboard.press("Escape");
  await expect(stage).toHaveCount(0);

  await page.getByRole("button", { name: "Study this lesson" }).evaluate((element: HTMLElement) => element.click());
  await expect(stage).toHaveCount(1);
  await expect(stage.locator(".surface-subtitle")).toContainText("Cohesion lesson");
});

test("Studio keeps the lesson while switching between create and everything made", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion links ${Date.now()}`, "Cohesion lesson");
  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await openCourse(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toBeVisible();
  await expect(page.getByTestId("studio-surface")).toContainText("Cohesion lesson");
  await expect(page.getByTestId("studio-tab-slide_deck")).toBeVisible();

  await page.getByTestId("library-filter-slide_deck").click();
  await expect(page.getByTestId("library-empty")).toContainText("No artifacts yet");
  await expect(page.getByTestId("studio-surface")).toContainText("Cohesion lesson");
});

test("leaving study for activities offers a return to the study session", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion return ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);

  await page.getByRole("button", { name: "Study", exact: true }).click();
  const stage = page.locator(".study-stage");
  await expect(stage).toBeVisible();
  await stage.getByRole("button", { name: /Activities/ }).click();
  await expect(page.getByRole("heading", { name: "Learning activities" })).toBeVisible();
  await page.keyboard.press("Escape");

  const chip = page.getByRole("button", { name: "Back to study session" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(stage).toBeVisible();
  await expect(stage.locator(".surface-subtitle")).toContainText("Cohesion lesson");
  await expect(chip).toHaveCount(0);
});

test("changing lesson closes stale surfaces and clears cached context", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion stale ${Date.now()}`, "First lesson");
  const second = await createLesson(page.request, course.id, "Second lesson");
  await openCourse(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toContainText("First lesson");
  await pickLesson(page, second.id);
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);
  await expect(page.locator(".surface-header")).toHaveCount(0);

  await page.getByTitle("Open StudyAI Studio").click();
  await expect(page.getByTestId("studio-surface")).toContainText("Second lesson");
  await expect(page.getByTestId("studio-surface")).not.toContainText("First lesson");
});

test("surface entries are disabled without a course or lesson", async ({ page }) => {
  const course = await createCourse(page.request, `Cohesion empty ${Date.now()}`);
  await openCourse(page, course.title);
  const concepts = page.getByTestId("open-concept-graph");
  await expect(concepts).toBeEnabled();
  const entries = [
    page.getByTitle("Open StudyAI Studio"),
    page.getByRole("button", { name: "Study", exact: true }),
    page.getByRole("button", { name: "Study this lesson" }),
  ];
  for (const entry of entries) await expect(entry).toBeDisabled();
  for (const entry of entries) await entry.click({ force: true });
  await expect(page.locator(".surface-header")).toHaveCount(0);
  await expect(page.locator(".study-stage")).toHaveCount(0);

  // Studio is the only creation entry; the duplicate nav buttons are gone.
  await expect(page.getByTitle("Open Artifacts")).toHaveCount(0);
  await expect(page.getByTitle("Open Library")).toHaveCount(0);
});

test("top bar has four destinations and Cards lives inside Study", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion nav ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);

  await expect(page.locator(".immersive-actions button")).toHaveCount(4);
  await expect(page.getByTitle("Open Home")).toHaveCount(0);
  await expect(page.getByTitle("Open Today")).toHaveCount(0);
  await expect(page.getByTitle("Flashcards and review")).toHaveCount(0);
  await expect(page.locator(".immersive-actions button.primary")).toHaveCount(1);

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await page.getByTestId("study-cards-mode").click();
  await expect(page.getByTestId("flashcard-review")).toBeVisible();
  await page.getByRole("button", { name: "Close flashcard review" }).click();
  await expect(page.getByRole("dialog", { name: "Study session" })).toBeVisible();
});

test("citations from Studio artifacts, Studio decks and ConceptGraph open the cited source", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request, `Cohesion cite ${Date.now()}`, "Cohesion lesson");
  const source = await page.request.post("/api/documents", {
    data: { courseId: course.id, name: "cohesion-source.txt", content: "A cited line from the course source." },
  });
  const ref = `studyai://document/${(await source.json()).id as string}/page/1?chunk=0`;
  const guide = {
    id: "art-cite", courseId: course.id, lessonId: lesson.id, kind: "study-guide", title: "Cited guide",
    content: { title: "Cited guide", overview: "From the source.", sections: [{ heading: "Evidence", body: "The source states this.", sourceRefs: [ref] }], keyTerms: [] },
    sourceRefs: [ref], createdAt: new Date().toISOString(),
  };
  const deck = {
    id: "deck-cite", courseId: course.id, lessonId: lesson.id, kind: "slide_deck", title: "Cited deck",
    createdAt: new Date().toISOString(), collection: "Revision", filePath: "deck-cite/final.pptx", sourceRefs: [ref],
    content: {
      id: "sd-cite", kind: "slide_deck", sourceRefs: [ref], claims: [], objective: "Cite a source",
      templateId: "general-en", language: "en",
      slides: [{ role: "mechanism", title: "Claim", claims: [{ claim: "The source states this.", sourceRef: ref, excerpt: "A cited line", relationship: "direct" }], notes: "" }],
    },
  };
  const graph = {
    title: "Course concepts",
    nodes: [{ id: "n1", label: "Citation concept", parentId: null, sourceRef: ref, detail: "From the cited source", mastery: 1, canPractice: false }],
    edges: [],
  };

  await page.route("**/api/studio/artifacts**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/studio/generate", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(guide) }));
  await page.route("**/api/slide-decks?course=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([deck]) }));
  await page.route("**/api/slide-decks/artifact*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deck) }));
  await page.route("**/api/concepts/graph*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(graph) }));
  await openCourse(page, course.title);

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("studio-tab-study-guide").click();
  await page.getByTestId("citation-chip").first().click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "cohesion-source.txt" })).toBeVisible();

  await page.getByTitle("Open StudyAI Studio").click();
  await page.getByTestId("library-item").filter({ hasText: "Cited deck" }).getByTestId("library-open").click();
  await expect(page.getByTestId("slide-citation")).toHaveCount(1);
  await page.getByTestId("slide-citation").first().click();
  await expect(page.getByTestId("studio-surface")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "cohesion-source.txt" })).toBeVisible();

  await page.getByTestId("open-concept-graph").click();
  await expect(page.getByTestId("concept-graph")).toBeVisible();
  await page.locator(".studio-map-node").filter({ hasText: "Citation concept" }).first().click();
  await page.getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByTestId("concept-graph-surface")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "cohesion-source.txt" })).toBeVisible();
});

test("shared chrome stays readable in light and dark", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion contrast ${Date.now()}`, "Cohesion lesson");
  await page.route("**/api/studio/artifacts**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/slide-decks?course=**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await openCourse(page, course.title);
  await page.getByTitle("Open StudyAI Studio").click();

  const header = page.locator('[data-testid="studio-surface"] .surface-header');
  const parts = [header.locator(".surface-eyebrow"), header.locator(".surface-title"), header.locator(".surface-subtitle")];
  const notice = page.locator('[data-testid="studio-surface"] [data-testid="library-status"]');
  for (const part of parts) expect(await contrastOf(part)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(notice)).toBeGreaterThanOrEqual(4.5);

  await page.evaluate(() => document.querySelector(".app-shell")?.classList.add("dark"));
  await page.waitForTimeout(100);
  for (const part of parts) expect(await contrastOf(part)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(notice)).toBeGreaterThanOrEqual(4.5);
});

test("Escape and the return chip restore the study session", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion restore ${Date.now()}`, "Cohesion lesson");
  await openCourse(page, course.title);
  const stage = page.locator(".study-stage");

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(stage).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stage).toHaveCount(0);

  await page.getByRole("button", { name: "Study", exact: true }).click();
  await expect(stage).toBeVisible();
  await stage.getByRole("button", { name: /Course sources/ }).click();
  await expect(page.getByRole("heading", { name: "Document library" })).toBeVisible();

  const chip = page.getByRole("button", { name: "Back to study session" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(stage).toBeVisible();
  await expect(chip).toHaveCount(0);
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test.setTimeout(120_000);

async function openCourse(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await selectCourseOnPage(page, title);
  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
}

function namedMolecule(id: string, name: string) {
  const form = `${id}-form`;
  return {
    id, kind: "molecule", name, x: 420, y: 240, width: 260, height: 154,
    atoms: [{ id: `${id}-o`, element: "O", nonbondingElectrons: 4 }, { id: `${id}-c`, element: "C", nonbondingElectrons: 0 }],
    resonanceForms: [{ id: form, name: "Form 1", bonds: [{ id: `${id}-bond`, from: `${id}-o`, to: `${id}-c`, order: 2 }] }],
    activeResonanceId: form,
  };
}

async function seedObjects(request: APIRequestContext, course: { id: string }, lesson: { id: string }, objects: unknown[]) {
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const board = boards[0];
  const row = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const saved = await request.post("/api/canvases", {
    data: {
      id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name,
      document: { version: 1, snapshot: { document: { store: {} } }, objects },
      expectedRevision: row.revision,
    },
  });
  expect(saved.status()).toBe(200);
}

async function clickCanvasCitation(page: Page, ref: string) {
  await page.locator(".copilot-slot").evaluate((element, sourceRef) => {
    const link = document.createElement("a");
    link.href = `#studyai-citation=${sourceRef}`;
    link.textContent = "Cited canvas object";
    element.appendChild(link);
    link.click();
    link.remove();
  }, ref);
}

test("duplicate object labels are disambiguated by human name, never by id", async ({ page }) => {
  const { course, lesson } = await createCourseWithLesson(page.request, `Duplicate labels ${Date.now()}`, "Labelled board");
  await openCourse(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();
  await seedObjects(page.request, course, lesson, [namedMolecule("dup-alpha", "Shared name"), namedMolecule("dup-beta", "Shared name")]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".scientific-layer")).toBeVisible();
  if (!(await page.locator(".tutor-panel").isVisible())) {
    await page.getByRole("button", { name: "Toggle study tutor" }).click();
  }
  await expect(page.locator(".tutor-panel")).toBeVisible();

  await clickCanvasCitation(page, "science:dup-alpha");
  const card = page.getByTestId("selected-object-context");
  await expect(card).toContainText("Shared name (1 of 2)");
  await expect(card).not.toContainText("dup-alpha");

  await clickCanvasCitation(page, "science:dup-beta");
  await expect(card).toContainText("Shared name (2 of 2)");
  await expect(card).not.toContainText("dup-beta");
  await page.screenshot({ path: "test-results/shots/canvas-duplicate-labels.png", fullPage: true });
});

test("shell motion uses the shared 180-220ms tokens and reverses cleanly", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Cohesion motion ${Date.now()}`, "Motion lesson");
  await openCourse(page, course.title);
  const toggle = page.getByTitle("Toggle courses");

  await toggle.click();
  const durations = await page.evaluate(() => {
    const toMs = (value: string) => value === "0s" ? 0 : value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
    const sidebar = document.querySelector(".app-shell .sidebar");
    const scrim = document.querySelector(".app-shell .sidebar-scrim");
    return {
      sidebar: sidebar ? toMs(getComputedStyle(sidebar).transitionDuration) : -1,
      scrim: scrim ? toMs(getComputedStyle(scrim).animationDuration) : -1,
    };
  });
  expect(durations.sidebar).toBeGreaterThanOrEqual(180);
  expect(durations.sidebar).toBeLessThanOrEqual(220);
  expect(durations.scrim).toBeGreaterThanOrEqual(180);
  expect(durations.scrim).toBeLessThanOrEqual(220);

  const scrim = page.locator(".sidebar-scrim");
  if (await scrim.isVisible()) await scrim.click();
  else await toggle.click();
  await expect(page.locator(".app-shell .sidebar")).toHaveCount(0);
  await toggle.click();
  await expect(page.locator(".app-shell .sidebar")).toBeVisible();
});

test("phone width keeps the board usable and the tutor dockable", async ({ page }) => {
  const { course } = await createCourseWithLesson(page.request, `Phone cohesion ${Date.now()}`, "Phone lesson");
  await page.setViewportSize({ width: 375, height: 812 });
  await openCourse(page, course.title);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".canvas-board")).toBeVisible();

  await page.getByTitle("Close tutor").click();
  await expect(page.locator(".tutor-panel")).toHaveCount(0);
  await page.getByRole("button", { name: /Open tutor/i }).click();
  await expect(page.locator(".tutor-panel")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/canvas-phone-width.png", fullPage: true });
});

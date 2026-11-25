import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

async function seedMolecule(request: APIRequestContext, course: { id: string }, lesson: { id: string }, id: string) {
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const board = boards[0];
  const row = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const document = {
    version: 1, snapshot: { document: { store: {} } },
    objects: [{ id, kind: "molecule", name: "Cited molecule", x: 420, y: 240, width: 260, height: 154,
      atoms: [{ id: `${id}-o`, element: "O", nonbondingElectrons: 4 }, { id: `${id}-c`, element: "C", nonbondingElectrons: 0 }],
      resonanceForms: [{ id: `${id}-form`, name: "Form 1", bonds: [{ id: `${id}-bond`, from: `${id}-o`, to: `${id}-c`, order: 2 }] }], activeResonanceId: `${id}-form` }],
  };
  const saved = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name, document, expectedRevision: row.revision } });
  expect(saved.status()).toBe(200);
}

async function seedConcept(request: APIRequestContext, course: { id: string }, lesson: { id: string }, id: string) {
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const board = boards[0];
  const row = await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const document = { version: 1, snapshot: { document: { store: {} } }, objects: [{ id, kind: "concept", title: "Cited concept", definition: "", x: 420, y: 240, width: 260, height: 154 }] };
  const saved = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name, document, expectedRevision: row.revision } });
  expect(saved.status()).toBe(200);
}

async function clickCanvasCitation(page: Page, ref: string) {
  await page.locator(".copilot-slot").evaluate((element, citationRef) => {
    const link = document.createElement("a");
    link.href = `#studyai-citation=${citationRef}`;
    link.textContent = "Cited canvas object";
    link.dataset.testid = "canvas-citation-link";
    link.style.cssText = "position:fixed;top:80px;left:80px;z-index:99999;background:white;color:black;padding:6px";
    element.appendChild(link);
  }, ref);
  await page.getByTestId("canvas-citation-link").click();
}

test("a Tutor canvas citation focuses and highlights the named object", async ({ page }) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(page.request, `Canvas citation ${Date.now()}`, "Cited board");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();
  await seedMolecule(page.request, course, lesson, "cite-molecule");
  await page.reload();
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();
  await page.getByRole("button", { name: "Lecture", exact: true }).click();
  await expect(page.locator(".scientific-layer")).toBeHidden();

  await clickCanvasCitation(page, "science:cite-molecule");

  await expect(page.locator(".scientific-layer")).toBeVisible();
  await expect(page.getByTestId("selected-object-context")).toContainText("Cited molecule");
  await expect(page.locator(".scientific-layer .steppable-highlight")).toHaveCount(1);
  await page.screenshot({ path: "test-results/shots/tutor-canvas-citation-focus.png", fullPage: true });
});

test("tutor actions follow the selected canvas object by human name", async ({ page }) => {
  test.setTimeout(240_000);
  const { course, lesson } = await createCourseWithLesson(page.request, `Tutor context ${Date.now()}`, "Context board");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();
  await seedConcept(page.request, course, lesson, "context-object");
  await page.reload();
  await selectCourseOnPage(page, course.title);
  await expect(page.locator(".scientific-layer")).toBeVisible();

  const actions = page.getByTestId("tutor-empty-actions");
  await expect(actions).toBeVisible();
  await expect(actions).toContainText(/course passage/i);
  await expect(actions).not.toContainText(/Ask about /);

  await clickCanvasCitation(page, "science:context-object");
  await expect(page.getByTestId("selected-object-context")).toContainText("Cited concept");
  await expect(actions).toContainText("Cited concept");
  await expect(actions.locator("button")).toHaveCount(2);
  await actions.locator("button", { hasText: "Cited concept" }).click();

  const answer = page.locator('[data-testid="copilot-assistant-message"]').last();
  await expect(answer).toBeVisible({ timeout: 180_000 });
  await expect(async () => {
    const text = await answer.innerText();
    const cited = await answer.locator('a[href^="#studyai-citation="]').count();
    const abstained = /no course evidence|not in your course material/i.test(text);
    expect(cited > 0 || abstained).toBe(true);
  }).toPass({ timeout: 180_000 });
});

test("a stale canvas citation fails safely with a plain message", async ({ page }) => {
  test.setTimeout(90_000);
  const { course } = await createCourseWithLesson(page.request, `Stale canvas citation ${Date.now()}`, "Cited board");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await clickCanvasCitation(page, "science:deleted-object");

  await expect(page.locator(".top-actions .saved")).toContainText(/no longer on this board/i);
  await expect(page.locator(".scientific-layer .steppable-highlight")).toHaveCount(0);
});

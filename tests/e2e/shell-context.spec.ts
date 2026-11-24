import { expect, test, type Page } from "@playwright/test";
import { pdfFixture } from "../fixtures/document-intelligence.js";
import { createCourseWithLesson, createLesson, selectCourseOnPage } from "./helpers";

async function selectCourse(page: Page, title: string) {
  const toggle = page.getByTitle("Toggle courses");
  if (await toggle.isVisible() && !(await page.locator(".app-shell").evaluate((element) => element.classList.contains("sidebar-open")))) await toggle.click();
  const showAll = page.getByTestId("show-all-courses");
  if (await showAll.isVisible()) await showAll.click();
  await selectCourseOnPage(page, title);
}

async function pickLocalModel(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  const modelSelect = page.getByTestId("model-select");
  // Under an explicit non-Ollama provider the picker is correctly disabled; the
  // provider/model already comes from the environment, so just close Settings.
  if (await modelSelect.isEnabled()) {
    await modelSelect.selectOption("qwen3.5:0.8b");
    await expect(page.getByTestId("model-provider-note")).toContainText("local Ollama service");
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

test("humanises lesson titles and hides generated courses in a flooded picker", async ({ page }) => {
  test.setTimeout(90_000);
  const real = [
    { id: "chem-120", title: "CHEM 120", code: "General chemistry", color: "#888888" },
    { id: "biol-130", title: "BIOL 130", code: "Cell biology", color: "#888888" },
    { id: "kin-120", title: "KIN 120", code: "Biomechanics", color: "#888888" },
  ];
  const generated = Array.from({ length: 105 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Tutor math ${1795000000000 + index}`,
    code: `Tutor math ${1795000000000 + index}`,
    color: "#888888",
  }));
  await page.route("**/api/courses", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...real, ...generated]) }));
  await page.route("**/api/lessons?course=kin-120", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "lesson-kin", title: "kin120" }]) }));
  await page.addInitScript(() => { localStorage.setItem("studyai.course", "kin-120"); localStorage.setItem("studyai.lesson.kin-120", "lesson-kin"); });
  await page.goto("/");
  await page.getByTitle("Toggle courses").click();

  await expect(page.getByRole("heading", { level: 1, name: "KIN 120", exact: true })).toBeVisible();
  await expect(page.locator(".lesson-header")).not.toContainText("kin120");
  await expect(page.getByLabel("Active lesson")).toHaveText("KIN 120");
  await expect(page.locator(".course-list .course-item")).toHaveCount(3);
  await expect(page.locator(".course-list")).not.toContainText("Tutor math");
  await expect(page.getByTestId("show-all-courses")).toHaveText("Show 105 more courses");
  await page.getByTestId("show-all-courses").click();
  await expect(page.locator(".course-list .course-item")).toHaveCount(108);
});

test("shows real document filenames instead of stale import labels", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourse(page, course.title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();
  await page.locator(".di-file-input").setInputFiles({ name: "cross-products-notes.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfFixture("Cross products produce a moment vector.")) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.route("**/api/document-intelligence/documents?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.documents = body.documents.map((document: { filename: string; title: string }) => document.filename === "cross-products-notes.pdf" ? { ...document, title: "KIN 472 – Section 24  Upper Extremity Disorders" } : document);
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.reload();
  await selectCourse(page, course.title);
  await page.getByRole("button", { name: "Lecture", exact: true }).click();

  await expect(page.locator(".di-document-card strong").first()).toHaveText("cross-products-notes.pdf");
  await expect(page.locator(".di-document-grid")).not.toContainText("KIN 472");
  await page.getByRole("button", { name: /cross-products-notes\.pdf/ }).click();
  await expect(page.getByRole("dialog", { name: "cross-products-notes.pdf" })).toBeVisible();
  await expect(page.locator(".di-viewer-heading strong")).toHaveText("cross-products-notes.pdf");
});

test("keeps the canvas out from under the tutor panel", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourse(page, course.title);
  const board = await expect(page.locator(".canvas-board")).toBeVisible().then(() => page.locator(".canvas-board").boundingBox());
  const tutor = await page.locator(".tutor-panel").boundingBox();
  expect(board).not.toBeNull();
  expect(tutor).not.toBeNull();
  expect(board!.x + board!.width).toBeLessThanOrEqual(tutor!.x + 1);
  const padding = await page.locator(".work-area").evaluate((element) => getComputedStyle(element).paddingRight);
  expect(parseFloat(padding)).toBeGreaterThan(300);
});

test("clears tutor chat when the student changes course or lesson", async ({ page, request }) => {
  test.setTimeout(240_000);
  const first = await createCourseWithLesson(request, `Context one ${Date.now()}`, "First lesson");
  const second = await createCourseWithLesson(request, `Context two ${Date.now()}`, "Second lesson");
  const anotherLesson = await createLesson(request, second.course.id, "Third lesson");
  await page.goto("/");
  await selectCourse(page, first.course.title);
  await pickLocalModel(page);
  const chat = page.getByTestId("copilot-chat-textarea");
  await chat.fill("Reply with exactly: STUDYAI-CHECK-ONE");
  await chat.press("Enter");
  await expect(page.locator(".copilot-slot").getByText("STUDYAI-CHECK-ONE").last()).toBeVisible({ timeout: 120_000 });

  await selectCourse(page, second.course.title);
  await expect(page.locator(".copilot-slot")).not.toContainText("STUDYAI-CHECK-ONE");
  await chat.fill("Reply with exactly: STUDYAI-CHECK-TWO");
  await chat.press("Enter");
  await expect(page.locator(".copilot-slot").getByText("STUDYAI-CHECK-TWO").last()).toBeVisible({ timeout: 120_000 });

  await page.getByLabel("Active lesson").selectOption(anotherLesson.id);
  await expect(page.locator(".copilot-slot")).not.toContainText("STUDYAI-CHECK-TWO");
});

test("publishes the selected scientific object into Tutor context", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { course } = await createCourseWithLesson(request);
  await page.goto("/");
  await selectCourse(page, course.title);
  await expect(page.getByRole("button", { name: "Force", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Force", exact: true }).click();
  await expect(page.locator(".science-placement-surface")).toBeVisible();
  const board = await page.locator(".canvas-board").boundingBox();
  expect(board).not.toBeNull();
  const centreX = board!.x + board!.width / 2, centreY = board!.y + board!.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX + 80, centreY, { steps: 6 });
  await page.mouse.up();
  const context = page.getByTestId("selected-object-context");
  await expect(context).toBeVisible();
  await expect(context).toContainText("Force");
  await expect(context).not.toContainText(/^[0-9a-f]{8}-/);
});

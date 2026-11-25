import { expect, test } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

test("keeps Tutor replies direct and canvas descriptions semantic", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { course, lesson } = await createCourseWithLesson(request, `Tutor experience ${Date.now()}`, "Synthetic canvas context");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();

  await expect.poll(async () => (await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json())).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const boards = await request.get(`/api/canvases?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const board = await request.get(`/api/canvases/${boards[0].id}?course=${course.id}&lesson=${lesson.id}`).then((response) => response.json());
  const document = JSON.parse(board.document);
  const suffix = Date.now();
  const arrowId = `shape:tutor-arrow-${suffix}`;
  const labelId = `shape:tutor-label-${suffix}`;
  document.snapshot.document.store[arrowId] = { id: arrowId, typeName: "shape", type: "arrow", x: 300, y: 180, rot: 0, z: 1, props: { dx: 100, dy: 0, bend: 0, color: "black", size: "m" } };
  document.snapshot.document.store[labelId] = { id: labelId, typeName: "shape", type: "text", x: 410, y: 175, rot: 0, z: 2, props: { text: "50 m", color: "black", size: "m", font: "sans", autosize: true, scale: 1 } };
  const save = await request.post("/api/canvases", { data: { id: board.id, courseId: course.id, lessonId: lesson.id, name: board.name, document, expectedRevision: board.revision } });
  expect(save.status()).toBe(200);
  await page.reload();
  await selectCourseOnPage(page, course.title);

  const tutor = page.locator(".copilot-slot");
  const assistant = tutor.locator('[data-testid="copilot-assistant-message"]');
  const chat = page.getByTestId("copilot-chat-textarea");
  await expect(page.locator(".suggestions")).toHaveCount(0);
  await expect(page.getByTestId("tutor-empty-actions")).toBeVisible();
  await expect(page.getByTestId("tutor-empty-actions")).toContainText(/explain a visible step|find a course passage/i);

  await chat.fill("Reply with exactly: STUDYAI-OLLAMA-OK");
  await chat.press("Enter");
  await expect(assistant.last()).toHaveText("STUDYAI-OLLAMA-OK", { timeout: 30_000 });
  await expect(assistant.last()).not.toContainText(/Retrieved candidate excerpts|Context note:/);

  await chat.fill("Hello");
  await chat.press("Enter");
  await expect(assistant.last()).toContainText(/hello/i, { timeout: 30_000 });

  await chat.fill("What is on the board?");
  await chat.press("Enter");
  await expect(assistant.last()).toContainText("50 m", { timeout: 30_000 });
  await expect(assistant.last()).toContainText("arrow");
  await expect(assistant.last()).not.toContainText(new RegExp(arrowId));
  await expect(assistant.last()).not.toContainText(/coordinates?:|\bx\s*[=:]\s*\d+|\by\s*[=:]\s*\d+/i);
});

test("tutor starting actions meet the size and type tokens", async ({ page, request }) => {
  const { course } = await createCourseWithLesson(request, `Tutor tokens ${Date.now()}`, "Token lesson");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  const actions = page.getByTestId("tutor-empty-actions");
  await expect(actions).toBeVisible();

  const measure = () => actions.evaluate((element) => {
    const button = element.querySelector("button")!;
    const label = element.querySelector("span")!;
    const box = button.getBoundingClientRect();
    return {
      height: box.height,
      width: box.width,
      font: parseFloat(getComputedStyle(button).fontSize),
      labelFont: parseFloat(getComputedStyle(label).fontSize),
    };
  });

  const desktop = await measure();
  expect(desktop.height).toBeGreaterThanOrEqual(36);
  expect(desktop.font).toBeGreaterThanOrEqual(12);
  expect(desktop.labelFont).toBeGreaterThanOrEqual(12);

  await page.setViewportSize({ width: 375, height: 812 });
  const phone = await measure();
  expect(phone.height).toBeGreaterThanOrEqual(44);
  expect(phone.width).toBeGreaterThanOrEqual(44);

  const button = actions.locator("button").first();
  await button.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

import { expect, test, type Page } from "@playwright/test";
import { createCourseWithLesson, selectCourseOnPage } from "./helpers";

type PenPoint = { x: number; y: number; pressure: number };

async function openBoard(page: Page) {
  const { course, lesson } = await createCourseWithLesson(page.request, `PEN UX ${Date.now()}`, "Pen interaction");
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await expect(page.getByRole("button", { name: "Choose canvas board" })).toBeVisible();
  const opener = page.getByRole("button", { name: "Open canvas tools", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("button", { name: "Draw — D", exact: true }).click();
  return { course, lesson };
}

async function firePointer(page: Page, type: "pointerdown" | "pointermove" | "pointerup", point: PenPoint, pointerType: "pen" | "touch" | "mouse", pointerId = 7) {
  await page.evaluate(({ type, point, pointerType, pointerId }) => {
    const canvas = document.querySelector(".quickdraw-native canvas.qd-canvas");
    if (!canvas) throw new Error("Quickdraw canvas missing");
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId, pointerType, isPrimary: true,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: rect.left + point.x, clientY: rect.top + point.y, pressure: point.pressure,
    }));
  }, { type, point, pointerType, pointerId });
}

async function penStroke(page: Page, points: PenPoint[], pointerType: "pen" | "touch" | "mouse" = "pen") {
  await firePointer(page, "pointerdown", points[0], pointerType);
  for (let i = 1; i < points.length; i++) await firePointer(page, "pointermove", points[i], pointerType);
  await firePointer(page, "pointerup", points[points.length - 1], pointerType);
}

type SavedBoard = { id: string; revision: number; document: string | { snapshot?: { document?: { store?: Record<string, { type?: string; props?: { pts?: number[] } }> } } } };

async function savedBoard(page: Page, courseId: string, lessonId: string): Promise<SavedBoard & { parsed: Record<string, { type?: string; props?: { pts?: number[] } }> }> {
  const rows = await page.request.get(`/api/canvases?course=${courseId}&lesson=${lessonId}`).then((r) => r.json()) as Array<{ id: string }>;
  const row = await page.request.get(`/api/canvases/${rows[0].id}?course=${courseId}&lesson=${lessonId}`).then((r) => r.json()) as SavedBoard;
  const parsed = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
  return { ...row, parsed: parsed?.snapshot?.document?.store ?? {} };
}

async function drawStrokeCount(page: Page, courseId: string, lessonId: string): Promise<number> {
  const board = await savedBoard(page, courseId, lessonId);
  return Object.values(board.parsed).filter((record) => record.type === "draw").length;
}

test("scratch-out erases the covered stroke and one undo restores it", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await openBoard(page);
  await penStroke(page, Array.from({ length: 7 }, (_, i) => ({ x: 150 + i * 18, y: 200, pressure: 0.5 })), "mouse");
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(1);

  const scratch = Array.from({ length: 8 }, (_, i) => ({ x: i % 2 === 0 ? 160 : 240, y: 198 + (i % 3) * 2, pressure: 0.6 }));
  await penStroke(page, scratch, "mouse");
  await expect(page.locator(".canvas-board")).toHaveAttribute("data-last-pen-gesture", "scratch");
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(0);

  await page.getByRole("button", { name: "Undo canvas change" }).click();
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(1);
});

test("circle-select selects only enclosed strokes without erasing them", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await openBoard(page);
  await penStroke(page, Array.from({ length: 6 }, (_, i) => ({ x: 200 + i * 12, y: 200, pressure: 0.5 })), "mouse");
  await penStroke(page, Array.from({ length: 6 }, (_, i) => ({ x: 420 + i * 12, y: 300, pressure: 0.5 })), "mouse");
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(2);

  const before = await savedBoard(page, course.id, lesson.id);
  const draws = Object.entries(before.parsed).filter(([, record]) => record.type === "draw") as Array<[string, { x: number; props?: { pts?: number[] } }]>;
  const pageX = (record: { x: number; props?: { pts?: number[] } }) => record.x + (record.props?.pts?.[0] ?? 0);
  const insideId = draws.find(([, record]) => pageX(record) < 300)![0];
  const outsideId = draws.find(([, record]) => pageX(record) > 300)![0];

  const circle = Array.from({ length: 17 }, (_, i) => ({
    x: 232 + 72 * Math.cos((i * 2 * Math.PI) / 16),
    y: 205 + 72 * Math.sin((i * 2 * Math.PI) / 16),
    pressure: 0.5,
  }));
  await penStroke(page, circle, "mouse");

  const selection = page.locator(".canvas-board");
  await expect(selection).toHaveAttribute("data-selected-shape-ids", new RegExp(`(^|,)${insideId}(,|$)`));
  expect(await selection.getAttribute("data-selected-shape-ids")).not.toContain(outsideId);
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(2);
});

test("palm rejection ignores touch after a pen is seen, opts out cleanly, and persists", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await openBoard(page);
  const palm = page.getByRole("checkbox", { name: "Palm rejection" });
  await expect(palm).toBeChecked();

  const penPoints = Array.from({ length: 6 }, (_, i) => ({ x: 110 + i * 24, y: 130 + i * 6, pressure: 0.4 + i * 0.08 }));
  const touchPoints = Array.from({ length: 5 }, (_, i) => ({ x: 320 + i * 22, y: 300 - i * 5, pressure: 0.5 }));

  await penStroke(page, penPoints, "pen");
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(1);

  // A resting palm (touch pointer) must not add ink while pen mode is armed.
  await penStroke(page, touchPoints, "touch");
  await page.waitForTimeout(800);
  expect(await drawStrokeCount(page, course.id, lesson.id)).toBe(1);

  // Opting out re-enables touch immediately through Editor.setPenMode(false).
  await palm.uncheck();
  expect(await page.evaluate(() => localStorage.getItem("studyai.canvas.palmRejection"))).toBe("off");
  await penStroke(page, touchPoints, "touch");
  await expect.poll(() => drawStrokeCount(page, course.id, lesson.id), { timeout: 15_000 }).toBe(2);

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Palm rejection" })).not.toBeChecked();
});

test("pen capture smooths pressure: saved pressure differs from raw synthetic pointer pressure", async ({ page }) => {
  test.setTimeout(120_000);
  const { course, lesson } = await openBoard(page);
  const rawPressures = [0.2, 0.9, 0.3, 0.85, 0.25, 0.8];
  const points = rawPressures.map((pressure, i) => ({ x: 120 + i * 26, y: 150 + Math.sin(i) * 12, pressure }));
  await penStroke(page, points);

  await expect(page.getByRole("button", { name: "Draw — D", exact: true })).toHaveClass(/on/);
  await expect.poll(async () => {
    const board = await savedBoard(page, course.id, lesson.id);
    return Object.values(board.parsed).filter((record) => record.type === "draw").length;
  }, { timeout: 15_000 }).toBeGreaterThan(0);

  const saved = await savedBoard(page, course.id, lesson.id);
  const strokes = Object.values(saved.parsed).filter((record) => record.type === "draw" && Array.isArray(record.props?.pts));
  expect(strokes.length).toBeGreaterThan(0);
  const pressures = strokes[0].props!.pts!.filter((_, index) => index % 3 === 2);
  expect(pressures).toHaveLength(rawPressures.length);
  // PointerEvent stores pressure as float32 (~1e-8 drift); require a real curve/taper change.
  const maxDelta = Math.max(...pressures.map((value, index) => Math.abs(value - rawPressures[index])));
  expect(maxDelta).toBeGreaterThan(0.02);
  expect(pressures.every((value) => Number.isFinite(value) && value >= 0.05 && value <= 1)).toBe(true);
});

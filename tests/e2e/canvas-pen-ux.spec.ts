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

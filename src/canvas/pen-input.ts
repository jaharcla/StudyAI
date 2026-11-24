// StudyAI-owned capture-boundary pen input. See docs/decisions/ADR-2026-11-22-pen-ux.md.
// We do NOT patch @quickdrawjs: the editor owns geometry (editor.js:645-680) and
// already streamlines/tapers at render (freehand.js:9-50). We only normalise the
// captured pressure through the documented Store.update API while a stroke is live.

export const PALM_REJECTION_KEY = "studyai.canvas.palmRejection";

/** Default on: Quickdraw only auto-arms pen mode after a stylus is seen, so
 * mouse-only (and touch-only) users keep drawing until that happens. */
export function readPalmRejection(): boolean {
  try { return globalThis.localStorage.getItem(PALM_REJECTION_KEY) !== "off"; }
  catch { return true; }
}

export function writePalmRejection(on: boolean): void {
  try { globalThis.localStorage.setItem(PALM_REJECTION_KEY, on ? "on" : "off"); }
  catch { /* storage unavailable — keep the in-memory choice */ }
}

export interface PenPoint2D { x: number; y: number; pointerType?: string; pressure?: number }
export interface CircleGesture { center: { x: number; y: number }; radius: number }

const TRAIL_FOLLOW = 0.55;

/** Exponential follow on coordinates, so gesture recognition sees the same
 * intent-level trail the pressure curve uses. Bounds work in page coordinates. */
export function smoothPenTrail(points: PenPoint2D[]): PenPoint2D[] {
  if (points.length < 2) return points.slice();
  const out: PenPoint2D[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const previous = out[i - 1];
    out.push({ ...point, x: previous.x + (point.x - previous.x) * TRAIL_FOLLOW, y: previous.y + (point.y - previous.y) * TRAIL_FOLLOW });
  }
  return out;
}

function boundsOf(points: PenPoint2D[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathLength(points: PenPoint2D[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** A back-and-forth scribble: several direction reversals along the dominant
 * axis and a path much longer than its bounding diagonal. */
export function isScratchOut(points: PenPoint2D[]): boolean {
  if (points.length < 6) return false;
  const bounds = boundsOf(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < 20 || pathLength(points) < diagonal * 2.2) return false;
  const axis = bounds.width >= bounds.height ? "x" : "y";
  let direction = 0;
  let reversals = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i][axis] - points[i - 1][axis];
    if (Math.abs(delta) < 2) continue;
    const sign = Math.sign(delta);
    if (direction !== 0 && sign !== direction) reversals++;
    direction = sign;
  }
  return reversals >= 3;
}

/** A closed, roughly round loop. Returns page-space centre and radius. */
export function isCircle(points: PenPoint2D[]): CircleGesture | null {
  if (points.length < 9) return null;
  const bounds = boundsOf(points);
  const aspect = bounds.width / Math.max(1, bounds.height);
  if (bounds.width < 24 || bounds.height < 24 || aspect < 0.5 || aspect > 2) return null;
  // A closing point repeats the start; the bbox centre is unaffected by that,
  // unlike the arithmetic mean of the samples.
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  if (radius < 12 || Math.min(...radii) < radius * 0.85 || Math.max(...radii) > radius * 1.15) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) > radius * 0.6) return null;
  let turning = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i].x - points[i - 1].x, ay = points[i].y - points[i - 1].y;
    const bx = points[i + 1].x - points[i].x, by = points[i + 1].y - points[i].y;
    turning += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  if (turning < 4.2 || turning > 11) return null;
  return { center, radius };
}

const MIN_PRESSURE = 0.05;
const PRESSURE_FOLLOW = 0.55;
const PRESSURE_GAMMA = 0.85;
const TAPER_DISTANCE = 24;
const TAPER_STRENGTH = 0.65;

const clampPressure = (value: number): number => Math.min(1, Math.max(MIN_PRESSURE, value));

/**
 * Transform the pressure component of a Quickdraw `props.pts` triplet array
 * ([x, y, pressure, ...]) using an exponential follow, a velocity taper and a
 * pressure curve. Coordinates and array length are preserved exactly, so the
 * result stays compatible with the installed `strokeOutline` renderer.
 */
export function smoothCapturedPressure(pts: number[]): number[] {
  const count = Math.floor(pts.length / 3);
  if (count <= 1) return pts.slice();

  const out = pts.slice();
  let prevX = pts[0];
  let prevY = pts[1];
  let prevPressure = clampPressure(pts[2]);

  for (let i = 1; i < count; i++) {
    const x = pts[i * 3];
    const y = pts[i * 3 + 1];
    const raw = pts[i * 3 + 2];
    const distance = Math.hypot(x - prevX, y - prevY);
    const taper = 1 / (1 + Math.min(1, distance / TAPER_DISTANCE) * TAPER_STRENGTH);
    const follow = prevPressure + (clampPressure(raw) - prevPressure) * PRESSURE_FOLLOW;
    out[i * 3 + 2] = clampPressure(Math.pow(follow, PRESSURE_GAMMA) * taper);
    prevX = x;
    prevY = y;
    prevPressure = out[i * 3 + 2];
  }
  return out;
}

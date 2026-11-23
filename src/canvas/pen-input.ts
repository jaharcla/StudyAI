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

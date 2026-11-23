/**
 * Board-aware layout planning. The tutor states what content it needs and how big it is; this
 * module decides where it goes, using the same shape bounds the rest of the canvas uses.
 *
 * Rules, in order: nothing may be placed over existing content; reading order is left-to-right then
 * top-to-bottom; everything stays inside the viewport; if the set cannot fit, place NOTHING and
 * return a conflict with a suggestion. Placement is all-or-nothing so a proposal can never
 * half-apply, and it is a pure function of its inputs so the same request lands in the same place.
 */

export type LayoutRect = { x: number; y: number; width: number; height: number };
export type LayoutRequest = { id: string; width: number; height: number };
export type LayoutPlacement = { id: string; rect: LayoutRect };

export type LayoutResult =
  | { status: "placed"; placements: LayoutPlacement[] }
  | { status: "conflict"; reason: string; suggestion: LayoutRect; requiredArea: { width: number; height: number } };

export type LayoutOptions = {
  /** Required clear space between any two things on the board, in canvas units. */
  gap?: number;
  /** Top-left corner the planner starts reading from. */
  anchor?: { x: number; y: number };
  /** Reading order for the content: across then down (default), or down then across. */
  order?: "row" | "column";
};

const DEFAULT_GAP = 60;

const pad = (rect: LayoutRect, gap: number): LayoutRect => ({ x: rect.x - gap, y: rect.y - gap, width: rect.width + gap * 2, height: rect.height + gap * 2 });
const intersects = (a: LayoutRect, b: LayoutRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (rect: LayoutRect, viewport: LayoutRect) => rect.x >= viewport.x && rect.y >= viewport.y && rect.x + rect.width <= viewport.x + viewport.width && rect.y + rect.height <= viewport.y + viewport.height;
const compare = (order: "row" | "column") => (a: LayoutRect, b: LayoutRect) => order === "row"
  ? (a.y === b.y ? a.x - b.x : a.y - b.y)
  : (a.x === b.x ? a.y - b.y : a.x - b.x);

/** First positions worth trying, ordered as reading order. Grows as the planner fills the board. */
function candidateSlots(blocked: LayoutRect[], viewport: LayoutRect, anchor: { x: number; y: number }, gap: number, order: "row" | "column"): LayoutRect[] {
  const seeds = [{ x: anchor.x, y: anchor.y }, ...blocked.map((rect) => ({ x: rect.x + rect.width + gap, y: rect.y }), ), ...blocked.map((rect) => ({ x: anchor.x, y: rect.y + rect.height + gap }))];
  const seen = new Set<string>();
  const slots: LayoutRect[] = [];
  for (const seed of seeds) {
    if (seed.x < viewport.x || seed.y < viewport.y) continue;
    // A seed to the right or below existing content inherits the free width/height down to the
    // viewport edge; the fit test narrows it to the request.
    const rect = { x: seed.x, y: seed.y, width: viewport.x + viewport.width - seed.x, height: viewport.y + viewport.height - seed.y };
    if (rect.width <= 0 || rect.height <= 0) continue;
    const key = `${Math.round(rect.x)},${Math.round(rect.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push(rect);
  }
  return slots.sort(compare(order));
}

export function planLayout(requests: readonly LayoutRequest[], occupancy: readonly LayoutRect[], viewport: LayoutRect, options: LayoutOptions = {}): LayoutResult {
  const gap = options.gap ?? DEFAULT_GAP;
  const order = options.order ?? "row";
  const anchor = options.anchor ?? { x: viewport.x + gap, y: viewport.y + gap };
  if (!requests.length) return { status: "placed", placements: [] };
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    return { status: "conflict", reason: "The active viewport has no measurable area, so nothing can be placed.", suggestion: { ...anchor, width: 0, height: 0 }, requiredArea: measure(requests) };
  }

  // One pass with the board's own content blocking; nothing is committed until every request fits.
  const tentative = occupancy.map((rect) => pad(rect, gap));
  const placements: LayoutPlacement[] = [];
  for (const request of requests) {
    const fitted = fitSize(candidateSlots(tentative, viewport, anchor, gap, order), { width: request.width, height: request.height }, tentative, viewport, gap);
    if (!fitted) return { status: "conflict", reason: `No clear ${request.width}×${request.height} area remains on this board for "${request.id}".`, suggestion: suggest(requests, occupancy, viewport, anchor, gap), requiredArea: measure(requests) };
    placements.push({ id: request.id, rect: fitted });
    tentative.push(pad(fitted, gap));
  }
  return { status: "placed", placements };
}

function fitSize(slots: LayoutRect[], size: { width: number; height: number }, tentative: LayoutRect[], viewport: LayoutRect, gap: number): LayoutRect | null {
  for (const slot of slots) {
    const rect = { x: slot.x, y: slot.y, ...size };
    if (!inside(rect, viewport)) continue;
    if (tentative.some((blocked) => intersects(pad(rect, gap), blocked))) continue;
    return rect;
  }
  return null;
}

/** Where the set *would* go if the student clears space: stacked below everything, from the anchor column. */
function suggest(requests: readonly LayoutRequest[], occupancy: readonly LayoutRect[], viewport: LayoutRect, anchor: { x: number; y: number }, gap: number): LayoutRect {
  const area = measure(requests);
  const floor = occupancy.length ? Math.max(...occupancy.map((rect) => rect.y + rect.height)) : anchor.y;
  return { x: anchor.x, y: floor + gap, width: area.width, height: area.height };
}

function measure(requests: readonly LayoutRequest[]): { width: number; height: number } {
  const gap = DEFAULT_GAP;
  return { width: requests.reduce((sum, request) => sum + request.width + gap, 0), height: Math.max(0, ...requests.map((request) => request.height)) };
}

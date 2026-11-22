import { z } from "zod";
import { canvasActionSchema, type CanvasActionBatch } from "./canvas-actions";

const nodeId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);

export const teachingSceneSchema = z.object({
  boardId: z.string().min(1).max(200),
  direction: z.enum(["right", "down"]).default("right"),
  nodes: z.array(z.object({
    id: nodeId,
    label: z.string().min(1).max(80),
    kind: z.enum(["box", "note"]).default("box"),
  })).min(2).max(8),
  edges: z.array(z.object({
    from: nodeId,
    to: nodeId,
    label: z.string().max(80).optional(),
  })).max(10).default([]),
  steps: z.array(z.object({
    title: z.string().min(1).max(120),
    highlight: z.array(nodeId).max(2).default([]),
  })).max(4).default([]),
  reason: z.string().min(1).max(1000),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.nodes.map((node) => node.id));
  if (ids.size !== value.nodes.length) context.addIssue({ code: "custom", message: "Node ids must be unique." });
  for (const edge of value.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) context.addIssue({ code: "custom", message: "Edge references an unknown node id." });
    if (edge.from === edge.to) context.addIssue({ code: "custom", message: "Self edges are not supported." });
  }
  for (const step of value.steps) {
    for (const id of step.highlight) {
      if (!ids.has(id)) context.addIssue({ code: "custom", message: "Step highlights an unknown node id." });
    }
  }
});

export type TeachingScene = z.infer<typeof teachingSceneSchema>;

const CELL_WIDTH = 180;
const CELL_HEIGHT = 70;
const GAP_X = 60;
const GAP_Y = 90;
const CLEARANCE = 24;
const SEARCH_STEP = 60;
const FONT_SIZE = 22;

type Rect = { x: number; y: number; w: number; h: number };
type PlacementBounds = { x: number; y: number; width: number; height: number };
type ProposedRect = { rect: Rect; group: string };

// Mirrors estimateShapeBounds() in canvas-context.ts for the styles this compiler creates
// (size "m", scale 1, rotation 0), so the collision check uses the same footprint the renderer will.
function noteBounds(text: string, x: number, y: number): Rect {
  const lines = String(text).split("\n");
  return { x, y, w: 200, h: Math.max(200, lines.length * FONT_SIZE * 1.35 + 40) };
}

function textBounds(text: string, x: number, y: number): Rect {
  const lines = String(text).split("\n");
  return {
    x, y,
    w: Math.max(8, ...lines.map((line) => line.length * FONT_SIZE * 0.62)),
    h: Math.max(FONT_SIZE * 1.32, lines.length * FONT_SIZE * 1.32),
  };
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function withMargin(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, w: rect.w + margin * 2, h: rect.h + margin * 2 };
}

function boundsOf(rects: readonly Rect[]): Rect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  return {
    x: minX,
    y: minY,
    w: Math.max(...rects.map((rect) => rect.x + rect.w)) - minX,
    h: Math.max(...rects.map((rect) => rect.y + rect.h)) - minY,
  };
}

function shift(rect: Rect, x: number, y: number): Rect {
  return { x: rect.x + x, y: rect.y + y, w: rect.w, h: rect.h };
}

function layout(input: TeachingScene) {
  const horizontal = input.direction === "right";
  const sizes = input.nodes.map((node) => node.kind === "note"
    ? { w: 200, h: noteBounds(node.label, 0, 0).h }
    : { w: CELL_WIDTH, h: CELL_HEIGHT });
  const offsets: number[] = [];
  let cursor = 0;
  for (let index = 0; index < input.nodes.length; index++) {
    offsets[index] = cursor;
    cursor += (horizontal ? sizes[index].w : sizes[index].h) + (horizontal ? GAP_X : GAP_Y);
  }
  const positions = new Map<string, { x: number; y: number; rect: Rect }>();
  input.nodes.forEach((node, index) => {
    const x = horizontal ? offsets[index] : 0;
    const y = horizontal ? 0 : offsets[index];
    positions.set(node.id, { x, y, rect: { x, y, w: sizes[index].w, h: sizes[index].h } });
  });

  const proposed: ProposedRect[] = [...positions.entries()].map(([id, position]) => ({ rect: position.rect, group: `node:${id}` }));
  const arrows: Array<{ group: string; start: { x: number; y: number }; end: { x: number; y: number }; label?: string }> = [];
  for (const edge of input.edges) {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const start = horizontal
      ? { x: from.rect.x + from.rect.w, y: from.rect.y + from.rect.h / 2 }
      : { x: from.rect.x + from.rect.w / 2, y: from.rect.y + from.rect.h };
    const end = horizontal
      ? { x: to.rect.x, y: to.rect.y + to.rect.h / 2 }
      : { x: to.rect.x + to.rect.w / 2, y: to.rect.y };
    const group = `arrow:${edge.from}:${edge.to}`;
    proposed.push({
      rect: {
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
        w: Math.max(2, Math.abs(end.x - start.x)), h: Math.max(2, Math.abs(end.y - start.y)),
      },
      group,
    });
    if (edge.label) {
      const label = textBounds(edge.label, 0, 0);
      proposed.push({ rect: { x: (start.x + end.x) / 2 - label.w / 2, y: (start.y + end.y) / 2 - label.h / 2, w: label.w, h: label.h }, group: `arrow-label:${edge.from}:${edge.to}` });
    }
    arrows.push({ group, start, end, ...(edge.label ? { label: edge.label } : {}) });
  }

  const span = Math.max(...[...positions.values()].map((position) => position.rect.y + position.rect.h));
  const captions = input.steps.map((step, index) => {
    const text = `${index + 1}. ${step.title}`;
    proposed.push({ rect: textBounds(text, 0, span + 40 + index * 40), group: `step:${index}` });
    return { text, x: 0, y: span + 40 + index * 40 };
  });

  return { positions, proposed, arrows, captions, bounds: boundsOf(proposed.map((item) => item.rect)) };
}

function findPlacement(
  proposed: readonly ProposedRect[],
  bounds: Rect,
  existing: readonly Rect[],
  placementBounds?: PlacementBounds,
): { x: number; y: number } | null {
  const region: PlacementBounds = placementBounds ?? {
    x: 100 + bounds.x - 4000,
    y: 100 + bounds.y - 4000,
    width: bounds.w + 8000,
    height: bounds.h + 8000,
  };
  const minX = region.x - bounds.x, maxX = region.x + region.width - bounds.w - bounds.x;
  const minY = region.y - bounds.y, maxY = region.y + region.height - bounds.h - bounds.y;
  if (minX > maxX || minY > maxY) return null;
  const stepX = Math.max(SEARCH_STEP, Math.ceil((maxX - minX) / 200));
  const stepY = Math.max(SEARCH_STEP, Math.ceil((maxY - minY) / 200));
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += stepY) for (let x = minX; x <= maxX; x += stepX) candidates.push({ x, y });
  candidates.push({ x: 100, y: 100 });
  candidates.sort((a, b) => (Math.hypot(a.x - 100, a.y - 100) - Math.hypot(b.x - 100, b.y - 100)) || a.y - b.y || a.x - b.x);

  for (const base of candidates) {
    const rects = proposed.map((item) => ({ rect: shift(item.rect, base.x, base.y), group: item.group }));
    if (rects.some(({ rect }) => rect.x < region.x || rect.y < region.y || rect.x + rect.w > region.x + region.width || rect.y + rect.h > region.y + region.height)) continue;
    if (rects.some(({ rect }) => existing.some((obstacle) => intersects(withMargin(rect, CLEARANCE), obstacle)))) continue;
    let clear = true;
    for (let i = 0; i < rects.length && clear; i++) for (let j = i + 1; j < rects.length; j++) {
      if (rects[i].group === rects[j].group) continue;
      if (rects[i].group.startsWith("arrow-label:") || rects[j].group.startsWith("arrow-label:")) continue;
      if (rects[i].group.startsWith("arrow:") && rects[j].group.startsWith("arrow:")) continue;
      if (intersects(rects[i].rect, rects[j].rect)) { clear = false; break; }
    }
    if (clear) return base;
  }
  return null;
}

/** Compiles a semantic teaching scene into the existing, review-gated shape action batch. */
export function compileTeachingScene(
  input: TeachingScene,
  options: {
    existingShapeIds?: ReadonlySet<string>;
    existingBounds?: readonly Rect[];
    placementBounds?: PlacementBounds;
  } = {},
): CanvasActionBatch {
  const { positions, arrows, captions, proposed, bounds } = layout(input);
  const existing = (options.existingBounds ?? []).map((rect) => ({ ...rect }));
  const base = findPlacement(proposed, bounds, existing, options.placementBounds);
  if (!base) {
    throw new Error("No unoccupied region is available for this teaching scene on the active board. Move the view to an empty area, remove or relocate existing objects, then request the diagram again. The canvas was not changed.");
  }

  const placed = proposed.map((item) => ({ rect: shift(item.rect, base.x, base.y), group: item.group }));
  for (const { rect } of placed) {
    if (existing.some((obstacle) => intersects(withMargin(rect, CLEARANCE), obstacle))) throw new Error("Teaching scene placement overlaps existing board content. The canvas was not changed.");
  }

  const actions: CanvasActionBatch["actions"] = [];
  for (const node of input.nodes) {
    const position = positions.get(node.id)!;
    actions.push(node.kind === "note" ? {
      kind: "createShape",
      shape: { type: "note", id: node.id, x: position.x + base.x, y: position.y + base.y, props: { text: node.label, color: "black", size: "m", font: "sans", scale: 1 } },
    } : {
      kind: "createShape",
      shape: { type: "geo", id: node.id, x: position.x + base.x, y: position.y + base.y, props: { geo: "rectangle", w: CELL_WIDTH, h: CELL_HEIGHT, color: "blue", size: "m", dash: "solid", fill: "none", label: node.label } },
    });
  }

  for (const arrow of arrows) {
    actions.push({
      kind: "createArrow",
      from: { x: arrow.start.x + base.x, y: arrow.start.y + base.y },
      to: { x: arrow.end.x + base.x, y: arrow.end.y + base.y },
      color: "black", size: "m", ...(arrow.label ? { label: arrow.label } : {}),
    });
  }

  for (const caption of captions) {
    actions.push({
      kind: "createText",
      x: caption.x + base.x,
      y: caption.y + base.y,
      text: caption.text,
      style: { color: "black", size: "m", font: "sans", scale: 1 },
    });
    // highlightShape validates against the current store, so it cannot target an id created in this batch.
    const stepIndex = Number(caption.text.split(".")[0]) - 1;
    for (const id of input.steps[stepIndex]?.highlight ?? []) {
      if (options.existingShapeIds?.has(id)) actions.push({ kind: "highlightShape", id, color: "yellow" });
    }
  }

  return canvasActionSchema.parse({ boardId: input.boardId, actions });
}

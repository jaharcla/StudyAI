import { z } from "zod";
import { canvasActionSchema, type CanvasActionBatch } from "./canvas-actions";
import { planLayout, type LayoutRect, type LayoutRequest } from "./layout";

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
const CAPTION_WIDTH = 600;
const CAPTION_HEIGHT = 40;
/** Same working frame the tutor's canvas context uses, so placement and description agree. */
const DEFAULT_VIEWPORT = { x: 0, y: 0, width: 4_000, height: 3_000 };

/**
 * Compiles a semantic teaching scene into the existing, review-gated shape action batch.
 *
 * Positions come from `planLayout` against the board's current content, never a fixed grid: an
 * empty board still starts at the same place, but a board with work on it gets placed into clear
 * space. If there is no clear space, this throws rather than stacking on the student's drawing.
 */
export function compileTeachingScene(input: TeachingScene, options: { existingShapeIds?: ReadonlySet<string>; occupancy?: readonly LayoutRect[]; viewport?: LayoutRect } = {}): CanvasActionBatch {
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const occupancy = options.occupancy;
  const requests: LayoutRequest[] = [
    ...input.nodes.map((node) => ({ id: node.id, width: CELL_WIDTH, height: CELL_HEIGHT })),
    ...input.steps.map((_, index) => ({ id: `step-${index}`, width: CAPTION_WIDTH, height: CAPTION_HEIGHT })),
  ];

  const rectangles = new Map<string, LayoutRect>();
  if (occupancy) {
    const plan = planLayout(requests, occupancy, viewport, { order: input.direction === "down" ? "column" : "row" });
    if (plan.status === "conflict") throw new Error(`${plan.reason} Clear space, or ask for a smaller scene. Suggested free area: ${Math.round(plan.suggestion.width)}×${Math.round(plan.suggestion.height)} at (${Math.round(plan.suggestion.x)}, ${Math.round(plan.suggestion.y)}).`);
    for (const placement of plan.placements) rectangles.set(placement.id, placement.rect);
  } else {
    // Legacy caller with no board state: reproduce the original reading-order grid exactly.
    input.nodes.forEach((node, index) => {
      const column = input.direction === "right" ? index : 0;
      const row = input.direction === "right" ? 0 : index;
      rectangles.set(node.id, { x: 100 + column * (CELL_WIDTH + GAP_X), y: 100 + row * (CELL_HEIGHT + GAP_Y), width: CELL_WIDTH, height: CELL_HEIGHT });
    });
    const span = input.direction === "right" ? CELL_HEIGHT : input.nodes.length * (CELL_HEIGHT + GAP_Y);
    input.steps.forEach((_, index) => rectangles.set(`step-${index}`, { x: 100, y: 100 + span + 40 + index * 40, width: CAPTION_WIDTH, height: CAPTION_HEIGHT }));
  }

  const actions: CanvasActionBatch["actions"] = [];
  for (const node of input.nodes) {
    const position = rectangles.get(node.id)!;
    actions.push(node.kind === "note" ? {
      kind: "createShape",
      shape: { type: "note", id: node.id, x: position.x, y: position.y, props: { text: node.label, color: "black", size: "m", font: "sans", scale: 1 } },
    } : {
      kind: "createShape",
      shape: { type: "geo", id: node.id, x: position.x, y: position.y, props: { geo: "rectangle", w: position.width, h: position.height, color: "blue", size: "m", dash: "solid", fill: "none", label: node.label } },
    });
  }

  for (const edge of input.edges) {
    const from = rectangles.get(edge.from)!;
    const to = rectangles.get(edge.to)!;
    const leftToRight = to.x >= from.x;
    const start = leftToRight ? { x: from.x + from.width, y: from.y + from.height / 2 } : { x: from.x + from.width / 2, y: from.y + from.height };
    const end = leftToRight ? { x: to.x, y: to.y + to.height / 2 } : { x: to.x + to.width / 2, y: to.y };
    actions.push({ kind: "createArrow", from: start, to: end, color: "black", size: "m", ...(edge.label ? { label: edge.label } : {}) });
  }

  input.steps.forEach((step, index) => {
    const position = rectangles.get(`step-${index}`)!;
    actions.push({
      kind: "createText",
      x: position.x,
      y: position.y,
      text: `${index + 1}. ${step.title}`,
      style: { color: "black", size: "m", font: "sans", scale: 1 },
    });
    // highlightShape validates against the current store, so it cannot target an id created in this batch.
    for (const id of step.highlight) {
      if (options.existingShapeIds?.has(id)) actions.push({ kind: "highlightShape", id, color: "yellow" });
    }
  });

  return canvasActionSchema.parse({ boardId: input.boardId, actions });
}

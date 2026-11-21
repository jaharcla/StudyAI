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

/** Compiles a semantic teaching scene into the existing, review-gated shape action batch. */
export function compileTeachingScene(input: TeachingScene, options: { existingShapeIds?: ReadonlySet<string> } = {}): CanvasActionBatch {
  const positions = new Map<string, { x: number; y: number }>();
  input.nodes.forEach((node, index) => {
    const column = input.direction === "right" ? index : 0;
    const row = input.direction === "right" ? 0 : index;
    positions.set(node.id, {
      x: 100 + column * (CELL_WIDTH + GAP_X),
      y: 100 + row * (CELL_HEIGHT + GAP_Y),
    });
  });

  const actions: CanvasActionBatch["actions"] = [];
  for (const node of input.nodes) {
    const position = positions.get(node.id)!;
    actions.push(node.kind === "note" ? {
      kind: "createShape",
      shape: { type: "note", id: node.id, x: position.x, y: position.y, props: { text: node.label, color: "black", size: "m", font: "sans", scale: 1 } },
    } : {
      kind: "createShape",
      shape: { type: "geo", id: node.id, x: position.x, y: position.y, props: { geo: "rectangle", w: CELL_WIDTH, h: CELL_HEIGHT, color: "blue", size: "m", dash: "solid", fill: "none", label: node.label } },
    });
  }

  for (const edge of input.edges) {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const start = input.direction === "right"
      ? { x: from.x + CELL_WIDTH, y: from.y + CELL_HEIGHT / 2 }
      : { x: from.x + CELL_WIDTH / 2, y: from.y + CELL_HEIGHT };
    const end = input.direction === "right"
      ? { x: to.x, y: to.y + CELL_HEIGHT / 2 }
      : { x: to.x + CELL_WIDTH / 2, y: to.y };
    actions.push({ kind: "createArrow", from: start, to: end, color: "black", size: "m", ...(edge.label ? { label: edge.label } : {}) });
  }

  const span = input.direction === "right" ? CELL_HEIGHT : input.nodes.length * (CELL_HEIGHT + GAP_Y);
  input.steps.forEach((step, index) => {
    actions.push({
      kind: "createText",
      x: 100,
      y: 100 + span + 40 + index * 40,
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

import { z } from "zod";
import { newId, type ScientificObject } from "../model";
import { canvasActionSchema, type CanvasActionBatch } from "./canvas-actions";
import { planLayout, type LayoutRect, type LayoutRequest } from "./layout";
import { compileExpressionSync } from "../expressions";

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
export function compileTeachingScene(input: TeachingScene, options: { occupancy?: readonly LayoutRect[]; viewport?: LayoutRect } = {}): CanvasActionBatch {
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
    // Batch references are legal: highlight resolves against the ids this same batch creates.
    for (const id of step.highlight) actions.push({ kind: "highlightShape", id, color: "yellow" });
  });

  return canvasActionSchema.parse({ boardId: input.boardId, actions });
}

/**
 * The single semantic authoring verb. There is deliberately no coordinate field: the model states
 * what the artifact must show and where it should sit *relative to* the board, and the planner
 * decides the pixels. `placement.near` may use a transient `#alias` resolved against current board
 * anchors; aliases are intent only and are never copied into the resulting objects.
 */
export const artifactBriefSchema = z.object({
  boardId: z.string().min(1).max(200),
  topic: z.string().min(1).max(280),
  artifact: z.object({
    kind: z.enum(["question", "problem-set", "figure", "worked-example", "deck"]),
    count: z.number().int().min(1).max(8).default(1),
    prompt: z.string().min(1).max(2000),
    answer: z.string().max(2000).optional(),
    citationLabel: z.string().max(200).optional(),
    items: z.array(z.object({
      prompt: z.string().min(1).max(2000),
      answer: z.string().max(2000).optional(),
      citationLabel: z.string().max(200).optional(),
      sourceRef: z.string().min(1).max(400).optional(),
    }).strict()).max(8).optional(),
    concepts: z.array(z.string().min(1).max(80)).max(8).default([]),
    figure: z.object({
      kind: z.enum(["freebody", "vector", "graph", "anatomy", "equation", "mindmap"]),
      title: z.string().min(1).max(120),
      forces: z.array(z.object({
        label: z.string().min(1).max(60),
        components: z.tuple([z.number(), z.number()]),
      })).min(1).max(8).optional(),
      expression: z.string().min(1).max(500).optional(),
      xRange: z.tuple([z.number(), z.number()]).optional(),
      vector: z.object({
        components: z.tuple([z.number(), z.number(), z.number()]),
        units: z.string().min(1).max(40).optional(),
        label: z.string().max(120).optional(),
      }).optional(),
    }).optional(),
  }).strict(),
  placement: z.object({
    near: z.string().max(200).optional(),
    relation: z.enum(["near", "below", "beside", "clear-area"]).default("clear-area"),
  }).strict().default({ relation: "clear-area" }),
  sourceRefs: z.array(z.string().min(1).max(400)).max(8).default([]),
  reason: z.string().min(1).max(1000),
}).strict().superRefine((value, context) => {
  if (new Set(value.sourceRefs).size !== value.sourceRefs.length) context.addIssue({ code: "custom", message: "sourceRefs must be unique." });
  if (value.artifact.kind === "problem-set") {
    if (!value.artifact.items) {
      context.addIssue({ code: "custom", message: "A problem-set requires items with distinct prompts.", path: ["artifact", "items"] });
    } else {
      if (value.artifact.items.length !== value.artifact.count) context.addIssue({ code: "custom", message: "items.length must equal count; it is never clamped.", path: ["artifact", "items"] });
      const prompts = value.artifact.items.map((item) => item.prompt);
      if (new Set(prompts).size !== prompts.length) context.addIssue({ code: "custom", message: "Item prompts must be unique.", path: ["artifact", "items"] });
    }
  }
  for (const item of value.artifact.items ?? []) {
    if (item.sourceRef && !value.sourceRefs.includes(item.sourceRef)) {
      context.addIssue({ code: "custom", message: `Item sourceRef "${item.sourceRef}" was not retrieved.`, path: ["artifact", "items"] });
    }
  }
  const figure = value.artifact.figure;
  if (figure?.kind === "graph") {
    if (!figure.expression) context.addIssue({ code: "custom", message: "A graph figure requires an expression.", path: ["artifact", "figure", "expression"] });
    if (!figure.xRange || figure.xRange[1] <= figure.xRange[0]) context.addIssue({ code: "custom", message: "A graph figure requires an xRange with maximum greater than minimum.", path: ["artifact", "figure", "xRange"] });
  }
  if (figure?.kind === "vector" && !figure.vector) context.addIssue({ code: "custom", message: "A vector figure requires components.", path: ["artifact", "figure", "vector"] });
  if (figure?.kind === "equation" && !figure.expression) context.addIssue({ code: "custom", message: "An equation figure requires an expression.", path: ["artifact", "figure", "expression"] });
});

export type ArtifactBrief = z.infer<typeof artifactBriefSchema>;
export type CompiledArtifact = {
  objects: ScientificObject[];
  description: string;
  sourceRefs: string[];
  verification: "generated-unverified";
};

const QUESTION_WIDTH = 360;
const QUESTION_HEIGHT = 130;
const FIGURE_WIDTH = 340;
const FIGURE_HEIGHT = 260;
const AUTHORING_GAP = 60;

/**
 * Compiles a brief into scientific objects at planner-approved positions. Every authored object is
 * branded generated-unverified; the brand travels with the object, not just with the review dialog.
 */
export function compileArtifactBrief(input: ArtifactBrief, options: {
  occupancy?: readonly LayoutRect[];
  viewport?: LayoutRect;
  anchors?: ReadonlyMap<string, LayoutRect>;
} = {}): CompiledArtifact {
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const occupancy = options.occupancy ?? [];
  const anchors = options.anchors ?? new Map<string, LayoutRect>();
  const provenance = { status: "generated-unverified" as const, sourceRefs: [...input.sourceRefs] };

  let anchor = { x: viewport.x + AUTHORING_GAP, y: viewport.y + AUTHORING_GAP };
  if (input.placement.near) {
    const alias = input.placement.near;
    const resolved = anchors.get(alias);
    if (!resolved) throw new Error(`Unknown alias "${alias}". It must name a node on the current board or #clear-area.`);
    if (alias === "#clear-area") anchor = { x: viewport.x + AUTHORING_GAP, y: viewport.y + AUTHORING_GAP };
    else if (input.placement.relation === "below") anchor = { x: resolved.x, y: resolved.y + resolved.height + AUTHORING_GAP };
    else if (input.placement.relation === "beside") anchor = { x: resolved.x + resolved.width + AUTHORING_GAP, y: resolved.y };
    else anchor = { x: resolved.x, y: resolved.y };
  }

  const requests: LayoutRequest[] = [];
  if (input.artifact.figure) requests.push({ id: "figure", width: FIGURE_WIDTH, height: FIGURE_HEIGHT });
  const contentCount = input.artifact.kind === "figure" ? 0 : input.artifact.count;
  for (let index = 0; index < contentCount; index++) requests.push({ id: `question-${index}`, width: QUESTION_WIDTH, height: QUESTION_HEIGHT });

  const plan = planLayout(requests, occupancy, viewport, { anchor });
  if (plan.status === "conflict") {
    throw new Error(`${plan.reason} Nothing was placed. Clear space, or ask for a smaller artifact. Suggested free area: ${Math.round(plan.suggestion.width)}×${Math.round(plan.suggestion.height)} at (${Math.round(plan.suggestion.x)}, ${Math.round(plan.suggestion.y)}).`);
  }
  const rectangles = new Map(plan.placements.map((placement) => [placement.id, placement.rect]));

  type CompileContext = {
    input: ArtifactBrief;
    rectangles: Map<string, LayoutRect>;
    provenance: { status: "generated-unverified"; sourceRefs: string[] };
  };
  const indices = (count: number) => Array.from({ length: count }, (_, index) => index);
  const tagged = (ctx: CompileContext) => ({ ...ctx.provenance, sourceRefs: [...ctx.provenance.sourceRefs] });
  const itemAt = (ctx: CompileContext, index: number) => ctx.input.artifact.items?.[index] ?? { prompt: ctx.input.artifact.prompt, ...(ctx.input.artifact.answer ? { answer: ctx.input.artifact.answer } : {}) };
  const provenanceAt = (ctx: CompileContext, index: number) => {
    const sourceRef = ctx.input.artifact.items?.[index]?.sourceRef;
    return sourceRef ? { ...tagged(ctx), sourceRefs: [sourceRef] } : tagged(ctx);
  };
  const questionAt = (ctx: CompileContext, index: number, forcedAnswer?: string): ScientificObject => {
    const rect = ctx.rectangles.get(`question-${index}`)!;
    const item = itemAt(ctx, index);
    const answer = forcedAnswer ?? item.answer;
    return {
      id: newId("question"), kind: "question", x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      prompt: item.prompt,
      ...(answer ? { answer } : {}),
      provenance: provenanceAt(ctx, index),
    };
  };

  /** The advertised kind decides what is compiled. No kind silently falls through to another. */
  const compileByKind: Record<ArtifactBrief["artifact"]["kind"], (ctx: CompileContext) => ScientificObject[]> = {
    question: (ctx) => indices(ctx.input.artifact.count).map((index) => questionAt(ctx, index)),
    "problem-set": (ctx) => indices(ctx.input.artifact.count).map((index) => questionAt(ctx, index)),
    "worked-example": (ctx) => [questionAt(ctx, 0, ctx.input.artifact.answer ?? ctx.input.artifact.prompt)],
    deck: (ctx) => indices(ctx.input.artifact.count).map((index) => {
      const rect = ctx.rectangles.get(`question-${index}`)!;
      const item = itemAt(ctx, index);
      return {
        id: newId("flashcard"), kind: "flashcard", x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        front: item.prompt, back: item.answer ?? "",
        provenance: provenanceAt(ctx, index),
      };
    }),
    figure: () => [],
  };

  const ctx: CompileContext = { input, rectangles, provenance };
  const objects: ScientificObject[] = [...compileByKind[input.artifact.kind](ctx)];

  const figure = input.artifact.figure;
  const figureRect = rectangles.get("figure");
  if (figure && figureRect) {
    if (figure.kind === "freebody" && figure.forces) {
      const centreX = figureRect.x + figureRect.width / 2;
      const centreY = figureRect.y + figureRect.height / 2;
      const radius = Math.min(figureRect.width, figureRect.height) / 3;
      figure.forces.forEach((force, index) => {
        const angle = (index / figure.forces!.length) * Math.PI * 2;
        objects.push({
          id: newId("force"), kind: "force",
          x: centreX + Math.cos(angle) * radius, y: centreY + Math.sin(angle) * radius,
          width: 24, height: 24, components: [force.components[0], force.components[1], 0],
          units: "N", label: force.label,
          provenance: tagged(ctx),
        });
      });
    } else if (figure.kind === "mindmap") {
      const centreX = figureRect.x + figureRect.width / 2;
      const centreY = figureRect.y + figureRect.height / 2;
      objects.push({
        id: newId("mindmap"), kind: "mindmap", x: figureRect.x, y: figureRect.y,
        width: figureRect.width, height: figureRect.height, title: figure.title,
        nodes: [
          { id: "root", label: figure.title, x: centreX, y: centreY },
          ...input.artifact.concepts.slice(0, 6).map((concept, index) => ({ id: `c${index}`, label: concept, x: centreX + (index % 2 ? 100 : -100), y: centreY + (index - 1) * 44 })),
        ],
        edges: [],
        provenance: tagged(ctx),
      });
    } else if (figure.kind === "graph") {
      const expression = figure.expression;
      const range = figure.xRange;
      if (!expression || !range || range[1] <= range[0]) throw new Error("A graph figure requires an expression and an xRange with maximum greater than minimum.");
      const evaluator = compileExpressionSync(expression);
      if (evaluator.variables.some((name) => name !== "x")) throw new Error("A graph expression may only use x.");
      const points: Array<[number, number]> = [];
      try {
        for (let index = 0; index <= 120; index++) {
          const x = range[0] + (range[1] - range[0]) * index / 120;
          points.push([x, evaluator.evaluate({ x })]);
        }
      } catch (error) {
        throw new Error(`Graph expression produced a non-finite sample: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      objects.push({
        id: newId("graph"), kind: "graph", x: figureRect.x, y: figureRect.y,
        width: figureRect.width, height: figureRect.height, expression,
        xRange: [range[0], range[1]], points, xLabel: "x", yLabel: "y",
        provenance: tagged(ctx),
      });
    } else if (figure.kind === "vector") {
      const spec = figure.vector;
      if (!spec) throw new Error("A vector figure requires components.");
      const [cx, cy, cz] = spec.components;
      if (![cx, cy, cz].every(Number.isFinite) || Math.hypot(cx, cy, cz) === 0) throw new Error("A vector figure requires finite components with non-zero magnitude.");
      objects.push({
        id: newId("vector"), kind: "vector", x: figureRect.x, y: figureRect.y,
        width: figureRect.width, height: figureRect.height, components: [cx, cy, cz],
        units: spec.units ?? "N", label: spec.label ?? figure.title,
        provenance: tagged(ctx),
      });
    } else if (figure.kind === "anatomy") {
      objects.push({
        id: newId("anatomy"), kind: "anatomy", x: figureRect.x, y: figureRect.y,
        width: figureRect.width, height: figureRect.height, structureId: figure.title, system: "",
        labels: input.artifact.concepts.slice(0, 8),
        provenance: tagged(ctx),
      });
    } else if (figure.kind === "equation") {
      const expression = figure.expression;
      if (!expression) throw new Error("An equation figure requires an expression.");
      compileExpressionSync(expression);
      objects.push({
        id: newId("equation"), kind: "equation", x: figureRect.x, y: figureRect.y,
        width: figureRect.width, height: figureRect.height, expression, variables: {},
        provenance: tagged(ctx),
      });
    } else {
      throw new Error(`Unsupported figure kind: ${figure.kind}`);
    }
  }

  const forceLabels = figure?.forces?.map((force) => force.label) ?? [];
  const citation = input.artifact.citationLabel ?? input.sourceRefs.join(", ") ?? "no cited source";
  const where = input.placement.relation === "clear-area" ? "the clear area" : `${input.placement.relation} your sketch`;
  const figureText = figure ? ` and 1 ${figure.kind} diagram${forceLabels.length ? ` (${forceLabels.join(", ")})` : ""}` : "";
  const countText: Record<ArtifactBrief["artifact"]["kind"], string> = {
    question: `${input.artifact.count} question${input.artifact.count === 1 ? "" : "s"}`,
    "problem-set": `${input.artifact.count} question${input.artifact.count === 1 ? "" : "s"}`,
    "worked-example": "1 worked example",
    deck: `${input.artifact.count} flashcard${input.artifact.count === 1 ? "" : "s"}`,
    figure: "",
  };
  const description = `adds ${[countText[input.artifact.kind], figureText].filter(Boolean).join(" and ")} in ${where}, citing ${citation} — generated, not verified`;

  return { objects, description, sourceRefs: [...input.sourceRefs], verification: "generated-unverified" };
}

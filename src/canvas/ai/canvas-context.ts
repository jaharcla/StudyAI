import { localBounds, pageBounds, type Bounds, type ShapeRecord, type Snapshot, type Store } from "@quickdrawjs/core";
import type { ScientificObject } from "../model";

export type CanvasScope = { boardId: string; courseId: string; lessonId: string; revision?: number };
export type CanvasContextOptions = {
  source: Store | Snapshot;
  selectedIds: readonly string[];
  viewport: Bounds;
  objects: readonly ScientificObject[];
  scope: CanvasScope;
  nearbyDistance?: number;
  maxItems?: number;
  maxChars?: number;
};
export type CanvasShapeContext = {
  id: string;
  type: ShapeRecord["type"];
  position: { x: number; y: number; rotation: number; z: number };
  bounds: Bounds;
  boundsEstimate?: "text-layout-approximation";
  text?: string;
  arrow?: { from: { x: number; y: number }; to: { x: number; y: number }; bend: number };
  strokeSummary?: { pointCount: number; bounds: Bounds; simplified: Array<{ x: number; y: number }> };
};
export type CanvasAIContext = {
  scope: CanvasScope;
  viewport: Bounds;
  selected: CanvasShapeContext[];
  visible: CanvasShapeContext[];
  nearbyObjects: Array<{ id: string; kind: ScientificObject["kind"]; bounds: Bounds; detail: Record<string, unknown> }>;
  spatialRelationships: Array<{ fromId: string; relation: string; toId: string }>;
  truncated: boolean;
};

const intersects = (a: Bounds, b: Bounds) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
const center = (b: Bounds) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const gap = (a: Bounds, b: Bounds) => {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
};
const round = (n: number) => Math.round(n * 10) / 10;
const validBounds = (b: Bounds) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w >= 0 && b.h >= 0;

function shapeBounds(shape: ShapeRecord): Bounds {
  if (shape.type !== "text" && shape.type !== "note") return pageBounds(shape);
  const text = String(shape.props.text ?? "");
  const scale = Number(shape.props.scale || 1);
  const fontSize = ({ s: 16, m: 22, l: 32, xl: 48 } as Record<string, number>)[String(shape.props.size)] ?? 22;
  const lines = text.split("\n");
  const width = shape.type === "note" ? 200 * scale : Math.max(8, ...lines.map((line) => line.length * fontSize * 0.62)) * scale;
  const height = shape.type === "note" ? Math.max(200, lines.length * fontSize * 1.35 + 40) * scale : Math.max(fontSize * 1.32, lines.length * fontSize * 1.32) * scale;
  const radians = shape.rot || 0, w = width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians));
  const h = width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians));
  return { x: shape.x + width / 2 - w / 2, y: shape.y + height / 2 - h / 2, w, h };
}

function shapes(source: Store | Snapshot): ShapeRecord[] {
  const records = "all" in source ? source.shapes() : Object.values(source.document.store);
  return records.filter((record): record is ShapeRecord => record.typeName === "shape");
}

function summarize(shape: ShapeRecord): CanvasShapeContext {
  const bounds = shapeBounds(shape);
  const result: CanvasShapeContext = {
    id: shape.id,
    type: shape.type,
    position: { x: round(shape.x), y: round(shape.y), rotation: round(shape.rot), z: shape.z },
    bounds: { x: round(bounds.x), y: round(bounds.y), w: round(bounds.w), h: round(bounds.h) },
  };
  if (shape.type === "text" || shape.type === "note") result.boundsEstimate = "text-layout-approximation";
  if (shape.type === "text" || shape.type === "note") result.text = String(shape.props.text ?? "").slice(0, 500);
  if (shape.type === "arrow" || shape.type === "line") {
    const dx = Number(shape.props.dx || 0), dy = Number(shape.props.dy || 0);
    const cos = Math.cos(shape.rot), sin = Math.sin(shape.rot);
    const local = localBounds(shape), cx = shape.x + local.x + local.w / 2, cy = shape.y + local.y + local.h / 2;
    const rotate = (x: number, y: number) => ({ x: round(cx + (x - cx) * cos - (y - cy) * sin), y: round(cy + (x - cx) * sin + (y - cy) * cos) });
    result.arrow = {
      from: rotate(shape.x, shape.y),
      to: rotate(shape.x + dx, shape.y + dy),
      bend: round(Number(shape.props.bend || 0)),
    };
  }
  if (shape.type === "draw" || shape.type === "highlight") {
    const pts = Array.isArray(shape.props.pts) ? shape.props.pts as number[] : [];
    const pointCount = Math.floor(pts.length / 3);
    const samples = Math.min(6, pointCount);
    const simplified = Array.from({ length: samples }, (_, i) => {
      const index = Math.floor(i * Math.max(0, pointCount - 1) / Math.max(1, samples - 1)) * 3;
      return { x: round(shape.x + Number(pts[index] || 0)), y: round(shape.y + Number(pts[index + 1] || 0)) };
    });
    result.strokeSummary = { pointCount, bounds: result.bounds, simplified };
  }
  return result;
}

function relationship(a: Bounds, b: Bounds): string {
  if (intersects(a, b)) return "overlaps";
  const ca = center(a), cb = center(b);
  if (gap(a, b) < 1) return "touches";
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "left of" : "right of";
  return dy > 0 ? "above" : "below";
}

function scientificSummary(object: ScientificObject) {
  const strings = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 300) : value]));
  let detail: Record<string, unknown>;
  if (object.kind === "molecule") detail = { name: object.name.slice(0, 300), atomCount: object.atoms.length, activeResonanceId: object.activeResonanceId };
  else if (object.kind === "graph") detail = { ...strings({ expression: object.expression, xLabel: object.xLabel, yLabel: object.yLabel }), xRange: object.xRange, pointCount: object.points.length };
  else if (object.kind === "anatomy") detail = { structureId: object.structureId, system: object.system.slice(0, 300), labels: object.labels.slice(0, 12).map((value) => value.slice(0, 120)) };
  else if (object.kind === "equation") detail = { expression: object.expression.slice(0, 300), variables: Object.fromEntries(Object.entries(object.variables).slice(0, 20)), units: object.units?.slice(0, 100) };
  else if (object.kind === "vector" || object.kind === "force") detail = { components: object.components, units: object.units.slice(0, 100), label: object.label.slice(0, 300) };
  else if (object.kind === "measurement") detail = { value: object.value, units: object.units.slice(0, 100), label: object.label.slice(0, 300) };
  else if (object.kind === "atom") detail = { element: object.element, label: object.label.slice(0, 300), bondOrderSum: object.bondOrderSum };
  else if (object.kind === "bond") detail = { from: object.from, to: object.to, order: object.order, label: object.label.slice(0, 300) };
  else if (object.kind === "concept") detail = strings({ title: object.title, definition: object.definition });
  else if (object.kind === "relationship") detail = strings({ fromId: object.fromId, toId: object.toId, label: object.label });
  else if (object.kind === "linked-note" || object.kind === "linked-document") detail = strings({ title: object.title, excerpt: object.excerpt });
  else if (object.kind === "question") detail = strings({ prompt: object.prompt, answer: object.answer });
  else detail = strings({ front: object.front, back: object.back });
  return { id: object.id, kind: object.kind, bounds: { x: object.x, y: object.y, w: object.width, h: object.height }, detail };
}

export function buildCanvasAIContext(options: CanvasContextOptions): CanvasAIContext {
  const viewport = options.viewport;
  if (!validBounds(viewport)) throw new Error("Invalid viewport bounds.");
  if (![options.scope.boardId, options.scope.courseId, options.scope.lessonId].every((value) => typeof value === "string")) throw new Error("Invalid canvas scope.");
  const distance = options.nearbyDistance ?? 320;
  const itemLimit = options.maxItems ?? 24;
  const charLimit = options.maxChars ?? 12000;
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(itemLimit) || itemLimit < 0 || !Number.isFinite(charLimit) || charLimit < 300) throw new Error("Invalid canvas context limits.");
  const all = shapes(options.source).filter((shape) => typeof shape.id === "string" && [shape.x, shape.y, shape.rot, shape.z].every(Number.isFinite) && shape.props && typeof shape.props === "object");
  const byId = new Map(all.map((shape) => [shape.id, shape]));
  const maxItems = Math.floor(Math.max(0, Math.min(100, itemLimit)));
  const selectedCandidates = [...new Set(options.selectedIds)].map((id) => byId.get(id)).filter((shape): shape is ShapeRecord => Boolean(shape));
  const selected = selectedCandidates.slice(0, maxItems).map(summarize);
  const selectedSet = new Set(selected.map((shape) => shape.id));
  const visible = all.filter((shape) => !selectedSet.has(shape.id) && intersects(shapeBounds(shape), viewport))
    .slice(0, maxItems).map(summarize);
  const focus = [...selected, ...visible];
  const nearbyDistance = distance;
  const nearbyObjects = options.objects.filter((object) => [object.x, object.y, object.width, object.height].every(Number.isFinite) && object.width > 0 && object.height > 0 && focus.some((shape) => gap(shape.bounds, { x: object.x, y: object.y, w: object.width, h: object.height }) <= nearbyDistance))
    .slice(0, maxItems).map(scientificSummary);
  const spatialRelationships = focus.flatMap((shape) => focus.filter((other) => other.id !== shape.id && gap(shape.bounds, other.bounds) <= nearbyDistance)
    .slice(0, 4).map((other) => ({ fromId: shape.id, relation: relationship(shape.bounds, other.bounds), toId: other.id }))).slice(0, maxItems * 4);
  const context: CanvasAIContext = { scope: { boardId: options.scope.boardId.slice(0, 160), courseId: options.scope.courseId.slice(0, 160), lessonId: options.scope.lessonId.slice(0, 160), revision: options.scope.revision }, viewport, selected, visible, nearbyObjects, spatialRelationships, truncated: selectedCandidates.length > selected.length };
  const maxChars = Math.floor(charLimit);
  while (JSON.stringify(context).length > maxChars && (context.nearbyObjects.length || context.spatialRelationships.length || context.visible.length)) {
    context.truncated = true;
    if (context.nearbyObjects.length) context.nearbyObjects.pop();
    else if (context.spatialRelationships.length) context.spatialRelationships.pop();
    else context.visible.pop();
  }
  if (JSON.stringify(context).length > maxChars) {
    context.truncated = true;
    for (const shape of context.selected) if (shape.text) shape.text = shape.text.slice(0, 80);
  }
  while (JSON.stringify(context).length > maxChars && context.selected.length) { context.truncated = true; context.selected.pop(); }
  return context;
}

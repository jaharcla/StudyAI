import { newId, pageBounds, type Editor, type ShapeRecord, type Snapshot, type Store } from "@quickdrawjs/core";
import { z } from "zod";
import { assertCanvasRevision, requireCanvasRevision } from "../proposal-revision";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const dimension = z.number().finite().min(1).max(100_000);
const idSchema = z.string().min(1).max(200);
const propsSchema = z.record(z.string(), z.unknown());
const createSchema = z.object({
  type: z.enum(["geo", "arrow", "line", "text", "note"]),
  id: idSchema.optional(),
  x: coordinate,
  y: coordinate,
  rot: z.number().finite().min(-6.284).max(6.284).optional(),
  props: propsSchema,
}).strict();
const patchSchema = z.object({ x: coordinate.optional(), y: coordinate.optional(), rot: z.number().finite().min(-6.284).max(6.284).optional(), props: propsSchema.optional() }).strict().refine((v) => Object.keys(v).length > 0 && (!v.props || Object.keys(v.props).length > 0));
const colorSchema = z.enum(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red"]);
const textStyle = z.object({ color: colorSchema.default("black"), size: z.enum(["s", "m", "l", "xl"]).default("m"), font: z.enum(["draw", "sans", "serif", "mono"]).default("sans"), scale: z.number().finite().min(0.2).max(10).default(1) }).strict().default({ color: "black", size: "m", font: "sans", scale: 1 });
const shapeActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("createShape"), shape: createSchema }).strict(),
  z.object({ kind: z.literal("createText"), id: idSchema.optional(), x: coordinate, y: coordinate, text: z.string().min(1).max(5000), style: textStyle }).strict(),
  z.object({ kind: z.literal("createArrow"), id: idSchema.optional(), from: z.object({ x: coordinate, y: coordinate }).strict(), to: z.object({ x: coordinate, y: coordinate }).strict(), color: colorSchema.default("black"), size: z.enum(["s", "m", "l", "xl"]).default("m"), label: z.string().max(500).optional() }).strict(),
  z.object({ kind: z.literal("updateShape"), id: idSchema, patch: patchSchema }).strict(),
  z.object({ kind: z.literal("moveShape"), id: idSchema, x: coordinate, y: coordinate }).strict(),
  z.object({ kind: z.literal("deleteShape"), id: idSchema }).strict(),
  z.object({ kind: z.literal("highlightShape"), id: idSchema, color: colorSchema.default("yellow") }).strict(),
  z.object({ kind: z.literal("selectShapes"), ids: z.array(idSchema).max(50) }).strict(),
]);
export const canvasActionSchema = z.object({ boardId: idSchema, actions: z.array(shapeActionSchema).min(1).max(30) }).strict();
export const canvasReadSchema = z.object({ boardId: idSchema }).strict();

export type CanvasAction = z.infer<typeof shapeActionSchema>;
export type CanvasActionBatch = z.infer<typeof canvasActionSchema>;
export type CanvasProposal = { id: string; boardId: string; baseRevision: number; expectedFingerprint: string; actions: CanvasAction[]; description: string; requiresConfirmation: boolean };
export const MAX_CANVAS_STATE_CHARS = 12_000;

const colors = ["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red"];
const sizes = ["s", "m", "l", "xl"];
const dashes = ["draw", "solid", "dashed", "dotted"];
const fills = ["none", "semi", "solid", "pattern"];
const fonts = ["draw", "sans", "serif", "mono"];
const geometries = ["rectangle", "ellipse", "triangle", "diamond", "hexagon", "star"];
const allowed: Record<ShapeRecord["type"], Set<string>> = {
  draw: new Set(), highlight: new Set(["pts", "color", "size"]), geo: new Set(["geo", "w", "h", "color", "size", "dash", "fill", "label", "labelSize", "font"]),
  arrow: new Set(["dx", "dy", "bend", "color", "size", "dash", "connection"]), line: new Set(["dx", "dy", "color", "size", "dash"]),
  text: new Set(["text", "color", "size", "font", "autosize", "w", "scale"]), note: new Set(["text", "color", "size", "font", "scale"]), image: new Set(),
};
const styles = { color: z.enum(colors as [string, ...string[]]), size: z.enum(sizes as [string, ...string[]]), dash: z.enum(dashes as [string, ...string[]]), fill: z.enum(fills as [string, ...string[]]), font: z.enum(fonts as [string, ...string[]]) };

function storeOf(source: Store | Snapshot): Store | null { return "get" in source ? source : null; }
function snapshotOf(source: Store | Snapshot): Snapshot { return storeOf(source)?.getSnapshot() ?? source as Snapshot; }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function canvasFingerprint(source: Store | Snapshot): string { return stable(snapshotOf(source)); }

function records(source: Store | Snapshot): ShapeRecord[] {
  const items = storeOf(source)?.all() ?? Object.values(snapshotOf(source).document.store);
  return items.filter((item): item is ShapeRecord => item.typeName === "shape");
}

function validateProps(type: ShapeRecord["type"], props: Record<string, unknown>, partial: boolean) {
  const keys = Object.keys(props);
  if (keys.some((key) => !allowed[type].has(key))) throw new Error(`Unsupported ${type} property.`);
  const check = (key: string, schema: z.ZodType) => { if (key in props) schema.parse(props[key]); else if (!partial) throw new Error(`Missing ${type} property: ${key}.`); };
  for (const key of ["color", "size", "dash", "fill", "font"]) if (key in props || (!partial && ["color", "size"].includes(key))) check(key, styles[key as keyof typeof styles]);
  if (type === "geo") {
    check("geo", z.enum(geometries as [string, ...string[]])); check("w", dimension); check("h", dimension);
    if ("label" in props) check("label", z.string().max(500)); if ("labelSize" in props) check("labelSize", styles.size);
  }
  if (type === "arrow" || type === "line") {
    check("dx", coordinate); check("dy", coordinate);
    if (!partial && Math.hypot(Number(props.dx), Number(props.dy)) < 0.1) throw new Error("Line geometry must have non-zero length.");
    if (type === "arrow" && ("bend" in props || !partial)) check("bend", z.number().finite().min(-100_000).max(100_000));
    if ("connection" in props) check("connection", z.object({ fromId: idSchema, toId: idSchema }).strict());
  }
  if (type === "text" || type === "note") {
    check("text", z.string().max(5000));
    if (type === "text") { if ("autosize" in props || !partial) check("autosize", z.boolean()); if ("w" in props) check("w", dimension); if ("scale" in props || !partial) check("scale", z.number().finite().min(0.2).max(10)); }
    if (type === "note" && ("scale" in props || !partial)) check("scale", z.number().finite().min(0.2).max(10));
  }
}

function parseAction(value: unknown): CanvasAction { return shapeActionSchema.parse(value); }
function getShape(source: Store | Snapshot, id: string): ShapeRecord {
  const shape = storeOf(source)?.get(id) ?? snapshotOf(source).document.store[id];
  if (!shape || shape.typeName !== "shape") throw new Error(`Unknown shape ID: ${id}.`);
  if (!(shape.type in allowed) || !allowed[shape.type].size) throw new Error(`Unsupported shape type: ${shape.type}.`);
  return shape as ShapeRecord;
}

export function validateCanvasAction(source: Store | Snapshot, value: unknown): CanvasAction {
  const action = parseAction(value);
  if (action.kind === "createShape") validateProps(action.shape.type, action.shape.props, false);
  if (action.kind === "createArrow" && Math.hypot(action.to.x - action.from.x, action.to.y - action.from.y) < 0.1) throw new Error("Arrow geometry must have non-zero length.");
  if (action.kind === "updateShape") {
    const target = getShape(source, action.id);
    if (action.patch.props) validateProps(target.type, action.patch.props, true);
    if ((target.type === "arrow" || target.type === "line") && (action.patch.props?.dx !== undefined || action.patch.props?.dy !== undefined)) {
      const dx = Number(action.patch.props.dx ?? target.props.dx), dy = Number(action.patch.props.dy ?? target.props.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.1) throw new Error("Line geometry must have non-zero length.");
    }
    if (Object.keys(action.patch).length === 0) throw new Error("An update needs at least one supported property.");
  }
  if (action.kind === "moveShape" || action.kind === "deleteShape" || action.kind === "highlightShape") getShape(source, action.id);
  if (action.kind === "selectShapes") for (const id of action.ids) getShape(source, id);
  return action;
}

export function proposeCanvasAction(source: Store | Snapshot, boardId: string, value: unknown, baseRevision?: number): CanvasProposal {
  requireCanvasRevision(baseRevision);
  const batch = canvasActionSchema.parse(value);
  if (!boardId || batch.boardId !== boardId) throw new Error("The active board changed. Read its current context again.");
  const actions = batch.actions.map((action) => validateCanvasAction(source, action));
  const existing = new Set(storeOf(source)?.ids() ?? Object.keys(snapshotOf(source).document.store));
  const deleted = new Set<string>();
  for (const action of actions) {
    const id = action.kind === "createShape" ? action.shape.id : action.kind === "createText" || action.kind === "createArrow" ? action.id : undefined;
    if (id) {
      if (existing.has(id)) throw new Error(`Shape ID already exists: ${id}.`);
      existing.add(id);
    }
    const targetIds = action.kind === "updateShape" || action.kind === "moveShape" || action.kind === "deleteShape" || action.kind === "highlightShape" ? [action.id] : action.kind === "selectShapes" ? action.ids : [];
    if (targetIds.some((targetId) => deleted.has(targetId))) throw new Error("An action targets a shape deleted earlier in this batch.");
    if (action.kind === "deleteShape") deleted.add(action.id);
  }
  const destructive = actions.filter((action) => action.kind === "deleteShape").length;
  return { id: newId("canvas-proposal"), boardId, baseRevision, expectedFingerprint: canvasFingerprint(source), actions, description: actions.map(describe).join("; "), requiresConfirmation: destructive > 0 || actions.length > 5 };
}

function describe(action: CanvasAction): string {
  if (action.kind === "createShape") return `Create ${action.shape.type} shape`;
  if (action.kind === "createText") return `Create text “${action.text.slice(0, 40)}”`;
  if (action.kind === "createArrow") return "Create arrow";
  if (action.kind === "updateShape") return `Update shape ${action.id}`;
  if (action.kind === "moveShape") return `Move shape ${action.id}`;
  if (action.kind === "deleteShape") return `Delete shape ${action.id}`;
  if (action.kind === "highlightShape") return `Highlight shape ${action.id}`;
  return `Select ${action.ids.length} shape(s)`;
}

function makeShape(source: Store, data: Extract<CanvasAction, { kind: "createShape" }>["shape"]): ShapeRecord {
  const props = structuredClone(data.props);
  if (data.type === "geo") Object.assign(props, { dash: props.dash ?? "solid", fill: props.fill ?? "none" });
  if (data.type === "arrow") Object.assign(props, { bend: props.bend ?? 0, dash: props.dash ?? "solid" });
  if (data.type === "line") Object.assign(props, { dash: props.dash ?? "solid" });
  if (data.type === "text") Object.assign(props, { font: props.font ?? "draw", autosize: props.autosize ?? true, scale: props.scale ?? 1 });
  if (data.type === "note") Object.assign(props, { font: props.font ?? "draw", scale: props.scale ?? 1 });
  return { id: data.id ?? newId("shape"), typeName: "shape", type: data.type, x: data.x, y: data.y, rot: data.rot ?? 0, z: source.maxZ() + 1, props };
}

function shapeCenter(shape: ShapeRecord): { x: number; y: number } {
  if (shape.type !== "text" && shape.type !== "note") {
    const bounds = pageBounds(shape);
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  }
  const text = String(shape.props.text ?? ""), scale = Number(shape.props.scale || 1);
  const fontSize = ({ s: 16, m: 22, l: 32, xl: 48 } as Record<string, number>)[String(shape.props.size)] ?? 22;
  const lines = text.split("\n");
  const width = shape.type === "note" ? 200 * scale : Math.max(8, ...lines.map((line) => line.length * fontSize * 0.62)) * scale;
  const height = shape.type === "note" ? Math.max(200, lines.length * fontSize * 1.35 + 40) * scale : Math.max(fontSize * 1.32, lines.length * fontSize * 1.32) * scale;
  return { x: shape.x + width / 2, y: shape.y + height / 2 };
}

export function approveCanvasProposal(source: Store, activeBoardId: string, proposal: CanvasProposal, editor?: Editor, currentRevision?: number): { changedId: string } {
  if (!activeBoardId || proposal.boardId !== activeBoardId) throw new Error("Proposal belongs to a different board.");
  assertCanvasRevision(proposal.baseRevision, currentRevision);
  if (proposal.expectedFingerprint !== canvasFingerprint(source)) throw new Error("Canvas changed after this proposal; request a fresh proposal.");
  const actions = proposal.actions.map((action) => validateCanvasAction(source, action));
  if (actions.length > 5 && !proposal.requiresConfirmation) throw new Error("Large changes require explicit confirmation.");
  if (actions.filter((action) => action.kind === "deleteShape").length && !proposal.requiresConfirmation) throw new Error("Destructive changes require explicit confirmation.");
  let changedId = "";
  source.transact(() => {
    for (const action of actions) {
      if (action.kind === "createShape") { const shape = makeShape(source, action.shape); changedId ||= shape.id; source.put(shape); }
      else if (action.kind === "createText") { const shape = makeShape(source, { id: action.id, type: "text", x: action.x, y: action.y, props: { text: action.text, ...action.style, autosize: true } }); changedId ||= shape.id; source.put(shape); }
      else if (action.kind === "createArrow") {
        const dx = action.to.x - action.from.x, dy = action.to.y - action.from.y;
        const arrow: ShapeRecord = { id: action.id ?? newId("shape"), typeName: "shape", type: "arrow", x: action.from.x, y: action.from.y, rot: 0, z: source.maxZ() + 1, props: { dx, dy, bend: 0, color: action.color, size: action.size, dash: "solid" } };
        changedId ||= arrow.id; source.put(arrow);
        if (action.label) { const label = makeShape(source, { type: "text", x: (action.from.x + action.to.x) / 2, y: (action.from.y + action.to.y) / 2, props: { text: action.label, color: action.color, size: action.size, font: "sans", autosize: true, scale: 1 } }); source.put(label); }
      }
      else if (action.kind === "updateShape") { changedId ||= action.id; source.update(action.id, action.patch); }
      else if (action.kind === "moveShape") { changedId ||= action.id; source.update(action.id, { x: action.x, y: action.y }); }
      else if (action.kind === "deleteShape") { changedId ||= action.id; source.remove([action.id]); }
      else if (action.kind === "highlightShape") {
        const target = getShape(source, action.id), bounds = pageBounds(target);
        const pts = [bounds.x, bounds.y + bounds.h / 2, 0.5, bounds.x + bounds.w, bounds.y + bounds.h / 2, 0.5];
        const mark: ShapeRecord = { id: newId("shape"), typeName: "shape", type: "highlight", x: 0, y: 0, rot: 0, z: source.maxZ() + 1, props: { pts, color: action.color, size: "l" } };
        changedId ||= mark.id; source.put(mark);
      }
      else if (action.kind === "selectShapes") editor?.setSelection(action.ids);
    }
  });
  return { changedId };
}

export function readCanvasState(source: Store | Snapshot, boardId: string, requestedBoardId: string, selectedIds: readonly string[] = []) {
  if (!boardId || boardId !== requestedBoardId) throw new Error("The active board changed. Read its current context again.");
  const all = records(source);
  const selected = new Set(selectedIds);
  const ordered = all.map((shape, index) => ({ shape, index })).sort((a, b) => Number(selected.has(b.shape.id)) - Number(selected.has(a.shape.id)) || a.index - b.index);
  const shapes: Array<Record<string, unknown>> = [];
  let propertyTruncated = false;
  for (const { shape } of ordered) {
    const truncatedProperties: string[] = [];
    const props = compactToolValue(shape.props, "props", truncatedProperties, 0) as Record<string, unknown>;
    const candidate = toolShape(shape, props, truncatedProperties);
    if (fitsCanvasState(boardId, all.length, [...shapes, candidate], selected)) {
      shapes.push(candidate);
      propertyTruncated ||= truncatedProperties.length > 0;
      continue;
    }
    const essential = essentialProps(shape.type, props);
    const omittedProperties = Object.keys(shape.props).filter((key) => !(key in essential));
    const fallback = toolShape(shape, essential, [...truncatedProperties, ...omittedProperties.map((key) => `props.${key} omitted to fit result`)]);
    if (fitsCanvasState(boardId, all.length, [...shapes, fallback], selected)) {
      shapes.push(fallback);
      propertyTruncated = true;
    }
  }
  const omittedShapeCount = all.length - shapes.length;
  const omittedSelectedShapeCount = ordered.filter(({ shape }) => selected.has(shape.id)).length - shapes.filter((shape) => selected.has(String(shape.id))).length;
  const truncated = omittedShapeCount > 0 || propertyTruncated;
  const result = { boardId, objectCount: all.length, includedShapeCount: shapes.length, omittedShapeCount, selectedShapeCount: selected.size, omittedSelectedShapeCount, truncated, shapes };
  if (JSON.stringify(result).length <= MAX_CANVAS_STATE_CHARS) return result;
  return { boardId, objectCount: all.length, includedShapeCount: 0, omittedShapeCount: all.length, selectedShapeCount: selected.size, omittedSelectedShapeCount: ordered.filter(({ shape }) => selected.has(shape.id)).length, truncated: true, shapes: [] };
}

function toolShape(shape: ShapeRecord, props: Record<string, unknown>, truncatedProperties: string[]) {
  return {
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    rotation: shape.rot,
    z: shape.z,
    props,
    ...(truncatedProperties.length ? { truncatedProperties: truncatedProperties.slice(0, 12), additionalTruncatedPropertyCount: Math.max(0, truncatedProperties.length - 12) } : {}),
  };
}

function compactToolValue(value: unknown, path: string, truncatedProperties: string[], depth: number): unknown {
  if (typeof value === "string") {
    if (value.length <= 500) return value;
    truncatedProperties.push(`${path} truncated from ${value.length} characters to 500`);
    return value.slice(0, 500);
  }
  if (Array.isArray(value)) {
    if (path === "props.pts" && value.length > 90 && value.every((item) => typeof item === "number")) {
      const stride = value.length % 3 === 0 ? 3 : 1;
      const pointCount = Math.floor(value.length / stride);
      const keptPoints = Math.max(1, Math.floor(90 / stride));
      const sample = Array.from({ length: keptPoints }, (_, index) => Math.round(index * (pointCount - 1) / Math.max(1, keptPoints - 1)));
      truncatedProperties.push(`${path} sampled ${pointCount} points to ${sample.length} across the stroke`);
      return sample.flatMap((point) => value.slice(point * stride, point * stride + stride));
    }
    const kept = value.slice(0, 90);
    if (value.length > kept.length) truncatedProperties.push(`${path} truncated from ${value.length} items to ${kept.length}`);
    if (depth >= 5 && kept.some((item) => item && typeof item === "object")) {
      truncatedProperties.push(`${path} nested values omitted after depth 5`);
      return kept.map((item) => item && typeof item === "object" ? "[nested value omitted]" : item);
    }
    return kept.map((item, index) => compactToolValue(item, `${path}[${index}]`, truncatedProperties, depth + 1));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const kept = entries.slice(0, 30);
    if (entries.length > kept.length) truncatedProperties.push(`${path} omitted ${entries.length - kept.length} properties`);
    return Object.fromEntries(kept.map(([key, item]) => [key, compactToolValue(item, `${path}.${key}`, truncatedProperties, depth + 1)]));
  }
  return value;
}

function essentialProps(type: ShapeRecord["type"], props: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, string[]> = {
    draw: ["pts", "size"], highlight: ["pts", "color", "size"], geo: ["geo", "w", "h", "label", "color", "size"],
    arrow: ["dx", "dy", "bend", "connection", "color", "size"], line: ["dx", "dy", "color", "size"],
    text: ["text", "color", "size", "font", "autosize", "scale"], note: ["text", "color", "size", "font", "scale"], image: [],
  };
  return Object.fromEntries((fields[type] ?? []).filter((key) => key in props).map((key) => [key, props[key]]));
}

function fitsCanvasState(boardId: string, objectCount: number, shapes: Array<Record<string, unknown>>, selected: Set<string>): boolean {
  const includedShapeCount = shapes.length;
  const selectedShapeCount = selected.size;
  const includedSelected = shapes.filter((shape) => selected.has(String(shape.id))).length;
  const result = { boardId, objectCount, includedShapeCount, omittedShapeCount: objectCount - includedShapeCount, selectedShapeCount, omittedSelectedShapeCount: selectedShapeCount - includedSelected, truncated: includedShapeCount < objectCount || shapes.some((shape) => "truncatedProperties" in shape), shapes };
  return JSON.stringify(result).length <= MAX_CANVAS_STATE_CHARS;
}

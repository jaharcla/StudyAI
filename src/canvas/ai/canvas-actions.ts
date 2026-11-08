import { newId, pageBounds, type ShapeRecord, type Snapshot, type Store } from "@quickdrawjs/core";
import { z } from "zod";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const dimension = z.number().finite().min(1).max(100_000);
const idSchema = z.string().min(1).max(200);
const propsSchema = z.record(z.string(), z.unknown());
const createSchema = z.object({
  type: z.enum(["geo", "arrow", "line", "text", "note"]),
  x: coordinate,
  y: coordinate,
  rot: z.number().finite().min(-6.284).max(6.284).optional(),
  props: propsSchema,
}).strict();
export const canvasActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), shape: createSchema }).strict(),
  z.object({ kind: z.literal("update"), id: idSchema, patch: z.object({ x: coordinate.optional(), y: coordinate.optional(), rot: z.number().finite().min(-6.284).max(6.284).optional(), props: propsSchema.optional() }).strict().refine((v) => Object.keys(v).length > 0 && (!v.props || Object.keys(v.props).length > 0)) }).strict(),
  z.object({ kind: z.literal("move"), id: idSchema, x: coordinate, y: coordinate }).strict(),
  z.object({ kind: z.literal("delete"), id: idSchema }).strict(),
  z.object({ kind: z.literal("connect"), fromId: idSchema, toId: idSchema }).strict(),
]);

export type CanvasAction = z.infer<typeof canvasActionSchema>;
export type CanvasProposal = { id: string; boardId: string; expectedFingerprint: string; action: CanvasAction; description: string };

const colors = ["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red"];
const sizes = ["s", "m", "l", "xl"];
const dashes = ["draw", "solid", "dashed", "dotted"];
const fills = ["none", "semi", "solid", "pattern"];
const fonts = ["draw", "sans", "serif", "mono"];
const geometries = ["rectangle", "ellipse", "triangle", "diamond", "hexagon", "star"];
const allowed: Record<ShapeRecord["type"], Set<string>> = {
  draw: new Set(), highlight: new Set(), geo: new Set(["geo", "w", "h", "color", "size", "dash", "fill", "label", "labelSize", "font"]),
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

function parseAction(value: unknown): CanvasAction { return canvasActionSchema.parse(value); }
function getShape(source: Store | Snapshot, id: string): ShapeRecord {
  const shape = storeOf(source)?.get(id) ?? snapshotOf(source).document.store[id];
  if (!shape || shape.typeName !== "shape") throw new Error(`Unknown shape ID: ${id}.`);
  if (!(shape.type in allowed) || !allowed[shape.type].size) throw new Error(`Unsupported shape type: ${shape.type}.`);
  return shape as ShapeRecord;
}

export function validateCanvasAction(source: Store | Snapshot, value: unknown): CanvasAction {
  const action = parseAction(value);
  if (action.kind === "create") validateProps(action.shape.type, action.shape.props, false);
  if (action.kind === "update") {
    const target = getShape(source, action.id);
    if (action.patch.props) validateProps(target.type, action.patch.props, true);
    if ((target.type === "arrow" || target.type === "line") && (action.patch.props?.dx !== undefined || action.patch.props?.dy !== undefined)) {
      const dx = Number(action.patch.props.dx ?? target.props.dx), dy = Number(action.patch.props.dy ?? target.props.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.1) throw new Error("Line geometry must have non-zero length.");
    }
    if (Object.keys(action.patch).length === 0) throw new Error("An update needs at least one supported property.");
  }
  if (action.kind === "move" || action.kind === "delete") getShape(source, action.id);
  if (action.kind === "connect") {
    if (action.fromId === action.toId) throw new Error("A shape cannot connect to itself.");
    const from = getShape(source, action.fromId), to = getShape(source, action.toId);
    const a = shapeCenter(from), b = shapeCenter(to);
    if (Math.abs(b.x - a.x) > 1_000_000 || Math.abs(b.y - a.y) > 1_000_000) throw new Error("Connection geometry is out of bounds.");
  }
  return action;
}

export function proposeCanvasAction(source: Store | Snapshot, boardId: string, value: unknown): CanvasProposal {
  if (!boardId) throw new Error("A board scope is required.");
  const action = validateCanvasAction(source, value);
  return { id: newId("canvas-proposal"), boardId, expectedFingerprint: canvasFingerprint(source), action, description: describe(action) };
}

function describe(action: CanvasAction): string {
  if (action.kind === "create") return `Create ${action.shape.type} shape`;
  if (action.kind === "update") return `Update shape ${action.id}`;
  if (action.kind === "move") return `Move shape ${action.id}`;
  if (action.kind === "delete") return `Delete shape ${action.id}`;
  return `Connect shapes ${action.fromId} and ${action.toId}`;
}

function makeShape(source: Store, data: Extract<CanvasAction, { kind: "create" }>["shape"]): ShapeRecord {
  const props = structuredClone(data.props);
  if (data.type === "geo") Object.assign(props, { dash: props.dash ?? "solid", fill: props.fill ?? "none" });
  if (data.type === "arrow") Object.assign(props, { bend: props.bend ?? 0, dash: props.dash ?? "solid" });
  if (data.type === "line") Object.assign(props, { dash: props.dash ?? "solid" });
  if (data.type === "text") Object.assign(props, { font: props.font ?? "draw", autosize: props.autosize ?? true, scale: props.scale ?? 1 });
  if (data.type === "note") Object.assign(props, { font: props.font ?? "draw", scale: props.scale ?? 1 });
  return { id: newId("shape"), typeName: "shape", type: data.type, x: data.x, y: data.y, rot: data.rot ?? 0, z: source.maxZ() + 1, props };
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

export function approveCanvasProposal(source: Store, activeBoardId: string, proposal: CanvasProposal): { changedId: string } {
  if (!activeBoardId || proposal.boardId !== activeBoardId) throw new Error("Proposal belongs to a different board.");
  if (proposal.expectedFingerprint !== canvasFingerprint(source)) throw new Error("Canvas changed after this proposal; request a fresh proposal.");
  const action = validateCanvasAction(source, proposal.action);
  let changedId = "";
  source.transact(() => {
    if (action.kind === "create") { const shape = makeShape(source, action.shape); changedId = shape.id; source.put(shape); }
    else if (action.kind === "update") { changedId = action.id; source.update(action.id, action.patch); }
    else if (action.kind === "move") { changedId = action.id; source.update(action.id, { x: action.x, y: action.y }); }
    else if (action.kind === "delete") { changedId = action.id; source.remove([action.id]); }
    else {
      const a = getShape(source, action.fromId), b = getShape(source, action.toId);
      const from = shapeCenter(a), to = shapeCenter(b);
      const shape: ShapeRecord = { id: newId("shape"), typeName: "shape", type: "arrow", x: from.x, y: from.y, rot: 0, z: source.maxZ() + 1,
        props: { dx: to.x - from.x, dy: to.y - from.y, bend: 0, color: "black", size: "m", dash: "solid", connection: { fromId: a.id, toId: b.id } } };
      changedId = shape.id; source.put(shape);
    }
  });
  return { changedId };
}

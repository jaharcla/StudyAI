import { createHash } from "node:crypto";
import { localBounds, pageBounds, type ShapeRecord } from "@quickdrawjs/react";
import { z } from "zod";
import type { CanvasInput, CanvasRecord, PixelToWorld } from "./types.js";

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function normalizeCanvasInput(args: {
  boardId: string; courseId?: string; lessonId?: string; snapshot: unknown;
  scientificObjects?: unknown[]; selectedIds?: string[]; image?: CanvasInput["image"]; neighborhoodPadding?: number;
}): CanvasInput {
  const document = obj(obj(args.snapshot).document);
  const store = obj(document.store);
  const records: CanvasRecord[] = Object.entries(store).map(([key, raw]) => normalizeRecord(key, raw));
  const objects = (args.scientificObjects ?? []).map((v) => obj(v)).filter((o): o is typeof o & { id: string; x: number; y: number; width: number; height: number; kind: string } => typeof o.id === "string" && typeof o.kind === "string" && [o.x, o.y, o.width, o.height].every(finite));
  const selected = new Set(args.selectedIds ?? []);
  const selectedBounds = [...records.filter((r) => selected.has(r.id)).map((r) => r.bounds), ...objects.filter((o) => selected.has(o.id)).map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }))].filter((b): b is NonNullable<typeof b> => !!b);
  const pad = args.neighborhoodPadding ?? 240;
  const inRegion = (b: NonNullable<CanvasRecord["bounds"]>) => selectedBounds.some((s) => b.x <= s.x + s.width + pad && b.x + b.width >= s.x - pad && b.y <= s.y + s.height + pad && b.y + b.height >= s.y - pad);
  const scopedRecords = selected.size && selectedBounds.length ? records.filter((r) => selected.has(r.id) || (r.bounds && inRegion(r.bounds))) : records;
  const scopedObjects = selected.size && selectedBounds.length ? objects.filter((o) => selected.has(o.id) || inRegion({ x: o.x, y: o.y, width: o.width, height: o.height })) : objects;
  const boundsOf = (r: CanvasRecord) => r.bounds;
  const entities = [...scopedRecords.filter((r) => r.bounds).map((r) => ({ id: r.id, bounds: boundsOf(r)! })), ...scopedObjects.map((o) => ({ id: o.id, bounds: { x: o.x, y: o.y, width: o.width, height: o.height } }))];
  const relationships: CanvasInput["relationships"] = [];
  for (let i = 0; i < entities.length; i++) for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j];
    const ax = a.bounds.x + a.bounds.width / 2, ay = a.bounds.y + a.bounds.height / 2;
    const bx = b.bounds.x + b.bounds.width / 2, by = b.bounds.y + b.bounds.height / 2;
    const distance = Math.hypot(ax - bx, ay - by);
    if (distance <= Math.max(a.bounds.width + a.bounds.height, b.bounds.width + b.bounds.height) * 1.5 + 80) relationships.push({ fromId: a.id, toId: b.id, distance, basis: "bounds" });
  }
  const content = { boardId: args.boardId, courseId: args.courseId, lessonId: args.lessonId, selectedIds: args.selectedIds ?? [], records: scopedRecords, objects: scopedObjects };
  return { boardId: args.boardId, courseId: args.courseId, lessonId: args.lessonId, selectedIds: args.selectedIds ?? [], nativeRecords: scopedRecords, scientificObjects: scopedObjects, relationships, image: args.image, revision: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

function normalizeRecord(key: string, raw: unknown): CanvasRecord {
  const item = obj(raw), id = typeof item.id === "string" ? item.id : key;
  if (item.typeName === "shape" && item.props && typeof item.props === "object") return normalizeQuickdrawShape(item as unknown as ShapeRecord);
  const type = String(item.type ?? item.kind ?? "unknown");
  const x = item.x ?? obj(item.position).x, y = item.y ?? obj(item.position).y;
  const width = item.width ?? item.w, height = item.height ?? item.h;
  const bounds = finite(x) && finite(y) && finite(width) && finite(height) && width >= 0 && height >= 0 ? { x, y, width, height } : undefined;
  const text = typeof item.text === "string" ? item.text : typeof item.value === "string" ? item.value : undefined;
  return { id, type, ...(bounds ? { bounds } : {}), ...(item.points ? { geometry: item.points } : item.geometry ? { geometry: item.geometry } : {}), ...(text !== undefined ? { text } : {}), raw };
}

export function normalizeQuickdrawShape(shape: ShapeRecord): CanvasRecord {
  const props = obj(shape.props), bounds = quickdrawBounds(shape);
  const text = typeof props.text === "string" ? props.text : typeof props.label === "string" ? props.label : undefined;
  const geometry = shape.type === "arrow" || shape.type === "line"
    ? { kind: shape.type, start: rotateQuickdrawPoint(shape, 0, 0), end: rotateQuickdrawPoint(shape, finite(props.dx) ? props.dx : 0, finite(props.dy) ? props.dy : 0), bend: finite(props.bend) ? props.bend : 0 }
    : (shape.type === "draw" || shape.type === "highlight") && Array.isArray(props.pts)
      ? { kind: "stroke", points: worldStrokePoints(shape, props.pts) }
      : { kind: shape.type, ...(finite(props.w) ? { width: props.w } : {}), ...(finite(props.h) ? { height: props.h } : {}) };
  return { id: shape.id, type: shape.type, bounds, geometry, ...(text !== undefined ? { text } : {}), raw: shape };
}

function quickdrawBounds(shape: ShapeRecord): NonNullable<CanvasRecord["bounds"]> {
  if (shape.type === "text" || shape.type === "note") {
    const p = shape.props, scale = finite(p.scale) && p.scale > 0 ? p.scale : 1;
    const rows = String(p.text ?? "").split("\n"), fontSize = p.size === "xl" ? 28 : p.size === "l" ? 22 : p.size === "s" ? 12 : 16;
    const width = finite(p.w) && p.autosize === false ? p.w * scale : Math.max(32, ...rows.map((row) => row.length * fontSize * 0.64)) * scale;
    const height = shape.type === "note" ? Math.max(200, rows.length * fontSize * 1.35 + 40) * scale : Math.max(fontSize * 1.32, rows.length * fontSize * 1.32) * scale;
    return rotateBounds(shape, { x: shape.x, y: shape.y, width, height });
  }
  try {
    const b = pageBounds(shape);
    return { x: b.x, y: b.y, width: b.w, height: b.h };
  } catch {
    const p = obj(shape.props), width = finite(p.w) ? p.w : finite(p.dx) ? Math.abs(p.dx) : 0, height = finite(p.h) ? p.h : finite(p.dy) ? Math.abs(p.dy) : 0;
    return rotateBounds(shape, { x: shape.x, y: shape.y, width, height });
  }
}

function rotateBounds(shape: ShapeRecord, bounds: NonNullable<CanvasRecord["bounds"]>) {
  if (!shape.rot) return bounds;
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2, corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height]].map(([x, y]) => rotatePoint(x, y, cx, cy, shape.rot));
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function rotateQuickdrawPoint(shape: ShapeRecord, x: number, y: number) {
  if (!shape.rot) return { x: shape.x + x, y: shape.y + y };
  const b = localBounds(shape), cx = shape.x + b.x + b.w / 2, cy = shape.y + b.y + b.h / 2;
  return rotatePoint(shape.x + x, shape.y + y, cx, cy, shape.rot);
}

function rotatePoint(x: number, y: number, cx: number, cy: number, angle: number) {
  const dx = x - cx, dy = y - cy, c = Math.cos(angle), s = Math.sin(angle);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function worldStrokePoints(shape: ShapeRecord, pts: unknown[]) {
  const out: Array<{ x: number; y: number; pressure: number | null }> = [];
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], pressure = pts[i + 2];
    if (finite(x) && finite(y)) out.push({ ...rotateQuickdrawPoint(shape, x, y), pressure: finite(pressure) ? pressure : null });
  }
  return out;
}

export function quickdrawPixelToWorld(camera: { x: number; y: number; z: number }, devicePixelRatio = 1, cropOrigin = { x: 0, y: 0 }): PixelToWorld {
  if (!finite(camera.x) || !finite(camera.y) || !finite(camera.z) || camera.z <= 0 || !finite(devicePixelRatio) || devicePixelRatio <= 0) throw new Error("Quickdraw camera and pixel ratio must be finite and positive.");
  return { scaleX: 1 / (camera.z * devicePixelRatio), scaleY: 1 / (camera.z * devicePixelRatio), offsetX: cropOrigin.x / (camera.z * devicePixelRatio) - camera.x, offsetY: cropOrigin.y / (camera.z * devicePixelRatio) - camera.y };
}

export function geometryObservations(input: CanvasInput) {
  const observations: Array<{ description: string; sourceIds: string[]; confidence: number; basis: "geometry" | "native" }> = input.nativeRecords.filter((record) => record.bounds).map((record) => ({ description: `${record.type} bounds at (${record.bounds!.x}, ${record.bounds!.y}), ${record.bounds!.width}×${record.bounds!.height}`, sourceIds: [record.id], confidence: 1, basis: "geometry" }));
  for (const record of input.nativeRecords) {
    const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
    const start = geometry.start && typeof geometry.start === "object" ? geometry.start as Record<string, unknown> : undefined;
    const end = geometry.end && typeof geometry.end === "object" ? geometry.end as Record<string, unknown> : undefined;
    if (start && end && [start.x, start.y, end.x, end.y].every(finite)) {
      const dx = Number(end.x) - Number(start.x), dy = Number(end.y) - Number(start.y);
      const direction = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? "right" : "left" : dy >= 0 ? "down" : "up";
      observations.push({ description: `Arrow direction ${direction} from exact endpoints (${start.x}, ${start.y}) to (${end.x}, ${end.y})`, sourceIds: [record.id], confidence: 1, basis: "geometry" });
    }
  }
  for (const object of input.scientificObjects) {
    observations.push({ description: `Native ${object.kind} object ${object.id} at (${object.x}, ${object.y})`, sourceIds: [object.id], confidence: 1, basis: "native" });
    if ((object.kind === "vector" || object.kind === "force") && Array.isArray(object.components) && object.components.length === 3 && object.components.every(finite)) {
      const [x, y, z] = object.components as number[];
      observations.push({ description: `${object.kind} components [${x}, ${y}, ${z}], magnitude ${Math.hypot(x, y, z)}`, sourceIds: [object.id], confidence: 1, basis: "geometry" });
    }
  }
  for (const r of input.relationships) observations.push({ description: `Objects ${r.fromId} and ${r.toId} have center distance ${Number(r.distance.toFixed(2))} world units`, sourceIds: [r.fromId, r.toId], confidence: 1, basis: "geometry" });
  return observations;
}

export function quickdrawBondRelationships(input: CanvasInput) {
  const elements = new Set(["H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Br", "I"]);
  const atoms = input.nativeRecords.filter((record) => {
    const raw = obj(record.raw), props = obj(raw.props);
    return record.type === "geo" && props.geo === "ellipse" && elements.has(String(props.label ?? "")) && !!record.bounds;
  });
  const ellipseBoundaryDistance = (point: { x: number; y: number }, bounds: NonNullable<CanvasRecord["bounds"]>) => {
    const rx = bounds.width / 2, ry = bounds.height / 2;
    if (!rx || !ry) return Infinity;
    const radial = Math.hypot((point.x - bounds.x - rx) / rx, (point.y - bounds.y - ry) / ry);
    return Math.abs(radial - 1) * Math.min(rx, ry);
  };
  const edgeAtoms = (point: { x: number; y: number }) => atoms.map((atom) => ({ atom, distance: ellipseBoundaryDistance(point, atom.bounds!) })).sort((a, b) => a.distance - b.distance);
  const counts = new Map<string, { a: CanvasRecord; b: CanvasRecord; lines: string[] }>();
  for (const line of input.nativeRecords.filter((record) => record.type === "line")) {
    const geometry = obj(line.geometry), start = obj(geometry.start), end = obj(geometry.end);
    if (![start.x, start.y, end.x, end.y].every(finite)) continue;
    const from = edgeAtoms({ x: Number(start.x), y: Number(start.y) }), to = edgeAtoms({ x: Number(end.x), y: Number(end.y) });
    if (!from.length || !to.length || from[0].distance > 10 || to[0].distance > 10 || from[0].atom.id === to[0].atom.id) continue;
    const pair = [from[0].atom, to[0].atom].sort((a, b) => a.id.localeCompare(b.id)), key = pair.map((atom) => atom.id).join("\0");
    const entry = counts.get(key) ?? { a: pair[0], b: pair[1], lines: [] };
    entry.lines.push(line.id); counts.set(key, entry);
  }
  return [...counts.values()].map(({ a, b, lines }) => ({ fromId: a.id, toId: b.id, relation: lines.length === 2 ? "double bond" : lines.length === 3 ? "triple bond" : "single bond", sourceIds: [a.id, b.id, ...lines], confidence: 1, basis: "geometry" as const }));
}

export function mergeQuickdrawBondRelationships<T extends { relationships: Array<{ fromId: string; toId: string; relation: string; sourceIds: string[]; confidence: number; basis: "geometry" | "model" }> }>(input: CanvasInput, result: T): T {
  const exact = quickdrawBondRelationships(input);
  if (!exact.length) return result;
  const lineIds = new Set(input.nativeRecords.filter((record) => record.type === "line").map((record) => record.id));
  const bonds = new Set(exact.map((edge) => [edge.fromId, edge.toId].sort().join("\0")));
  const relationships = result.relationships.filter((edge) => {
    if (!/\bbond\b/i.test(edge.relation)) return true;
    const key = [edge.fromId, edge.toId].sort().join("\0");
    return !bonds.has(key) && !edge.sourceIds.some((id) => lineIds.has(id));
  });
  return { ...result, relationships: [...relationships, ...exact] };
}

export const LooseRecordSchema = z.record(z.string(), z.unknown());

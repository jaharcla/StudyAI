import { pageBounds, type Bounds, type Editor, type Snapshot } from "@quickdrawjs/core";
import type { CanvasDocument, Point, ScientificObject } from "./model";
import { arrowGeometry, withArrowEndpoints, type ArrowGeometry } from "./geometry";
import { atomWorldPosition, moleculeBounds } from "./molecules";

export type ObjectAnchor = { scope: "science" | "quickdraw"; id: string; u?: number; v?: number; atomId?: string };
export type SceneLine = Extract<ScientificObject, { kind: "vector" | "force" | "measurement" | "relationship" | "bond" }>;
const attachable = (object: ScientificObject) => !["vector", "force", "measurement", "relationship", "bond"].includes(object.kind);
const ratio = (value: number, origin: number, extent: number) => Math.max(0, Math.min(1, (value - origin) / (extent || 1)));

export function objectBounds(object: ScientificObject): Bounds {
  if (object.kind === "molecule") {
    const b = moleculeBounds(object);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  if (object.kind === "vector" || object.kind === "force") {
    const { tail, tip } = arrowGeometry(object);
    return { x: Math.min(tail.x, tip.x), y: Math.min(tail.y, tip.y), w: Math.abs(tail.x - tip.x), h: Math.abs(tail.y - tip.y) };
  }
  return { x: object.x - object.width / 2, y: object.y - object.height / 2, w: object.width, h: object.height };
}

export function resolveAnchor(anchor: ObjectAnchor | undefined, objects: ScientificObject[], snapshot: Snapshot): Point | undefined {
  if (!anchor) return;
  let bounds: Bounds;
  if (anchor.scope === "quickdraw") {
    const record = snapshot.document.store[anchor.id];
    if (!record || record.typeName !== "shape") return;
    bounds = pageBounds(record);
  } else {
    const object = objects.find((item) => item.id === anchor.id);
    if (!object || !attachable(object)) return;
    if (anchor.atomId && object.kind === "molecule") {
      const atom = object.atoms.find((atom) => atom.id === anchor.atomId);
      return atom ? atomWorldPosition(object, atom) : undefined;
    }
    bounds = objectBounds(object);
  }
  return { x: bounds.x + bounds.w * (anchor.u ?? 0.5), y: bounds.y + bounds.h * (anchor.v ?? 0.5) };
}

export function anchorAt(point: Point, objects: ScientificObject[], editor: Editor, exclude?: string): ObjectAnchor | undefined {
  for (const object of [...objects].reverse()) {
    if (object.id === exclude || !attachable(object)) continue;
    if (object.kind === "molecule") {
      const atom = object.atoms.find((atom) => { const p = atomWorldPosition(object, atom); return Math.hypot(p.x - point.x, p.y - point.y) < 22 / editor.camera.z; });
      if (atom) return { scope: "science", id: object.id, atomId: atom.id };
    }
    const b = objectBounds(object);
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return { scope: "science", id: object.id, u: ratio(point.x, b.x, b.w), v: ratio(point.y, b.y, b.h) };
  }
  const shape = editor.hitTest(point.x, point.y);
  if (shape) { const b = pageBounds(shape); return { scope: "quickdraw", id: shape.id, u: ratio(point.x, b.x, b.w), v: ratio(point.y, b.y, b.h) }; }
}

export function lineGeometry(object: SceneLine): ArrowGeometry {
  if (object.kind === "vector" || object.kind === "force") return arrowGeometry(object);
  return object.geometry ?? { tail: { x: object.x - 50, y: object.y }, tip: { x: object.x + 50, y: object.y }, ...(object.kind === "measurement" ? { unitsPerCanvasUnit: Math.abs(object.value) / 100 || 1 } : {}) };
}

export function withLineEndpoints(object: SceneLine, tail: Point, tip: Point, refs?: Pick<ArrowGeometry, "tailRef" | "tipRef">): SceneLine {
  const geometry = { ...lineGeometry(object), tail, tip, ...refs };
  if (object.kind === "vector" || object.kind === "force") return withArrowEndpoints({ ...object, geometry }, tail, tip);
  return { ...object, x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2, geometry,
    ...(object.kind === "measurement" ? { value: Math.hypot(tip.x - tail.x, tip.y - tail.y) * (geometry.unitsPerCanvasUnit ?? 1) } : {}),
    ...(object.kind === "relationship" ? { fromId: geometry.tailRef?.id ?? "", toId: geometry.tipRef?.id ?? "" } : {}),
    ...(object.kind === "bond" ? { from: geometry.tailRef?.id ?? object.from, to: geometry.tipRef?.id ?? object.to } : {}) };
}

export function resolveScene(document: CanvasDocument): CanvasDocument {
  const objects = document.objects.map((object) => {
    if (!["vector", "force", "measurement", "relationship", "bond"].includes(object.kind)) return object;
    const line = object as SceneLine;
    let geometry = lineGeometry(line);
    if (line.kind === "relationship" && !line.geometry) geometry = { ...geometry, tailRef: line.fromId ? { scope: "science", id: line.fromId } : undefined, tipRef: line.toId ? { scope: "science", id: line.toId } : undefined };
    if (!geometry.tailRef && !geometry.tipRef) return object;
    const tail = resolveAnchor(geometry.tailRef, document.objects, document.snapshot), tip = resolveAnchor(geometry.tipRef, document.objects, document.snapshot);
    if ((line.kind === "vector" || line.kind === "force") && tail && !geometry.tipRef) {
      const movedTip = { x: geometry.tip.x + tail.x - geometry.tail.x, y: geometry.tip.y + tail.y - geometry.tail.y };
      return { ...line, x: tail.x, y: tail.y, geometry: { ...geometry, tail, tip: movedTip }, ...(line.kind === "force" ? { pointOfApplication: tail } : {}) };
    }
    return withLineEndpoints({ ...line, geometry }, tail ?? geometry.tail, tip ?? geometry.tip, { tailRef: tail ? geometry.tailRef : undefined, tipRef: tip ? geometry.tipRef : undefined });
  });
  return { ...document, objects };
}

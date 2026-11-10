import type { Point, ScientificObject } from "./model";
import type { ObjectAnchor } from "./scene";

export type ArrowGeometry = { tail: Point; tip: Point; unitsPerCanvasUnit?: number; tailRef?: ObjectAnchor; tipRef?: ObjectAnchor };
export type ScientificArrow = Extract<ScientificObject, { kind: "vector" | "force" }>;

export function arrowGeometry(object: ScientificArrow): ArrowGeometry {
  const tail = object.geometry?.tail ?? (object.kind === "force" ? object.pointOfApplication : undefined) ?? { x: object.x, y: object.y };
  const scale = object.geometry ? object.geometry.unitsPerCanvasUnit ?? 1 : 1 / 24;
  return { ...object.geometry, tail, tip: { x: tail.x + object.components[0] / scale, y: tail.y - object.components[1] / scale }, ...(object.geometry ? { unitsPerCanvasUnit: object.geometry.unitsPerCanvasUnit } : { unitsPerCanvasUnit: scale }) };
}

export function isArrowGeometryConsistent(before: ScientificObject, current: ScientificObject): boolean {
  if ((before.kind !== "vector" && before.kind !== "force") || (current.kind !== "vector" && current.kind !== "force")) return true;
  if (before.kind !== current.kind) return false;
  const initial = arrowGeometry(before), next = arrowGeometry(current);
  const initialScale = initial.unitsPerCanvasUnit ?? 1, nextScale = next.unitsPerCanvasUnit ?? 1;
  if (Math.abs(initialScale - nextScale) > 1e-9) return false;
  if (current.geometry && Math.hypot(current.geometry.tip.x - next.tip.x, current.geometry.tip.y - next.tip.y) > 1e-7) return false;
  return sameAnchor(before.geometry?.tailRef, current.geometry?.tailRef) && sameAnchor(before.geometry?.tipRef, current.geometry?.tipRef);
}

export function withArrowEndpoints<T extends ScientificArrow>(object: T, tail: Point, tip: Point): T {
  const scale = object.geometry?.unitsPerCanvasUnit ?? 1;
  const components: [number, number, number] = [(tip.x - tail.x) * scale, (tail.y - tip.y) * scale, object.components[2]];
  return { ...object, x: tail.x, y: tail.y, components, geometry: { ...object.geometry, tail, tip }, ...(object.kind === "force" ? { pointOfApplication: tail } : {}) };
}

export function synchronizeObject(previous: ScientificObject, next: ScientificObject): ScientificObject {
  if ((next.kind === "measurement" || next.kind === "relationship" || next.kind === "bond") && next.geometry) {
    let geometry = next.geometry;
    if ("geometry" in previous && geometry === previous.geometry) {
      if (next.x !== previous.x || next.y !== previous.y) { const dx = next.x - previous.x, dy = next.y - previous.y; geometry = { ...geometry, tail: { x: geometry.tail.x + dx, y: geometry.tail.y + dy }, tip: { x: geometry.tip.x + dx, y: geometry.tip.y + dy }, tailRef: undefined, tipRef: undefined }; }
      if (next.kind === "measurement" && previous.kind === "measurement" && next.value !== previous.value && next.value > 0) { const distance = Math.hypot(geometry.tip.x - geometry.tail.x, geometry.tip.y - geometry.tail.y); if (distance) geometry = { ...geometry, unitsPerCanvasUnit: next.value / distance }; }
      if (next.kind === "relationship" && previous.kind === "relationship") geometry = { ...geometry, ...(next.fromId !== previous.fromId ? { tailRef: next.fromId ? { scope: "science", id: next.fromId } : undefined } : {}), ...(next.toId !== previous.toId ? { tipRef: next.toId ? { scope: "science", id: next.toId } : undefined } : {}) };
    }
    return { ...next, geometry };
  }
  if (next.kind !== "vector" && next.kind !== "force") return next;
  const geometry = arrowGeometry(next);
  if ((previous.kind === "vector" || previous.kind === "force") && next.geometry === previous.geometry && next.components.some((value, index) => value !== previous.components[index])) geometry.tipRef = undefined;
  if ((previous.kind === "vector" || previous.kind === "force") && next.geometry === previous.geometry && (next.x !== previous.x || next.y !== previous.y)) {
    geometry.tail = { x: geometry.tail.x + next.x - previous.x, y: geometry.tail.y + next.y - previous.y };
    const scale = geometry.unitsPerCanvasUnit ?? 1;
    geometry.tip = { x: geometry.tail.x + next.components[0] / scale, y: geometry.tail.y - next.components[1] / scale };
    geometry.tailRef = undefined; geometry.tipRef = undefined;
  }
  return { ...next, x: geometry.tail.x, y: geometry.tail.y, geometry, ...(next.kind === "force" ? { pointOfApplication: geometry.tail } : {}) };
}

export function translateObject(object: ScientificObject, dx: number, dy: number): ScientificObject {
  if (object.kind === "vector" || object.kind === "force") {
    const geometry = arrowGeometry(object);
    const tail = { x: geometry.tail.x + dx, y: geometry.tail.y + dy };
    return { ...object, x: tail.x, y: tail.y, geometry: { ...geometry, tail, tip: { x: geometry.tip.x + dx, y: geometry.tip.y + dy } }, ...(object.kind === "force" ? { pointOfApplication: tail } : {}) };
  }
  return { ...object, x: object.x + dx, y: object.y + dy };
}

function sameAnchor(before?: ObjectAnchor, current?: ObjectAnchor) {
  return before?.scope === current?.scope && before?.id === current?.id && before?.atomId === current?.atomId && before?.u === current?.u && before?.v === current?.v;
}

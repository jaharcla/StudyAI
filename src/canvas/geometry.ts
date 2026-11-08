import type { Point, ScientificObject } from "./model";

export type ArrowGeometry = { tail: Point; tip: Point; unitsPerCanvasUnit?: number };
export type ScientificArrow = Extract<ScientificObject, { kind: "vector" | "force" }>;

export function arrowGeometry(object: ScientificArrow): ArrowGeometry {
  const tail = object.geometry?.tail ?? (object.kind === "force" ? object.pointOfApplication : undefined) ?? { x: object.x, y: object.y };
  const scale = object.geometry ? object.geometry.unitsPerCanvasUnit ?? 1 : 1 / 24;
  return { tail, tip: { x: tail.x + object.components[0] / scale, y: tail.y - object.components[1] / scale }, ...(object.geometry ? { unitsPerCanvasUnit: object.geometry.unitsPerCanvasUnit } : { unitsPerCanvasUnit: scale }) };
}

export function withArrowEndpoints<T extends ScientificArrow>(object: T, tail: Point, tip: Point): T {
  const scale = object.geometry?.unitsPerCanvasUnit ?? 1;
  const components: [number, number, number] = [(tip.x - tail.x) * scale, (tail.y - tip.y) * scale, object.components[2]];
  return { ...object, x: tail.x, y: tail.y, components, geometry: { ...object.geometry, tail, tip }, ...(object.kind === "force" ? { pointOfApplication: tail } : {}) };
}

export function synchronizeObject(previous: ScientificObject, next: ScientificObject): ScientificObject {
  if (next.kind !== "vector" && next.kind !== "force") return next;
  const geometry = arrowGeometry(next);
  if ((previous.kind === "vector" || previous.kind === "force") && next.geometry === previous.geometry && (next.x !== previous.x || next.y !== previous.y)) {
    geometry.tail = { x: geometry.tail.x + next.x - previous.x, y: geometry.tail.y + next.y - previous.y };
    const scale = geometry.unitsPerCanvasUnit ?? 1;
    geometry.tip = { x: geometry.tail.x + next.components[0] / scale, y: geometry.tail.y - next.components[1] / scale };
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

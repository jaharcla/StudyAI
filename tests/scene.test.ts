import { expect, it } from "vitest";
import { createObject, emptyCanvasDocument, parseCanvasDocument } from "../src/canvas/model";
import { lineGeometry, resolveScene, withLineEndpoints } from "../src/canvas/scene";
import { synchronizeObject } from "../src/canvas/geometry";

it("keeps measurements and relationships attached to moved scientific objects", () => {
  const a = createObject("concept", 100, 100), b = createObject("concept", 400, 100);
  const measurement = createObject("measurement", 0, 0), relationship = createObject("relationship", 0, 0);
  if (measurement.kind !== "measurement" || relationship.kind !== "relationship") throw Error();
  const refs = { tailRef: { scope: "science" as const, id: a.id }, tipRef: { scope: "science" as const, id: b.id } };
  const objects = [a, b, withLineEndpoints(measurement, a, b, refs), withLineEndpoints(relationship, a, b, refs)];
  const next = resolveScene({ ...emptyCanvasDocument(), objects: objects.map((object) => object.id === b.id ? { ...object, x: 500, y: 400 } : object) });
  expect(next.objects[2]).toMatchObject({ value: 5, geometry: { tip: { x: 500, y: 400 } } });
  expect(next.objects[3]).toMatchObject({ fromId: a.id, toId: b.id, geometry: { tip: { x: 500, y: 400 } } });
  expect(parseCanvasDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
});

it("follows native Quickdraw bounds and detaches deleted targets without losing geometry", () => {
  const force = createObject("force", 0, 0);
  if (force.kind !== "force") throw Error();
  const object = withLineEndpoints({ ...force, geometry: { tail: { x: 10, y: 20 }, tip: { x: 110, y: 20 } } }, { x: 10, y: 20 }, { x: 110, y: 20 }, { tailRef: { scope: "quickdraw", id: "shape", u: 0.5, v: 0 } });
  const doc = resolveScene({ ...emptyCanvasDocument(), objects: [object], snapshot: { document: { store: { shape: { id: "shape", typeName: "shape", type: "geo", x: 200, y: 300, rot: 0, z: 0, props: { w: 100, h: 80, geo: "rectangle" } } } } } });
  expect(doc.objects[0]).toMatchObject({ components: [100, 0, 0], pointOfApplication: { x: 250, y: 300 }, geometry: { tip: { x: 350, y: 300 } } });
  const detached = resolveScene({ ...doc, snapshot: emptyCanvasDocument().snapshot });
  expect(lineGeometry(detached.objects[0] as typeof force).tailRef).toBeUndefined();
  expect(lineGeometry(detached.objects[0] as typeof force).tail).toEqual({ x: 250, y: 300 });
});

it("numeric vector edits detach the changed tip while retaining its anchored tail", () => {
  const force = createObject("force", 0, 0);
  if (force.kind !== "force") throw Error();
  const before = { ...force, geometry: { tail: { x: 0, y: 0 }, tip: { x: 0, y: 9.8 }, tailRef: { scope: "quickdraw" as const, id: "shape" }, tipRef: { scope: "science" as const, id: "concept" } } };
  const after = synchronizeObject(before, { ...before, components: [10, 20, 0] });
  expect(after).toMatchObject({ geometry: { tailRef: before.geometry.tailRef, tip: { x: 10, y: -20 } } });
  expect(lineGeometry(after as typeof force).tipRef).toBeUndefined();
});

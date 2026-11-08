import { expect, it } from "vitest";
import { arrowGeometry, synchronizeObject, translateObject, withArrowEndpoints } from "../src/canvas/geometry";
import { createObject, emptyCanvasDocument, parseCanvasDocument } from "../src/canvas/model";
import { proposeCanvasEdit } from "../src/canvas/tutor";

it("maps world coordinates to upward-positive components without assigning physical units", () => {
  const vector = createObject("vector", 0, 0);
  if (vector.kind !== "vector") throw Error();
  const next = withArrowEndpoints({ ...vector, units: "", geometry: { tail: { x: 20, y: 50 }, tip: { x: 20, y: 50 } } }, { x: 20, y: 50 }, { x: 80, y: 10 });
  expect(next.components).toEqual([60, 40, 0]);
  expect(arrowGeometry(next).unitsPerCanvasUnit).toBeUndefined();
  const moved = translateObject(next, 15, 25);
  expect(moved).toMatchObject({ components: [60, 40, 0], geometry: { tail: { x: 35, y: 75 }, tip: { x: 95, y: 35 } } });
});

it("keeps numerical inspector and tutor changes synchronized with arrow endpoints", () => {
  const vector = createObject("vector", 30, 40);
  if (vector.kind !== "vector") throw Error();
  const next = synchronizeObject(vector, { ...vector, components: [10, -5, 2] });
  expect(arrowGeometry(next as typeof vector).tip).toEqual({ x: 270, y: 160 });
  const proposal = proposeCanvasEdit({ boardId: "board", courseId: "course", lessonId: "lesson", objects: [next] }, { boardId: "board", objectId: next.id, patchJson: '{"components":[2,3,0]}', reason: "Change the vector" });
  expect(proposal.after).toMatchObject({ components: [2, 3, 0], geometry: { tip: { x: 78, y: -32 } } });
});

it("preserves legacy vector values on load and honors explicit calibration", () => {
  const force = createObject("force", 50, 80);
  if (force.kind !== "force") throw Error();
  const migrated = parseCanvasDocument({ ...emptyCanvasDocument(), objects: [force] }).objects[0];
  expect(migrated).toMatchObject({ id: force.id, components: force.components, units: force.units });
  const calibrated = withArrowEndpoints({ ...force, geometry: { tail: { x: 50, y: 80 }, tip: { x: 150, y: 80 }, unitsPerCanvasUnit: 0.1 } }, { x: 50, y: 80 }, { x: 150, y: 80 });
  expect(calibrated).toMatchObject({ components: [10, 0, 0], pointOfApplication: { x: 50, y: 80 } });
});

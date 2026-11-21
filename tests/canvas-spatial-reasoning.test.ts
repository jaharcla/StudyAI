import { describe, expect, it } from "vitest";
import { directionAngleDegrees, includedAngleDegrees } from "../src/canvas/geometry";
import { projectTutorContexts } from "../server/tutor-presentation";

// Regression diagram (screen coordinates, Y down):
//   structured vector: tail (100, 100) -> tip (504, 70.4)      dx=+404,   dy=-29.6
//   drawn line:        tail (100, 100) -> tip (480.8, 268)     dx=+380.8, dy=+168
// Cartesian (Y up): +4.19° above horizontal and -23.8° below -> included 28.0°.
// The old tutor answered 19.8° by subtracting absolute angles (23.8 - rounded 4).
const vectorTail = { x: 100, y: 100 };
const vectorTip = { x: 504, y: 70.4 };
const lineTail = { x: 100, y: 100 };
const lineTip = { x: 480.8, y: 268 };

describe("canvas spatial reasoning: signed geometry", () => {
  it("converts screen deltas to signed Cartesian direction angles", () => {
    expect(directionAngleDegrees(vectorTail, vectorTip)).toBeCloseTo(4.19, 1);
    expect(directionAngleDegrees(lineTail, lineTip)).toBeCloseTo(-23.8, 1);
  });

  it("preserves quadrants when both directions point left", () => {
    const leftUp = directionAngleDegrees({ x: 500, y: 500 }, { x: 100, y: 450 });
    const leftDown = directionAngleDegrees({ x: 500, y: 500 }, { x: 100, y: 550 });
    expect(leftUp).toBeCloseTo(172.9, 1);
    expect(leftDown).toBeCloseTo(-172.9, 1);
    expect(includedAngleDegrees(leftUp, leftDown)).toBeCloseTo(14.25, 1);
  });

  it("computes an included angle from signed angles across the horizontal", () => {
    const vectorAngle = directionAngleDegrees(vectorTail, vectorTip);
    const lineAngle = directionAngleDegrees(lineTail, lineTip);
    expect(includedAngleDegrees(vectorAngle, lineAngle)).toBeCloseTo(28.0, 1);
    expect(includedAngleDegrees(vectorAngle, lineAngle)).not.toBeCloseTo(19.8, 1);
  });
});

describe("tutor projection keeps directional signs for spatial reasoning", () => {
  const projected = JSON.stringify(projectTutorContexts([{ description: "Active canvas scene", value: {
    scope: { boardId: "board-trig" },
    selected: [],
    visible: [{
      id: "shape-line-1", type: "line", position: { x: 100, y: 100, rotation: 0, z: 1 },
      bounds: { x: 100, y: 100, w: 380.8, h: 168 },
      arrow: { from: lineTail, to: lineTip, bend: 0, length: Math.hypot(380.8, 168) },
    }],
    nearbyObjects: [{
      id: "vec-1", kind: "vector", bounds: { x: 100, y: 70, w: 404, h: 30 },
      detail: { label: "v", components: [404.0000305175781, 29.600006103515625, 0], units: "N" },
    }],
    spatialRelationships: [], truncated: false,
  } }], false));

  it("gives the structured vector a precise signed angle instead of a rounded integer", () => {
    expect(projected).toContain('"angleDegrees":4.2');
    expect(projected).toContain("above horizontal");
  });

  it("gives the drawn line a signed angle derived from its exact endpoints", () => {
    expect(projected).toContain('"angleFromHorizontalDegrees":-23.8');
    expect(projected).toContain("below horizontal");
  });

  it("still withholds raw coordinates and component arrays", () => {
    expect(projected).not.toContain("404.0000305175781");
    expect(projected).not.toContain('"components"');
    expect(projected).not.toContain('"x"');
  });
});

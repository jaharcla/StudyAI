import { describe, expect, it } from "vitest";
import type { CanvasAIContext } from "../src/canvas/ai/canvas-context";
import { compactTutorShapes } from "../server/tutor-canvas-context";
import { projectTutorContexts } from "../server/tutor-presentation";

const context: CanvasAIContext = {
  scope: { boardId: "board-trig", courseId: "chem-120", lessonId: "lesson-3", revision: 4 },
  viewport: { x: 0, y: 0, w: 4000, h: 3000 },
  selected: [],
  visible: [
    {
      id: "shape-arrow-1",
      type: "arrow",
      position: { x: 10, y: 20, rotation: 0, z: 1 },
      bounds: { x: 10, y: 20, w: 100, h: 0 },
      arrow: {
        from: { x: 10, y: 20 },
        to: { x: 110, y: 20 },
        bend: 0,
        length: 100,
        labels: [{ text: "34°", distance: 4, confidence: 0.9 }],
      },
    },
    {
      id: "shape-label-1",
      type: "text",
      text: "34°",
      position: { x: 120, y: 20, rotation: 0, z: 2 },
      bounds: { x: 120, y: 20, w: 30, h: 20 },
    },
    {
      id: "shape-draw-1",
      type: "draw",
      position: { x: 200, y: 40, rotation: 0, z: 3 },
      bounds: { x: 200, y: 40, w: 40, h: 60 },
      strokeSummary: { pointCount: 12, bounds: { x: 200, y: 40, w: 40, h: 60 }, simplified: [{ x: 200, y: 40 }] },
    },
    {
      id: "shape-geo-1",
      type: "geo",
      geometry: "ellipse",
      position: { x: 300, y: 40, rotation: 0, z: 4 },
      bounds: { x: 300, y: 40, w: 30, h: 30 },
    },
  ],
  nearbyObjects: [{ id: "vec-1", kind: "vector", bounds: { x: 500, y: 40, w: 90, h: 60 }, detail: { label: "Force", components: [404.0000305175781, 29.600006103515625, 0], units: "N" } }, { id: "mol-1", kind: "molecule", bounds: { x: 500, y: 40, w: 90, h: 60 }, detail: { name: "formaldehyde", atomCount: 3 } }],
  spatialRelationships: [{ fromId: "shape-arrow-1", relation: "overlaps", toId: "shape-label-1" }],
  truncated: false,
};

describe("Tutor canvas geometry context", () => {
  it("keeps geometry, selection ids, relationships and nearby objects before projection", () => {
    const compacted = compactTutorShapes(context);
    expect(compacted.visible[0].id).toBe("shape-arrow-1");
    expect(compacted.visible[0].arrow?.from).toEqual({ x: 10, y: 20 });
    expect(compacted.visible[0].arrow?.to).toEqual({ x: 110, y: 20 });
    expect(compacted.visible[2].strokeSummary?.pointCount).toBe(12);
    expect(compacted.visible[3].geometry).toBe("ellipse");
    expect(compacted.spatialRelationships).toEqual(context.spatialRelationships);
    expect(compacted.nearbyObjects).toEqual(context.nearbyObjects);
  });

  it("projects an interpretable diagram instead of a list of unconnected marks", () => {
    const projected = JSON.stringify(projectTutorContexts([
      { description: "Active canvas scene", value: compactTutorShapes(context) },
    ], false));
    expect(projected).toContain("right");
    expect(projected).toContain("34°");
    expect(projected).toContain("overlaps");
    expect(projected).toContain("formaldehyde");
    expect(projected).toContain("magnitude");
    expect(projected).not.toContain("404.0000305175781");
    expect(projected).not.toContain('"components"');
    expect(projected).toContain("ellipse");
    expect(projected).not.toContain("meaning cannot be determined");
    expect(projected).not.toContain('"x"');
  });
});

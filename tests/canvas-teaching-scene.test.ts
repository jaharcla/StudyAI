import { describe, expect, it } from "vitest";
import { canvasActionSchema } from "../src/canvas/ai/canvas-actions";
import { CANVAS_DESIGN_GUIDE } from "../src/canvas/ai/scene-tools";
import { compileTeachingScene, teachingSceneSchema } from "../src/canvas/ai/teaching-scene";

const scene = {
  boardId: "board-a",
  direction: "right" as const,
  nodes: [
    { id: "browser", label: "Browser" },
    { id: "server", label: "Server" },
    { id: "cache", label: "Cache", kind: "note" as const },
  ],
  edges: [
    { from: "browser", to: "server", label: "HTTPS" },
    { from: "server", to: "cache" },
  ],
  steps: [
    { title: "Request", highlight: ["browser"] },
    { title: "Lookup", highlight: ["cache"] },
  ],
  reason: "Explain the request path",
};

describe("teaching scene compiler", () => {
  it("accepts a bounded scene and rejects malformed ones", () => {
    expect(teachingSceneSchema.parse(scene)).toMatchObject({ boardId: "board-a", direction: "right" });
    expect(() => teachingSceneSchema.parse({ ...scene, nodes: [scene.nodes[0], scene.nodes[0]] })).toThrow(/unique/i);
    expect(() => teachingSceneSchema.parse({ ...scene, edges: [{ from: "browser", to: "missing" }] })).toThrow(/unknown/i);
    expect(() => teachingSceneSchema.parse({ ...scene, edges: [{ from: "browser", to: "browser" }] })).toThrow(/self/i);
    expect(() => teachingSceneSchema.parse({ ...scene, nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })) })).toThrow();
  });

  it("compiles to a valid proposal batch with deterministic non-overlapping layout", () => {
    const batch = compileTeachingScene(teachingSceneSchema.parse(scene));
    expect(() => canvasActionSchema.parse(batch)).not.toThrow();
    expect(batch.actions.filter((action) => action.kind === "createShape")).toHaveLength(3);
    expect(batch.actions.filter((action) => action.kind === "createArrow")).toHaveLength(2);
    expect(batch.actions.filter((action) => action.kind === "createText")).toHaveLength(2);
    const shapes = batch.actions.filter((action) => action.kind === "createShape");
    expect(shapes.map((action) => action.kind === "createShape" ? action.shape.id : "")).toEqual(["browser", "server", "cache"]);
    const xs = shapes.map((action) => action.kind === "createShape" ? action.shape.x : 0);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(200);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(200);
    const arrow = batch.actions.find((action) => action.kind === "createArrow");
    expect(arrow && arrow.kind === "createArrow" && Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y)).toBeGreaterThan(0);
  });

  it("emits step highlights only for shapes that already exist", () => {
    const without = compileTeachingScene(teachingSceneSchema.parse(scene));
    expect(without.actions.some((action) => action.kind === "highlightShape")).toBe(false);
    const withExisting = compileTeachingScene(teachingSceneSchema.parse(scene), { existingShapeIds: new Set(["browser", "cache"]) });
    expect(withExisting.actions.filter((action) => action.kind === "highlightShape").map((action) => action.kind === "highlightShape" ? action.id : "")).toEqual(["browser", "cache"]);
  });

  it("lays out vertically when direction is down", () => {
    const batch = compileTeachingScene(teachingSceneSchema.parse({ ...scene, direction: "down" }));
    const shapes = batch.actions.filter((action) => action.kind === "createShape");
    const ys = shapes.map((action) => action.kind === "createShape" ? action.shape.y : 0);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(120);
  });

  it("publishes a design guide with layout and annotation rules", () => {
    expect(CANVAS_DESIGN_GUIDE).toContain("Layout");
    expect(CANVAS_DESIGN_GUIDE).toContain("annotations");
    expect(CANVAS_DESIGN_GUIDE.length).toBeGreaterThan(200);
  });
});

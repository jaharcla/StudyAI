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

type Rect = { x: number; y: number; w: number; h: number };
type Proposed = { rect: Rect; group: string };

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function textRect(text: string, x: number, y: number): Rect {
  const lines = text.split("\n");
  return { x, y, w: Math.max(8, ...lines.map((line) => line.length * 22 * 0.62)), h: Math.max(22 * 1.32, lines.length * 22 * 1.32) };
}

function proposedFrom(batch: ReturnType<typeof compileTeachingScene>): Proposed[] {
  return batch.actions.flatMap((action) => {
    if (action.kind === "createShape") {
      if (action.shape.type === "geo") return [{ rect: { x: action.shape.x, y: action.shape.y, w: Number(action.shape.props.w), h: Number(action.shape.props.h) }, group: `node:${action.shape.id}` }];
      if (action.shape.type === "note") return [{ rect: { x: action.shape.x, y: action.shape.y, w: 200, h: Math.max(200, String(action.shape.props.text).split("\n").length * 22 * 1.35 + 40) }, group: `node:${action.shape.id}` }];
    }
    if (action.kind === "createText") return [{ rect: textRect(action.text, action.x, action.y), group: `text:${action.text}` }];
    if (action.kind === "createArrow") {
      const start = action.from, end = action.to;
      const result: Proposed[] = [{ rect: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.max(2, Math.abs(end.x - start.x)), h: Math.max(2, Math.abs(end.y - start.y)) }, group: `arrow:${start.x}:${start.y}` }];
      if (action.label) {
        const label = textRect(action.label, 0, 0);
        result.push({ rect: { x: (start.x + end.x) / 2 - label.w / 2, y: (start.y + end.y) / 2 - label.h / 2, w: label.w, h: label.h }, group: `arrow-label:${action.label}` });
      }
      return result;
    }
    return [];
  });
}

function expectLayoutClear(batch: ReturnType<typeof compileTeachingScene>, existing: readonly Rect[], clearance = 24) {
  const proposed = proposedFrom(batch);
  for (const item of proposed) for (const obstacle of existing) {
    const expanded = { x: item.rect.x - clearance, y: item.rect.y - clearance, w: item.rect.w + clearance * 2, h: item.rect.h + clearance * 2 };
    expect(intersects(expanded, obstacle), `proposed ${item.group} must clear existing object`).toBe(false);
  }
  for (let i = 0; i < proposed.length; i++) for (let j = i + 1; j < proposed.length; j++) {
    if (proposed[i].group === proposed[j].group) continue;
    if (proposed[i].group.startsWith("arrow-label:") || proposed[j].group.startsWith("arrow-label:")) continue;
    if (proposed[i].group.startsWith("arrow:") && proposed[j].group.startsWith("arrow:")) continue;
    expect(intersects(proposed[i].rect, proposed[j].rect), `${proposed[i].group} must not overlap ${proposed[j].group}`).toBe(false);
  }
}

const room = { x: -2000, y: -2000, width: 10000, height: 10000 };
const parsed = teachingSceneSchema.parse(scene);

describe("teaching scene collision-aware placement", () => {
  it("keeps the legacy origin on an empty board", () => {
    const batch = compileTeachingScene(parsed, { placementBounds: room });
    expectLayoutClear(batch, []);
    const first = batch.actions.find((action) => action.kind === "createShape");
    expect(first && first.kind === "createShape" ? first.shape.x : 0).toBe(100);
    expect(first && first.kind === "createShape" ? first.shape.y : 0).toBe(100);
  });

  it("moves the diagram when the starting region is occupied", () => {
    const existing: Rect[] = [{ x: 100, y: 100, w: 600, h: 400 }];
    const batch = compileTeachingScene(parsed, { existingBounds: existing, placementBounds: room });
    expectLayoutClear(batch, existing);
    const first = batch.actions.find((action) => action.kind === "createShape");
    expect(first && first.kind === "createShape" ? first.shape.x : 100).not.toBe(100);
  });

  it("avoids multiple existing objects of different sizes", () => {
    const existing: Rect[] = [
      { x: 100, y: 100, w: 600, h: 400 },
      { x: 900, y: 80, w: 120, h: 300 },
      { x: -300, y: 500, w: 700, h: 90 },
      { x: 2000, y: 2000, w: 40, h: 40 },
    ];
    const batch = compileTeachingScene(parsed, { existingBounds: existing, placementBounds: room });
    expectLayoutClear(batch, existing);
  });

  it("routes around a large existing object", () => {
    const existing: Rect[] = [{ x: -500, y: -500, w: 3000, h: 2000 }];
    const batch = compileTeachingScene(parsed, { existingBounds: existing, placementBounds: room });
    expectLayoutClear(batch, existing);
    const first = batch.actions.find((action) => action.kind === "createShape");
    const y = first && first.kind === "createShape" ? first.shape.y : 0;
    expect(y < -500 || y > 1500).toBe(true);
  });

  it("respects placement bounds near canvas boundaries", () => {
    const bounds = { x: 0, y: 0, width: 1600, height: 1200 };
    const existing: Rect[] = [{ x: 0, y: 0, w: 600, h: 1200 }];
    const batch = compileTeachingScene(parsed, { existingBounds: existing, placementBounds: bounds });
    expectLayoutClear(batch, existing);
    for (const item of proposedFrom(batch)) {
      expect(item.rect.x).toBeGreaterThanOrEqual(bounds.x);
      expect(item.rect.y).toBeGreaterThanOrEqual(bounds.y);
      expect(item.rect.x + item.rect.w).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(item.rect.y + item.rect.h).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it("spaces notes and captions without overlapping proposed shapes in vertical layout", () => {
    const vertical = teachingSceneSchema.parse({
      ...scene,
      direction: "down",
      nodes: [
        { id: "a", label: "First" },
        { id: "b", label: "Second", kind: "note" as const },
        { id: "c", label: "Third", kind: "note" as const },
        { id: "d", label: "Fourth" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "c", to: "d" }],
      steps: [{ title: "Sequence", highlight: ["a"] }],
    });
    const batch = compileTeachingScene(vertical, { placementBounds: room });
    expectLayoutClear(batch, []);
    const notes = batch.actions.filter((action) => action.kind === "createShape" && action.shape.type === "note");
    expect(notes).toHaveLength(2);
    const noteY = notes.map((action) => action.kind === "createShape" ? action.shape.y : 0);
    expect(Math.abs(noteY[1] - noteY[0])).toBeGreaterThanOrEqual(200);
    expect(batch.actions.some((action) => action.kind === "createText")).toBe(true);
  });

  it("keeps arrows clear of existing objects and connected to their nodes", () => {
    const existing: Rect[] = [{ x: 100, y: 40, w: 200, h: 220 }];
    const batch = compileTeachingScene(parsed, { existingBounds: existing, placementBounds: room });
    expectLayoutClear(batch, existing);
    const arrows = batch.actions.filter((action) => action.kind === "createArrow");
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) {
      expect(arrow.kind === "createArrow" && Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y)).toBeGreaterThan(0);
    }
  });

  it("fails with an actionable error and no batch when no region is available", () => {
    const blocked: Rect[] = [{ x: 0, y: 0, w: 500, h: 500 }];
    expect(() => compileTeachingScene(parsed, { existingBounds: blocked, placementBounds: { x: 0, y: 0, width: 500, height: 500 } }))
      .toThrow(/No unoccupied region.*canvas was not changed/i);
  });
});

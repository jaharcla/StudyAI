import { describe, expect, it } from "vitest";
import { Store } from "@quickdrawjs/core";
import { planLayout, objectOccupancy, type LayoutRect } from "../src/canvas/ai/layout";
import { objectBounds } from "../src/canvas/scene";
import type { ScientificObject } from "../src/canvas/model";
import { boardOccupancy, shapeBounds } from "../src/canvas/ai/canvas-context";
import { compileTeachingScene, teachingSceneSchema } from "../src/canvas/ai/teaching-scene";

const viewport: LayoutRect = { x: 0, y: 0, width: 4_000, height: 3_000 };
const intersects = (a: LayoutRect, b: LayoutRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const placed = (result: ReturnType<typeof planLayout>) => result.status === "placed" ? result.placements : [];

describe("board-aware layout planning", () => {
  it("places every request clear of existing content", () => {
    const occupancy = [{ x: 100, y: 100, width: 300, height: 200 }];
    const requests = [
      { id: "a", width: 180, height: 70 },
      { id: "b", width: 180, height: 70 },
      { id: "c", width: 180, height: 70 },
    ];
    const result = planLayout(requests, occupancy, viewport);
    expect(result.status).toBe("placed");
    const rects = placed(result).map((entry) => entry.rect);
    for (const rect of rects) expect(intersects(rect, occupancy[0])).toBe(false);
    for (const left of rects) for (const right of rects) if (left !== right) expect(intersects(left, right)).toBe(false);
    for (const rect of rects) expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
  });

  it("keeps the configured separation, not merely a non-overlap", () => {
    const occupancy = [{ x: 500, y: 0, width: 200, height: 1_000 }];
    const requests = [{ id: "a", width: 100, height: 100 }, { id: "b", width: 100, height: 100 }, { id: "c", width: 100, height: 100 }];
    const rects = [...placed(planLayout(requests, occupancy, viewport, { gap: 60 })).map((entry) => entry.rect), ...occupancy];
    const edgeGap = (a: LayoutRect, b: LayoutRect) => Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), a.y - (b.y + b.height), b.y - (a.y + a.height));
    for (const left of rects) for (const right of rects) if (left !== right) {
      // Padded non-intersection means at least one axis keeps the full clearance.
      expect(edgeGap(left, right), `${left.x},${left.y} vs ${right.x},${right.y}`).toBeGreaterThanOrEqual(60 - 0.001);
    }
  });

  it("is deterministic: identical input yields identical placement", () => {
    const occupancy = [{ x: 80, y: 80, width: 260, height: 140 }, { x: 900, y: 300, width: 120, height: 400 }];
    const requests = [{ id: "a", width: 180, height: 70 }, { id: "b", width: 180, height: 70 }, { id: "c", width: 600, height: 40 }];
    expect(planLayout(requests, occupancy, viewport)).toEqual(planLayout(requests, occupancy, viewport));
  });

  it("places nothing when the board has no room, and says where it would go", () => {
    const crowded = [{ x: 0, y: 0, width: 1_000, height: 800 }];
    const result = planLayout([{ id: "box", width: 180, height: 70 }], crowded, { x: 0, y: 0, width: 900, height: 700 });
    expect(result.status).toBe("conflict");
    expect(placed(result)).toHaveLength(0);
    if (result.status === "conflict") {
      expect(result.reason).toMatch(/no clear/i);
      expect(result.suggestion.width).toBeGreaterThan(0);
    }
  });

  it("stacks downward when asked for column reading order", () => {
    const requests = [{ id: "a", width: 180, height: 70 }, { id: "b", width: 180, height: 70 }];
    const rows = placed(planLayout(requests, [], viewport, { order: "row" }));
    const columns = placed(planLayout(requests, [], viewport, { order: "column" }));
    expect(columns[1].rect.y).toBeGreaterThan(columns[0].rect.y);
    expect(columns[1].rect.x).toBe(columns[0].rect.x);
    expect(rows[1].rect.x).toBeGreaterThan(rows[0].rect.x);
  });

  it("treats ink, text, notes and arrows as real occupied area", () => {
    // Finding that rev 2 could only assume: if a freehand stroke or a label reported no area,
    // placement would sail straight over the student's own drawing.
    const records = [
      { id: "stroke", typeName: "shape" as const, type: "draw" as const, x: 10, y: 20, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5], size: "m" } },
      { id: "label", typeName: "shape" as const, type: "text" as const, x: 300, y: 20, rot: 0, z: 1, props: { text: "F = ma and more words", size: "m", scale: 1 } },
      { id: "note", typeName: "shape" as const, type: "note" as const, x: 600, y: 20, rot: 0, z: 1, props: { text: "sticky", size: "m", scale: 1 } },
      { id: "arrow", typeName: "shape" as const, type: "arrow" as const, x: 900, y: 20, rot: 0, z: 1, props: { dx: 120, dy: -40, bend: 0, size: "m" } },
      { id: "rotated", typeName: "shape" as const, type: "geo" as const, x: 1_200, y: 20, rot: Math.PI / 2, z: 1, props: { geo: "rectangle", w: 40, h: 300 } },
    ];
    for (const record of records) {
      const bounds = shapeBounds(record);
      expect(bounds.w, record.id).toBeGreaterThan(0);
      expect(bounds.h, record.id).toBeGreaterThan(0);
    }
    // The rotated tall rectangle must occupy its rotated extent, not its unrotated width.
    const rotated = shapeBounds(records[4]);
    expect(rotated.w).toBeGreaterThan(200);
  });

  it("rejects a scene that cannot fit rather than stacking it on the student's work", () => {
    const scene = teachingSceneSchema.parse({
      boardId: "board-a",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [{ from: "a", to: "b" }],
      reason: "test",
    });
    expect(() => compileTeachingScene(scene, { occupancy: [{ x: 0, y: 0, width: 200, height: 200 }], viewport: { x: 0, y: 0, width: 180, height: 120 } })).toThrow(/no clear|clear space/i);
  });

  it("compiles a scene onto an occupied board with every shape in clear space", () => {
    const scene = teachingSceneSchema.parse({
      boardId: "board-a",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
      reason: "test",
    });
    const occupancy = [{ x: 0, y: 0, width: 700, height: 260 }];
    const batch = compileTeachingScene(scene, { occupancy, viewport });
    const rects = batch.actions
      .filter((action) => action.kind === "createShape")
      .map((action) => (action.kind === "createShape" ? { x: action.shape.x, y: action.shape.y, width: 180, height: 70 } : null))
      .filter((value): value is LayoutRect => value !== null);
    expect(rects).toHaveLength(3);
    for (const rect of rects) {
      expect(intersects(rect, occupancy[0])).toBe(false);
      for (const other of rects) if (other !== rect) expect(intersects(rect, other)).toBe(false);
    }
  });

  it("reads occupancy from a live store, so the wiring is not a copy of the algorithm", () => {
    // The bug this phase exists to fix was in the teaching-scene caller passing no board state.
    // This asserts the real store-to-occupancy path used by the bridge handler.
    const store = new Store();
    store.put({ id: "stroke", typeName: "shape", type: "draw", x: 10, y: 20, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5], size: "m" } });
    store.put({ id: "label", typeName: "shape", type: "text", x: 200, y: 30, rot: 0, z: 1, props: { text: "normal force", size: "m", scale: 1 } });

    const occupancy = boardOccupancy(store);
    expect(occupancy).toHaveLength(2);
    expect(occupancy.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);

    const scene = teachingSceneSchema.parse({ boardId: "board-a", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [], reason: "test" });
    const batch = compileTeachingScene(scene, { occupancy, viewport });
    for (const action of batch.actions.filter((item) => item.kind === "createShape")) {
      if (action.kind !== "createShape") continue;
      const rect = { x: action.shape.x, y: action.shape.y, width: 180, height: 70 };
      for (const blocked of occupancy) expect(intersects(rect, blocked)).toBe(false);
    }
  });

  it("blocks space for a horizontal force even though its extent on one axis is zero", () => {
    // objectBounds derives a force's area from tail-to-tip, so a flat arrow has height 0.
    // Without the extent floor, placement would happily drop a box straight across the vector.
    const force: ScientificObject = {
      id: "f1", kind: "force", x: 300, y: 400, width: 120, height: 0,
      label: "F", units: "N", components: [12, 0, 0], pointOfApplication: { x: 240, y: 400 },
      geometry: { tail: { x: 240, y: 400 }, tip: { x: 360, y: 400 } },
    };
    expect(objectBounds(force).h).toBe(0);

    const occupancy = objectOccupancy([force]);
    expect(occupancy).toHaveLength(1);
    expect(occupancy[0].height).toBeGreaterThan(0);

    expect(planLayout([{ id: "box", width: 100, height: 40 }], occupancy, { x: 0, y: 300, width: 400, height: 200 }).status).toBe("conflict");
  });

  it("legacy callers that pass no board state still get the original grid", () => {
    const scene = teachingSceneSchema.parse({ boardId: "board-a", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [], reason: "test" });
    const actions = compileTeachingScene(scene).actions.filter((action) => action.kind === "createShape");
    expect(actions.map((action) => action.kind === "createShape" ? [action.shape.x, action.shape.y] : null)).toEqual([[100, 100], [340, 100]]);
  });
});

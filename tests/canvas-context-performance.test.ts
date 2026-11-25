import { describe, expect, it, vi } from "vitest";
import { Store, type ShapeRecord } from "@quickdrawjs/core";
import { buildCanvasAIContext } from "../src/canvas/ai/canvas-context";

const scope = { boardId: "board-a", courseId: "bio-130", lessonId: "cell", revision: 7 };
const shape = (id: string, x: number): ShapeRecord => ({ id, typeName: "shape", type: "geo", x, y: 10, rot: 0, z: 1, props: { geo: "rectangle", w: 20, h: 20, color: "black", size: "m" } });

describe("canvas context performance", () => {
  it("treats sub-pixel camera drift as the same viewport", () => {
    const store = new Store();
    store.put(shape("box", 0));
    const base = { source: store, selectedIds: [], objects: [], scope };
    const left = buildCanvasAIContext({ ...base, viewport: { x: 0.01, y: 0.02, w: 300.03, h: 200.04 } });
    const right = buildCanvasAIContext({ ...base, viewport: { x: 0.04, y: 0.06, w: 300.07, h: 200.09 } });
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  it("does not re-stringify the whole context for every truncation step", () => {
    const store = new Store();
    for (let index = 0; index < 40; index++) store.put(shape(`shape-${index}`, index * 2));
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      const context = buildCanvasAIContext({ source: store, selectedIds: [], viewport: { x: 0, y: 0, w: 400, h: 200 }, objects: [], scope, maxChars: 600 });
      const wholeContextCalls = stringify.mock.calls.filter(([value]) => value !== null && typeof value === "object" && "spatialRelationships" in value);
      expect(wholeContextCalls.length).toBeLessThanOrEqual(3);
      expect(context.truncated).toBe(true);
      expect(JSON.stringify(context).length).toBeLessThanOrEqual(600);
    } finally {
      stringify.mockRestore();
    }
  });
});

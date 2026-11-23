import { describe, expect, it } from "vitest";
import { compareRenders, type RenderSnapshot } from "./render";

const base: RenderSnapshot = {
  objects: [
    { id: "a", x: 10, y: 20, w: 100, h: 50, text: "Start" },
    { id: "b", x: 200, y: 20, w: 100, h: 50, text: "End" },
  ],
  pngSha256: "aaa",
};

describe("compareRenders", () => {
  it("accepts sub-pixel drift without requiring byte-identical PNGs", () => {
    const observed: RenderSnapshot = {
      objects: [
        { id: "a", x: 10.4, y: 20, w: 100, h: 50, text: "Start" },
        { id: "b", x: 200, y: 19.6, w: 100, h: 50, text: "End" },
      ],
      pngSha256: "bbb",
    };
    const m = compareRenders(base, observed, {
      displayedMatchesPersisted: true,
      recoveredAfterReconnect: true,
    });
    expect(m.maxGeometryDrift).toBeCloseTo(0.4, 5);
    expect(m.reproducible).toBe(true);
    expect(m.exportDelta).toBe(1);
    expect(m.missingObjects).toEqual([]);
    expect(m.duplicatedObjects).toEqual([]);
    expect(m.displayedMatchesPersisted).toBe(true);
    expect(m.recoveredAfterReconnect).toBe(true);
  });

  it("flags drift beyond tolerance, missing and duplicated objects", () => {
    const observed: RenderSnapshot = {
      objects: [
        { id: "a", x: 13, y: 20, w: 100, h: 50, text: "Start" },
        { id: "c", x: 200, y: 20, w: 100, h: 50, text: "End" },
        { id: "c", x: 210, y: 20, w: 100, h: 50, text: "End" },
      ],
      pngSha256: "aaa",
    };
    const m = compareRenders(base, observed);
    expect(m.maxGeometryDrift).toBe(3);
    expect(m.reproducible).toBe(false);
    expect(m.missingObjects).toEqual(["b"]);
    expect(m.duplicatedObjects).toEqual(["c"]);
    expect(m.exportDelta).toBe(0);
    expect(m.displayedMatchesPersisted).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { smoothCapturedPressure } from "../src/canvas/pen-input.js";

const trail = (points: Array<[number, number, number]>): number[] => points.flat();

describe("smoothCapturedPressure — feature 1: pressure + velocity smoothing", () => {
  it("keeps coordinates and length, but changes captured pressure (RED: smoothing must differ from raw)", () => {
    const raw = trail([
      [0, 0, 0.2],
      [4, 1, 0.9],
      [9, 3, 0.3],
      [15, 6, 0.8],
      [22, 10, 0.25],
    ]);
    const smoothed = smoothCapturedPressure(raw);
    expect(smoothed).not.toBe(raw);
    expect(smoothed).toHaveLength(raw.length);
    for (let i = 0; i < raw.length; i += 3) {
      expect(smoothed[i]).toBe(raw[i]);
      expect(smoothed[i + 1]).toBe(raw[i + 1]);
      expect(smoothed[i + 2]).toBeGreaterThanOrEqual(0.05);
      expect(smoothed[i + 2]).toBeLessThanOrEqual(1);
      // The first sample has no predecessor, so smoothing starts at i >= 3.
      if (i >= 3) expect(smoothed[i + 2]).not.toBe(raw[i + 2]);
    }
  });

  it("tapers pressure on a fast segment below an otherwise identical slow segment", () => {
    const slow = smoothCapturedPressure(trail([[0, 0, 0.8], [2, 0, 0.8]]));
    const fast = smoothCapturedPressure(trail([[0, 0, 0.8], [80, 0, 0.8]]));
    expect(fast[5]).toBeLessThan(slow[5]);
  });

  it("is deterministic and safe for empty and single-point trails", () => {
    expect(smoothCapturedPressure([])).toEqual([]);
    const single = trail([[3, 7, 0.4]]);
    expect(smoothCapturedPressure(single)).toEqual(single);
    const raw = trail([[0, 0, 0.1], [3, 4, 0.9]]);
    expect(smoothCapturedPressure(raw)).toEqual(smoothCapturedPressure(raw));
  });
});

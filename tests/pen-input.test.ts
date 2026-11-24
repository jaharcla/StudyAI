import { describe, expect, it, vi } from "vitest";
import { PALM_REJECTION_KEY, readPalmRejection, writePalmRejection, smoothCapturedPressure, smoothPenTrail, isScratchOut, isCircle, type PenPoint2D } from "../src/canvas/pen-input.js";

describe("gesture recognition — feature 3", () => {
  const straight: PenPoint2D[] = Array.from({ length: 7 }, (_, i) => ({ x: 100 + i * 20, y: 100 + i * 5 }));
  const scratch: PenPoint2D[] = [
    { x: 100, y: 100 }, { x: 200, y: 105 }, { x: 100, y: 110 }, { x: 200, y: 115 },
    { x: 100, y: 120 }, { x: 200, y: 125 }, { x: 100, y: 130 },
  ];
  const circle: PenPoint2D[] = Array.from({ length: 17 }, (_, i) => ({
    x: 200 + 60 * Math.cos((i * 2 * Math.PI) / 16),
    y: 200 + 60 * Math.sin((i * 2 * Math.PI) / 16),
  }));

  it("distinguishes a scratch-out zigzag from an ordinary straight stroke", () => {
    expect(isScratchOut(straight)).toBe(false);
    expect(isScratchOut(scratch)).toBe(true);
  });

  it("recognises a closed circle and rejects a straight line", () => {
    const found = isCircle(circle);
    expect(found).not.toBeNull();
    expect(found!.center.x).toBeCloseTo(200, 0);
    expect(found!.radius).toBeGreaterThan(40);
    expect(isCircle(straight)).toBeNull();
  });

  it("smooths jitter before classification so a shaky circle still reads as a circle", () => {
    const jittery = circle.map((point, index) => ({ ...point, x: point.x + (index % 2 ? 10 : -10), y: point.y + (index % 3 ? -9 : 9) }));
    expect(isCircle(jittery)).toBeNull();
    expect(isCircle(smoothPenTrail(jittery))).not.toBeNull();
  });
});

describe("palm rejection toggle — feature 2", () => {
  it("defaults to on, which leaves Quickdraw's pen-triggered auto-arm intact for mouse users", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    expect(readPalmRejection()).toBe(true);
  });

  it("persists an opted-out choice and restores it", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    });
    writePalmRejection(false);
    expect(values.get(PALM_REJECTION_KEY)).toBe("off");
    expect(readPalmRejection()).toBe(false);
    writePalmRejection(true);
    expect(readPalmRejection()).toBe(true);
    vi.unstubAllGlobals();
  });
});

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

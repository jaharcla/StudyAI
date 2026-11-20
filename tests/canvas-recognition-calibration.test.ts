import { describe, expect, it } from "vitest";
import {
  calibrationGrid,
  calibrationMargin,
  evaluateThresholdPoint,
  offersCandidate,
  recommendThresholds,
  sweepThresholdGrid,
  type RecognitionCalibrationSample,
} from "../server/canvas-intelligence/recognition/calibration.js";

const sample = (overrides: Partial<RecognitionCalibrationSample>): RecognitionCalibrationSample => ({
  decision: "accept",
  label: "spring",
  topLabel: "spring",
  topProbability: 0.3,
  secondProbability: 0.05,
  ...overrides,
});

const defaults = { minConfidence: 0.18, minMargin: 0.03 };

describe("canvas recognition threshold calibration", () => {
  it("computes margin and applies both thresholds together", () => {
    const clear = sample({ topProbability: 0.3, secondProbability: 0.05 });
    const crowded = sample({ topProbability: 0.3, secondProbability: 0.29 });
    expect(calibrationMargin(clear)).toBeCloseTo(0.25);
    expect(offersCandidate(clear, defaults)).toBe(true);
    expect(offersCandidate(crowded, defaults)).toBe(false);
    expect(offersCandidate({ ...clear, topProbability: 0.1 }, defaults)).toBe(false);
  });

  it("counts accept coverage and correct/reject false offers separately", () => {
    const cell = evaluateThresholdPoint([
      sample({ decision: "accept", topProbability: 0.3, secondProbability: 0.05 }),
      sample({ decision: "accept", topProbability: 0.2, secondProbability: 0.19 }),
      sample({ decision: "correct", label: "arrow", topLabel: "line", topProbability: 0.25, secondProbability: 0.01 }),
      sample({ decision: "reject", label: null, topProbability: 0.1, secondProbability: 0.02 }),
    ], defaults);
    expect(cell).toMatchObject({ positives: 2, offeredPositives: 1, agreements: 1, negatives: 2, offeredNegatives: 1 });
    expect(cell.coverage).toBe(0.5);
    expect(cell.falseOfferRate).toBe(0.5);
    expect(cell.balanced).toBe(0);
  });

  it("sweeps the full grid and refuses to recommend anything without both classes", () => {
    const grid = calibrationGrid();
    expect(grid.confidenceValues).toHaveLength(51);
    expect(grid.marginValues).toHaveLength(21);
    const cells = sweepThresholdGrid([sample({})], grid.confidenceValues, grid.marginValues);
    expect(cells).toHaveLength(51 * 21);
    const recommendation = recommendThresholds([sample({})], cells, defaults);
    expect(recommendation.changed).toBe(false);
    expect(recommendation.reason).toContain("Insufficient decisions");
  });

  it("recommends a higher threshold only when the recorded decisions separate cleanly", () => {
    const samples = [
      ...Array.from({ length: 20 }, () => sample({ decision: "accept", topProbability: 0.35, secondProbability: 0.05 })),
      ...Array.from({ length: 5 }, () => sample({ decision: "reject", label: null, topProbability: 0.3, secondProbability: 0.05 })),
    ];
    const grid = calibrationGrid();
    const cells = sweepThresholdGrid(samples, grid.confidenceValues, grid.marginValues);
    const recommendation = recommendThresholds(samples, cells, defaults);
    expect(recommendation.changed).toBe(true);
    expect(recommendation.current).toMatchObject({ coverage: 1, falseOfferRate: 1 });
    expect(recommendation.best).toMatchObject({ coverage: 1, falseOfferRate: 0 });
    expect(recommendation.best!.minConfidence).toBeGreaterThan(0.3);
    expect(recommendation.best!.minConfidence).toBeLessThanOrEqual(0.35);
  });

  it("keeps the defaults when no grid cell improves on them", () => {
    const samples = [
      ...Array.from({ length: 20 }, () => sample({ decision: "accept", topProbability: 0.4, secondProbability: 0.05 })),
      ...Array.from({ length: 5 }, () => sample({ decision: "reject", label: null, topProbability: 0.1, secondProbability: 0.02 })),
    ];
    const grid = calibrationGrid();
    const cells = sweepThresholdGrid(samples, grid.confidenceValues, grid.marginValues);
    const recommendation = recommendThresholds(samples, cells, defaults);
    expect(recommendation.changed).toBe(false);
    expect(recommendation.current).toMatchObject({ coverage: 1, falseOfferRate: 0 });
    expect(recommendation.reason).toContain("Defaults unchanged");
  });
});

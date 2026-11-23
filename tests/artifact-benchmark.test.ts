import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIOS, WEIGHTS, scoreGeneration } from "../src/artifacts/benchmark";

describe("benchmark dimensions", () => {
  it("uses the owner's six weights summing to 100", () => {
    expect(WEIGHTS).toEqual({ intent: 20, accuracy: 25, grounding: 20, pedagogy: 20, visual: 10, interaction: 5 });
    expect(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it("covers exactly the four spec scenarios", () => {
    expect(SCENARIOS).toEqual([
      "documented request",
      "ambiguous request",
      "multi-component torque package",
      "insufficient source",
    ]);
  });
});

describe("scoreGeneration", () => {
  it("computes the weighted mean when all six labels are present", () => {
    const result = scoreGeneration({ intent: 4, accuracy: 5, grounding: 3, pedagogy: 4, visual: 2, interaction: 5 });
    expect(result.completeness).toBe("complete");
    expect(result.overall).toBe(0.78);
    expect(Object.keys(result.scores)).toHaveLength(6);
  });

  it("withholds an overall score while human labels are missing", () => {
    const result = scoreGeneration({ intent: 4, accuracy: 5, grounding: 3 });
    expect(result.completeness).toBe("pending-human-review");
    expect("overall" in result).toBe(false);
    expect(Object.keys(result.scores)).toEqual(["intent", "accuracy", "grounding"]);
  });
});

describe("committed baseline", () => {
  it("is explicitly pending human review and carries no scores", () => {
    const baseline = JSON.parse(readFileSync("docs/verification/artifact-quality-baseline.json", "utf8")) as Record<string, unknown>;
    expect(baseline.reviewStatus).toBe("pending-human-review");
    expect(baseline).not.toHaveProperty("scores");
    expect(baseline).not.toHaveProperty("overall");
    expect(baseline.weights).toEqual(WEIGHTS);
  });
});

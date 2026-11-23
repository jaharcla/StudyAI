import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCENARIOS, WEIGHTS, scoreGeneration, evaluateQualityGate, type QualityGate } from "../src/artifacts/benchmark";

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

describe("evaluateQualityGate", () => {
  const gate: QualityGate = {
    pedagogyOverallMin: 4,
    pedagogyScenarioMin: 3.5,
    criticalFailureVeto: ["package", "system"],
    determinismRepeats: 5,
    compositeDiagnosticOnly: true,
  };

  it("qualifies four equal-weight scenarios above both floors", () => {
    const result = evaluateQualityGate([
      { name: "a", pedagogy: 4 }, { name: "b", pedagogy: 4.2 },
      { name: "c", pedagogy: 3.9 }, { name: "d", pedagogy: 3.9 },
    ], gate);
    expect(result.eligible).toBe(true);
  });

  it("rejects a weak scenario even when the overall mean clears 4.0", () => {
    const result = evaluateQualityGate([
      { name: "a", pedagogy: 4.4 }, { name: "b", pedagogy: 4.4 },
      { name: "c", pedagogy: 4.3 }, { name: "d", pedagogy: 3.4 },
    ], gate);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("d pedagogy"))).toBe(true);
  });

  it("vetoes critical failures regardless of scores", () => {
    const result = evaluateQualityGate([{ name: "a", pedagogy: 5 }], gate, ["fabricated citation"]);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("fabricated citation"))).toBe(true);
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

  it("binds four recorded generations and keeps identity out of the review sheet", () => {
    const baseline = JSON.parse(readFileSync("docs/verification/artifact-quality-baseline.json", "utf8")) as {
      generations: string; meta: string; reviewSheet: string; legalityRepeats: string; gate: QualityGate;
      scenarios: Array<{ name: string; generationId: string; labels: Record<string, number> }>;
    };
    const records = JSON.parse(readFileSync(baseline.generations, "utf8")) as {
      generations: Array<{ id: string; status: string }>;
    };
    for (const scenario of baseline.scenarios) {
      const record = records.generations.find((item) => item.id === scenario.generationId);
      expect(record).toBeDefined();
      expect(["validated", "insufficient-evidence"]).toContain(record?.status);
      expect(scenario.labels).toEqual({});
    }
    expect(records.generations).toHaveLength(4);
    expect(baseline.gate).toMatchObject({ pedagogyOverallMin: 4, pedagogyScenarioMin: 3.5, determinismRepeats: 5 });
    const legality = JSON.parse(readFileSync(baseline.legalityRepeats, "utf8")) as {
      repeatsRequired: number;
      results: Array<{ status: string }>;
    };
    expect(legality.repeatsRequired).toBe(5);
    expect(legality.results.filter((result) => result.status === "passed")).toHaveLength(3);
    expect(legality.results.filter((result) => result.status === "exempt")).toHaveLength(1);
    expect(readFileSync(baseline.meta, "utf8")).toContain("provider");
    const sheet = readFileSync(baseline.reviewSheet, "utf8");
    expect(sheet).toContain("Pedagogy");
    expect(sheet).not.toMatch(/qwen|ollama|opencode|groq/i);
  });
});

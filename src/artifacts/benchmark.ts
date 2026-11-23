/** Weights are fixed in the binding design spec; they must not be tuned after seeing scores. */
export const WEIGHTS = {
  intent: 20,
  accuracy: 25,
  grounding: 20,
  pedagogy: 20,
  visual: 10,
  interaction: 5,
} as const;

export type Dimension = keyof typeof WEIGHTS;
export type HumanLabels = Partial<Record<Dimension, number>>;
export type ScoreResult = {
  scores: Partial<Record<Dimension, number>>;
  completeness: "complete" | "pending-human-review";
  overall?: number;
};

export const SCENARIOS = [
  "documented request",
  "ambiguous request",
  "multi-component torque package",
  "insufficient source",
] as const;

const DIMENSIONS = Object.keys(WEIGHTS) as Dimension[];

/** Deterministic aggregation only. Human labels are the input; no model rating is generated here. */
export function scoreGeneration(labels: HumanLabels): ScoreResult {
  const scores: Partial<Record<Dimension, number>> = {};
  for (const dimension of DIMENSIONS) {
    const label = labels[dimension];
    if (label === undefined || !Number.isFinite(label)) continue;
    scores[dimension] = Math.min(5, Math.max(0, label)) / 5;
  }
  if (DIMENSIONS.some((dimension) => scores[dimension] === undefined)) {
    return { scores, completeness: "pending-human-review" };
  }
  const weighted = DIMENSIONS.reduce((sum, dimension) => sum + (scores[dimension] ?? 0) * WEIGHTS[dimension], 0);
  return { scores, completeness: "complete", overall: Math.round((weighted / 100) * 1000) / 1000 };
}

export type QualityGate = {
  pedagogyOverallMin: number;
  pedagogyScenarioMin: number;
  criticalFailureVeto: readonly string[];
  determinismRepeats: number;
  compositeDiagnosticOnly: boolean;
};
export type ScenarioScore = { name: string; pedagogy: number };
export type GateResult = { eligible: boolean; reasons: string[] };

/** Held-out prompts are reported but never enter the frozen four-scenario gate. */
export function gateScenarios<T extends { heldOut?: boolean }>(scenarios: readonly T[]): T[] {
  return scenarios.filter((scenario) => !scenario.heldOut);
}

/** Equal-weight scenario averaging with a per-scenario floor and two critical-failure vetoes. */
export function evaluateQualityGate(
  scenarios: readonly ScenarioScore[],
  gate: QualityGate,
  criticalFailures: readonly string[] = [],
): GateResult {
  const reasons: string[] = [];
  if (!scenarios.length) return { eligible: false, reasons: ["No scored scenarios."] };
  const overall = scenarios.reduce((sum, scenario) => sum + scenario.pedagogy, 0) / scenarios.length;
  if (overall < gate.pedagogyOverallMin) reasons.push(`Overall pedagogy ${overall.toFixed(2)} is below ${gate.pedagogyOverallMin}.`);
  for (const scenario of scenarios) {
    if (scenario.pedagogy < gate.pedagogyScenarioMin) reasons.push(`${scenario.name} pedagogy ${scenario.pedagogy.toFixed(2)} is below ${gate.pedagogyScenarioMin}.`);
  }
  for (const failure of criticalFailures) reasons.push(`Critical failure (${failure}) blocks qualification.`);
  return { eligible: reasons.length === 0, reasons };
}

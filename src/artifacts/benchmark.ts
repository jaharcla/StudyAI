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

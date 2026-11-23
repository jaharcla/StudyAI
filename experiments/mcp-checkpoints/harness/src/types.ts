export const SCORECARD_DIMENSIONS = [
  "taskCompletion",
  "semanticAccuracy",
  "visualQuality",
  "editability",
  "contextEfficiency",
  "toolEfficiency",
  "reliability",
  "recognition",
  "provenance",
  "costAndSpeed",
] as const;

export type ScorecardDimension = (typeof SCORECARD_DIMENSIONS)[number];

export type EvidenceRecord = {
  experiment: string;
  phase: number | string;
  kind: string;
  payload: unknown;
  createdAt?: string;
};

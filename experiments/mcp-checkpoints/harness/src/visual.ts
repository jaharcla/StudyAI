import { writeEvidence } from "./evidence";

export type ArtifactTask = {
  id: string;
  kind: string;
  prompt: string;
  expectedObjects: number;
  expectedRelationships: number;
};

export type ArtifactObservation = Partial<Record<string, number>> & {
  objects?: number;
  relationships?: number;
};

export type Rubric = { checks: Array<{ id: string; description?: string }> };

export type DefectCounts = {
  byCheck: Record<string, number>;
  total: number;
  structuralCorrect: boolean;
  stemCorrect: boolean;
};

export type GenerationResult = {
  observation: ArtifactObservation;
  screenshots: string[];
  tokens: number;
  toolCalls: number;
  durationMs: number;
};

export type ArtifactGenerator = (
  task: ArtifactTask,
  phase: "initial" | "corrected"
) => Promise<GenerationResult>;

export type ConditionResult = {
  condition: "A" | "B";
  taskId: string;
  iterations: number;
  defectsBefore: number;
  defectsAfter: number;
  corrected: boolean;
  tokens: number;
  toolCalls: number;
  durationMs: number;
  evidencePaths: string[];
  evidenceFiles: string[];
};

export const DEFAULT_RUBRIC: Rubric = {
  checks: [
    { id: "textTruncation" },
    { id: "overlap" },
    { id: "arrowCrossing" },
    { id: "arrowLabelOverlap" },
    { id: "spacing" },
    { id: "readability" },
    { id: "zoneLabelPlacement" },
    { id: "labelToElementAssociation" },
    { id: "stemSymbolCorrectness" },
    { id: "chemistryBondOrder" },
    { id: "vectorArrowDirection" },
  ],
};

const STEM_CHECKS = [
  "stemSymbolCorrectness",
  "chemistryBondOrder",
  "vectorArrowDirection",
];

export function scoreArtifact(
  result: { task: ArtifactTask; observation: ArtifactObservation },
  rubric: Rubric
): DefectCounts {
  const byCheck: Record<string, number> = {};
  for (const check of rubric.checks) byCheck[check.id] = 0;

  for (const [key, value] of Object.entries(result.observation)) {
    if (key in byCheck && typeof value === "number") byCheck[key] = value;
  }

  const total = Object.values(byCheck).reduce((sum, n) => sum + n, 0);
  const structuralCorrect =
    result.observation.objects === result.task.expectedObjects &&
    result.observation.relationships === result.task.expectedRelationships;
  const stemCorrect = STEM_CHECKS.every((id) => (byCheck[id] ?? 0) === 0);

  return { byCheck, total, structuralCorrect, stemCorrect };
}

export async function runCondition(
  task: ArtifactTask,
  condition: "A" | "B",
  generator: ArtifactGenerator
): Promise<ConditionResult> {
  const phases: Array<"initial" | "corrected"> =
    condition === "B" ? ["initial", "corrected"] : ["initial"];

  const results: GenerationResult[] = [];
  const evidenceFiles: string[] = [];
  for (const phase of phases) {
    const generated = await generator(task, phase);
    results.push(generated);
    const evidence = await writeEvidence({
      experiment: "phase-1-visual",
      phase: 1,
      kind: `${task.id}-${condition}-${phase}`,
      payload: generated,
    });
    evidenceFiles.push(evidence.path);
  }

  const counts = results.map((r) =>
    scoreArtifact({ task, observation: r.observation }, DEFAULT_RUBRIC)
  );

  return {
    condition,
    taskId: task.id,
    iterations: results.length,
    defectsBefore: counts[0].total,
    defectsAfter: counts[counts.length - 1].total,
    corrected:
      condition === "B" &&
      counts[counts.length - 1].total < counts[0].total,
    tokens: results.reduce((sum, r) => sum + r.tokens, 0),
    toolCalls: results.reduce((sum, r) => sum + r.toolCalls, 0),
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    evidencePaths: results.flatMap((r) => r.screenshots),
    evidenceFiles,
  };
}

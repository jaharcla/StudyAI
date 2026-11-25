import type { RetrievalResult } from "./document-intelligence/service.js";

export type TutorEvidenceStatus = "grounded" | "no-evidence" | "dropped";

export type TutorEvidenceContract = {
  version: 1;
  status: TutorEvidenceStatus;
  sourceRefs: string[];
  sourceCount: number;
  courseId: string | null;
};

/** One immutable snapshot of the course evidence available to a single tutor turn. */
export function buildTutorEvidenceContract(input: {
  evidence: RetrievalResult | null;
  dropped: boolean;
  sourceRefs: Iterable<string>;
}): TutorEvidenceContract {
  const sourceRefs = [...new Set(input.sourceRefs)].sort();
  const status: TutorEvidenceStatus = input.dropped
    ? "dropped"
    : input.evidence?.status === "evidence" ? "grounded" : "no-evidence";
  return {
    version: 1,
    status,
    sourceRefs,
    sourceCount: sourceRefs.length,
    courseId: input.evidence?.courseId ?? null,
  };
}

/** Deterministic student-facing notice; never produced by the model. */
export function groundingNotice(contract: TutorEvidenceContract): string | null {
  switch (contract.status) {
    case "grounded": return `Course evidence · ${contract.sourceCount} sources checked`;
    case "no-evidence": return "No course evidence · Not in your course material";
    case "dropped": return "No course evidence · Course excerpts were dropped to fit context. Ask again to retry.";
    default: return null;
  }
}

export function shouldAttachEvidenceContract(exactOutput: boolean, greeting: boolean, retrievalRequested: boolean, refCount: number): boolean {
  if (exactOutput || greeting) return false;
  return retrievalRequested || refCount > 0;
}

/**
 * Shared, view-agnostic contract for the one Coach prompt stream.
 * Pure types and pure helpers only: no React, no storage, no provider, no view setters.
 */

export type CoachDestination = "board" | "study" | "studio";

/** Where activating a prompt takes the student, and what must be prepared there. */
export type CoachTarget = {
  courseId: string;
  lessonId: string;
  destination: CoachDestination;
  /** One of these identifies the concrete prepared state for the destination. */
  boardId?: string | null;
  activityId?: string | null;
  cardId?: string | null;
  conceptId: string | null;
  /** Plain-language reason a student can read; never an internal code. */
  reason: string;
  /** Material focus for Studio preparation, derived from a cited source. */
  focus?: string | null;
};

export type CoachSource = {
  documentId?: string | null;
  title: string;
  page?: number | null;
  excerpt: string;
  sourceRef?: string | null;
};

export type CoachPromptKind = "lab-hint" | "due-task" | "recommendation";

/**
 * One item in the ranked stream. `urgency`, `boardMatch` inputs and `staleness` are numeric so
 * ranking stays deterministic and reproducible from the same local data.
 */
export type CoachPrompt = {
  id: string;
  kind: CoachPromptKind;
  title: string;
  /** Plain-language reason shown as the main line. */
  reason: string;
  /** Preview line shown before Continue: what will be prepared in the destination. */
  preview: string;
  source: CoachSource | null;
  target: CoachTarget;
  /** Higher is more urgent; FSRS due/overdue outranks context and staleness. */
  urgency: number;
  /** Higher means an older underlying signal; used only after urgency and board match. */
  staleness: number;
};

export type CoachContext = {
  courseId: string;
  lessonId: string;
  boardId?: string | null;
  boardRevision?: number;
};

/** What an activation actually achieved, with the exact words the Coach may report. */
export type CoachPreparationResult = { prepared: boolean; message: string };

type StudyAskResponse = {
  status?: string;
  reason?: string;
  nextAction?: { kind?: string; label?: string };
  presentationId?: string;
  questionId?: string;
};

/** Report only what /api/study/ask returned: never claim a loaded question that is absent. */
export function studyPreparationResult(value: StudyAskResponse): CoachPreparationResult {
  if (value.status === "no-reviewed-questions") {
    const next = value.nextAction?.label?.trim();
    return { prepared: false, message: `No reviewed question is ready.${next ? ` Next: ${next}.` : ""}` };
  }
  if (value.presentationId || value.questionId) {
    return { prepared: true, message: "Ready in Study. Your next question is loaded." };
  }
  return { prepared: false, message: "No question was loaded. Ask a reviewed question to begin." };
}

/** A feature registers one of these; it never renders a card or calls a view setter. */
export type CoachProducer = {
  id: string;
  kind: CoachPromptKind;
  produce(context: CoachContext): Promise<CoachPrompt[]>;
};

/** Board hints are dismissed until the board revision changes; other prompts are stable ids. */
export function coachDismissalKey(prompt: CoachPrompt, context: CoachContext): string {
  const revision = prompt.target.destination === "board" ? `:r${context.boardRevision ?? 0}` : "";
  return `${prompt.id}${revision}`;
}

/** Stable identity for dedupe across producers, independent of arrival order. */
export function coachDedupeKey(prompt: CoachPrompt): string {
  if (prompt.target.conceptId) return `concept:${prompt.target.conceptId}`;
  const concrete = prompt.target.boardId ?? prompt.target.activityId ?? prompt.target.cardId ?? prompt.target.lessonId;
  return `${prompt.target.destination}:${concrete}`;
}

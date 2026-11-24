/**
 * Deterministic ranking and selection for the one Coach prompt stream.
 * Features register producers here; the service owns ordering, dedupe and dismissal,
 * and owns no DOM.
 */
import {
  coachDedupeKey,
  coachDismissalKey,
  type CoachContext,
  type CoachProducer,
  type CoachPrompt,
  type CoachPromptKind,
} from "./contract.js";

const producers = new Set<CoachProducer>();

export function registerCoachProducer(producer: CoachProducer): () => void {
  producers.add(producer);
  return () => producers.delete(producer);
}

export function registeredCoachProducers(): readonly CoachProducer[] {
  return [...producers];
}

/** Lab hints beat recommendations when every numeric key is equal. */
const KIND_PRIORITY: Record<CoachPromptKind, number> = {
  "lab-hint": 3,
  "due-task": 2,
  recommendation: 1,
};

function boardMatch(prompt: CoachPrompt, context: CoachContext): number {
  return prompt.target.boardId && prompt.target.boardId === context.boardId ? 1 : 0;
}

/** urgency → current-board match → staleness → lab-hint-before-recommendation → stable id. */
export function rankCoachPrompts(prompts: CoachPrompt[], context: CoachContext): CoachPrompt[] {
  return [...prompts].sort((left, right) =>
    right.urgency - left.urgency ||
    boardMatch(right, context) - boardMatch(left, context) ||
    right.staleness - left.staleness ||
    KIND_PRIORITY[right.kind] - KIND_PRIORITY[left.kind] ||
    left.id.localeCompare(right.id),
  );
}

/** Highest urgency wins a concept/lesson duplicate; identical keys keep the labelled kind first. */
export function dedupeCoachPrompts(prompts: CoachPrompt[], context: CoachContext): CoachPrompt[] {
  const kept = new Map<string, CoachPrompt>();
  for (const prompt of rankCoachPrompts(prompts, context)) {
    const key = coachDedupeKey(prompt);
    if (!kept.has(key)) kept.set(key, prompt);
  }
  return [...kept.values()];
}

export async function collectCoachPrompts(context: CoachContext, dismissed: ReadonlySet<string> = new Set()): Promise<CoachPrompt[]> {
  if (!context.courseId || !context.lessonId) return [];
  const produced: CoachPrompt[] = [];
  for (const producer of producers) {
    try {
      const items = await producer.produce(context);
      for (const item of items) {
        if (item.target.courseId === context.courseId && item.target.lessonId === context.lessonId && !dismissed.has(coachDismissalKey(item, context))) {
          produced.push(item);
        }
      }
    } catch {
      // A failing producer must not blank the stream or block other producers.
    }
  }
  return rankCoachPrompts(dedupeCoachPrompts(produced, context), context);
}

export function selectCoachPrompt(prompts: CoachPrompt[], context: CoachContext): CoachPrompt | null {
  return rankCoachPrompts(prompts, context)[0] ?? null;
}

/**
 * Adapter: the deterministic local recommendation endpoint becomes one CoachProducer.
 * It emits shared-contract prompts with real preparation targets, cited provenance and a
 * plain preview line. It renders nothing and never touches a view setter.
 */
import { API } from "../api.js";
import type { CoachContext, CoachProducer, CoachPrompt, CoachSource, CoachTarget } from "./contract.js";

type EndpointPreparation = {
  cardId?: string | null;
  boardId?: string | null;
  activityId?: string | null;
  dueAt?: string | null;
  focus?: string | null;
  sourceRef?: string | null;
};

type EndpointRecommendation = {
  id: string;
  kind: "review" | "practice" | "relearn" | "canvas" | "start";
  title: string;
  reason: string;
  conceptId: string | null;
  concept: string | null;
  lessonId: string;
  source: { documentId?: string; title: string; page?: number | null; excerpt: string; sourceRef?: string } | null;
  action: { kind: "study" | "canvas" | "studio"; courseId: string; lessonId: string };
  priority: number;
  preparation: EndpointPreparation;
};

const DESTINATION = { study: "study", canvas: "board", studio: "studio" } as const;

function previewFor(item: EndpointRecommendation): string {
  if (item.kind === "review") return "Opens your study session with the next review question ready.";
  if (item.kind === "practice") return `Opens your study session with another question on ${item.concept ?? "this concept"}.`;
  if (item.kind === "relearn") return `Opens the source and a fresh question on ${item.concept ?? "this concept"} in your study session.`;
  if (item.kind === "canvas") return "Reopens this lesson's saved board with the marked activity ready.";
  return `Opens Studio with ${item.source?.title ?? "this lesson's sources"} set as the focus.`;
}

function targetFor(item: EndpointRecommendation, context: CoachContext): CoachTarget {
  const destination = DESTINATION[item.action.kind];
  const focus = item.preparation.focus?.trim() || item.source?.title || null;
  return {
    courseId: item.action.courseId || context.courseId,
    lessonId: item.action.lessonId || context.lessonId,
    destination,
    boardId: destination === "board" ? item.preparation.boardId ?? null : null,
    activityId: destination === "board" ? item.preparation.activityId ?? null : null,
    cardId: destination === "study" ? item.preparation.cardId ?? null : null,
    conceptId: item.conceptId,
    reason: item.reason,
    focus,
  };
}

export function mapRecommendation(item: EndpointRecommendation, context: CoachContext): CoachPrompt {
  const source: CoachSource | null = item.source
    ? {
        documentId: item.source.documentId ?? null,
        title: item.source.title,
        page: item.source.page ?? null,
        excerpt: item.source.excerpt,
        sourceRef: item.preparation.sourceRef ?? item.source.sourceRef ?? null,
      }
    : null;
  const reason = item.reason.trim();
  return {
    id: `recommendation:${item.id}`,
    kind: "recommendation",
    title: item.title,
    reason,
    preview: previewFor(item),
    source,
    target: targetFor(item, context),
    // The server's priority already encodes FSRS due/overdue ahead of weaker signals.
    urgency: Number.isFinite(item.priority) ? item.priority : 0,
    staleness: Math.max(0, 100 - (Number.isFinite(item.priority) ? item.priority : 0)),
  };
}

export const recommendationProducer: CoachProducer = {
  id: "recommendations",
  kind: "recommendation",
  async produce(context) {
    const params = new URLSearchParams({ course: context.courseId, lesson: context.lessonId });
    const response = await fetch(`${API}/recommendations?${params}`);
    if (!response.ok) throw new Error("Recommendations could not be loaded.");
    const body = (await response.json()) as { recommendations?: EndpointRecommendation[] };
    return (body.recommendations ?? []).map((item) => mapRecommendation(item, context));
  },
};

import { API } from "../api.js";
import { mapRecommendation } from "./recommendationProducer.js";
import type { CoachContext, CoachPlanBadge, CoachProducer, CoachPrompt } from "./contract.js";

type EndpointPreparation = {
  cardId?: string | null;
  boardId?: string | null;
  activityId?: string | null;
  dueAt?: string | null;
  focus?: string | null;
  sourceRef?: string | null;
};

type EndpointSource = {
  documentId?: string;
  title: string;
  page?: number | null;
  excerpt: string;
  sourceRef?: string;
} | null;

type EndpointRecommendation = {
  id: string;
  kind: "review" | "practice" | "relearn" | "canvas" | "start";
  title: string;
  reason: string;
  conceptId: string | null;
  concept: string | null;
  lessonId: string;
  source: EndpointSource;
  action: { kind: "study" | "canvas" | "studio"; courseId: string; lessonId: string };
  priority: number;
  preparation: EndpointPreparation;
  day: string;
  grounding: "cited" | "derived";
};

export type DailyPlanResponse = {
  date: string;
  courseId: string;
  lessonId: string;
  items: EndpointRecommendation[];
};

export function mapDailyPlanItem(
  item: EndpointRecommendation,
  plan: DailyPlanResponse,
  context: CoachContext,
): CoachPrompt {
  const mapped = mapRecommendation(item, context);
  const sameDay = plan.items.filter((entry) => entry.day === item.day);
  const badge: CoachPlanBadge = {
    date: plan.date,
    day: item.day,
    step: sameDay.findIndex((entry) => entry.id === item.id) + 1,
    total: sameDay.length,
  };
  const preview =
    item.grounding === "derived" ? `From your activity — ${mapped.preview}` : mapped.preview;
  return {
    ...mapped,
    id: `daily-plan:${plan.date}:${item.id}`,
    preview,
    plan: badge,
  };
}

export const dailyPlanProducer: CoachProducer = {
  id: "daily-plans",
  kind: "recommendation",
  async produce(context) {
    const params = new URLSearchParams({ course: context.courseId, lesson: context.lessonId });
    const response = await fetch(`${API}/daily-plans?${params}`);
    if (!response.ok) throw new Error("Daily plans could not be loaded.");
    const body = (await response.json()) as DailyPlanResponse;
    return body.items.map((item) => mapDailyPlanItem(item, body, context));
  },
};

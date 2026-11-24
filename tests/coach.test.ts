import { afterEach, describe, expect, it, vi } from "vitest";
import { coachDedupeKey, coachDismissalKey, type CoachContext, type CoachPrompt, type CoachProducer } from "../src/coach/contract.js";
import {
  collectCoachPrompts, dedupeCoachPrompts, rankCoachPrompts,
  registerCoachProducer, selectCoachPrompt,
} from "../src/coach/service.js";
import { mapRecommendation, recommendationProducer } from "../src/coach/recommendationProducer.js";
import { mapDailyPlanItem, dailyPlanProducer } from "../src/coach/dailyPlanProducer.js";
import { studyPreparationResult } from "../src/coach/contract.js";

const context: CoachContext = { courseId: "c", lessonId: "l1", boardId: "board1", boardRevision: 2 };

function prompt(overrides: Partial<CoachPrompt> = {}): CoachPrompt {
  return {
    id: "recommendation:review:k1",
    kind: "recommendation",
    title: "Review Cell biology",
    reason: "A review of Cell biology is due.",
    preview: "Opens your study session with the next review question ready.",
    source: { title: "Cell notes", excerpt: "DNA lives in the nucleus." },
    target: { courseId: "c", lessonId: "l1", destination: "study", conceptId: "k1", reason: "A review of Cell biology is due.", cardId: "card1" },
    urgency: 100,
    staleness: 0,
    ...overrides,
  };
}

describe("Coach contract and ranking", () => {
  it("ranks urgency first, then current-board match, then staleness, then lab hint", () => {
    const due = prompt();
    const practice = prompt({ id: "recommendation:practice:k2", urgency: 80 });
    expect(rankCoachPrompts([practice, due], context)[0].id).toBe(due.id);

    const otherBoard = prompt({ id: "recommendation:canvas:k1", target: { courseId: "c", lessonId: "l1", destination: "board", boardId: "board2", conceptId: null, reason: "Rework the board." }, urgency: 90 });
    const thisBoard = prompt({ id: "lab-hint:physics:board1", kind: "lab-hint", target: { courseId: "c", lessonId: "l1", destination: "board", boardId: "board1", conceptId: null, reason: "Check the forces." }, urgency: 90 });
    expect(rankCoachPrompts([otherBoard, thisBoard], context)[0].id).toBe(thisBoard.id);

    const fresh = prompt({ id: "fresh", staleness: 1 });
    const stale = prompt({ id: "stale", staleness: 9 });
    expect(rankCoachPrompts([fresh, stale], context)[0].id).toBe(stale.id);

    const hint = prompt({ id: "hint", kind: "lab-hint" });
    const recommendation = prompt({ id: "recommendation", kind: "recommendation" });
    expect(rankCoachPrompts([recommendation, hint], context)[0].id).toBe(hint.id);
  });

  it("dedupes by concept or target and keeps the highest urgency", () => {
    const low = prompt({ id: "low", urgency: 50 });
    const high = prompt({ id: "high", urgency: 90 });
    expect(coachDedupeKey(low)).toBe(coachDedupeKey(high));
    expect(dedupeCoachPrompts([low, high], context)).toHaveLength(1);
    expect(dedupeCoachPrompts([low, high], context)[0].id).toBe("high");
  });

  it("keys dismissal by board revision for board targets only", () => {
    const board = prompt({ id: "board-hint", target: { courseId: "c", lessonId: "l1", destination: "board", boardId: "board1", conceptId: null, reason: "Rework it." } });
    expect(coachDismissalKey(board, context)).toBe("board-hint:r2");
    expect(coachDismissalKey(board, { ...context, boardRevision: 3 })).toBe("board-hint:r3");
    expect(coachDismissalKey(prompt(), context)).toBe("recommendation:review:k1");
  });

  it("collects only in-scope, undismissed prompts and survives a failing producer", async () => {
    const good: CoachProducer = { id: "good", kind: "recommendation", produce: async () => [prompt(), prompt({ id: "out-of-scope", target: { courseId: "other", lessonId: "l1", destination: "study", conceptId: null, reason: "No" } })] };
    const bad: CoachProducer = { id: "bad", kind: "lab-hint", produce: async () => { throw new Error("producer failed"); } };
    const unregisterGood = registerCoachProducer(good);
    const unregisterBad = registerCoachProducer(bad);
    try {
      expect((await collectCoachPrompts(context)).map((item) => item.id)).toEqual([prompt().id]);
      expect(await collectCoachPrompts(context, new Set([prompt().id]))).toEqual([]);
    } finally {
      unregisterGood();
      unregisterBad();
    }
    expect(await collectCoachPrompts(context)).toEqual([]);
    expect(selectCoachPrompt([], context)).toBeNull();
  });
});

describe("truthful activation messages", () => {
  it("claims a loaded question only when the study endpoint returned one", () => {
    expect(studyPreparationResult({ presentationId: "p1", questionId: "q1" })).toEqual({
      prepared: true, message: "Ready in Study. Your next question is loaded.",
    });
  });

  it("names the real next action when no reviewed question was loaded", () => {
    const result = studyPreparationResult({
      status: "no-reviewed-questions",
      reason: "No reviewed questions for this lesson yet.",
      nextAction: { kind: "author-question", label: "Create a question from course text" },
    });
    expect(result.prepared).toBe(false);
    expect(result.message).toContain("No reviewed question is ready");
    expect(result.message).toContain("Create a question from course text");
    expect(result.message).not.toContain("loaded");
  });

  it("never invents a question for an unrecognised successful response", () => {
    expect(studyPreparationResult({}).prepared).toBe(false);
  });
});

describe("recommendation producer adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  const item = {
    id: "review:k1", kind: "review", title: "Review Cell biology",
    reason: "A review of Cell biology is due.", conceptId: "k1", concept: "Cell biology", lessonId: "l1",
    source: { documentId: "d1", title: "Cell notes", page: 1, excerpt: "DNA lives in the nucleus." },
    action: { kind: "study", courseId: "c", lessonId: "l1" },
    priority: 108,
    preparation: { cardId: "card1", dueAt: "2020-01-01T00:00:00.000Z", focus: "Cell biology" },
  };

  it("maps a study recommendation to a shared-contract prompt with a real target and citation", () => {
    const mapped = mapRecommendation(item as Parameters<typeof mapRecommendation>[0], context);
    expect(mapped).toMatchObject({
      id: "recommendation:review:k1",
      kind: "recommendation",
      reason: "A review of Cell biology is due.",
      urgency: 108,
      target: { courseId: "c", lessonId: "l1", destination: "study", cardId: "card1", conceptId: "k1", focus: "Cell biology" },
      source: { documentId: "d1", title: "Cell notes", excerpt: "DNA lives in the nucleus." },
    });
    expect(mapped.preview).toContain("study session");
    expect(mapped.preview).toContain("review question ready");
  });

  it("maps canvas and studio recommendations to their preparation descriptors", () => {
    const canvas = mapRecommendation({
      ...item, id: "canvas:k2", kind: "canvas", conceptId: null, concept: "Forces",
      action: { kind: "canvas", courseId: "c", lessonId: "l1" },
      preparation: { boardId: "board1", activityId: "act1", focus: "Forces" },
    } as Parameters<typeof mapRecommendation>[0], context);
    expect(canvas.target).toMatchObject({ destination: "board", boardId: "board1", activityId: "act1" });
    expect(canvas.preview).toContain("saved board");

    const studio = mapRecommendation({
      ...item, id: "start:l2", kind: "start", conceptId: null, lessonId: "l2",
      action: { kind: "studio", courseId: "c", lessonId: "l2" },
      preparation: { focus: "intro.txt: The scientific method", sourceRef: "doc:d1" },
    } as Parameters<typeof mapRecommendation>[0], context);
    expect(studio.target).toMatchObject({ destination: "studio", lessonId: "l2", focus: "intro.txt: The scientific method" });
    expect(studio.source?.sourceRef).toBe("doc:d1");
  });

  it("fetches the lesson-scoped endpoint and emits deterministic prompts", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ recommendations: [item] }) })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const first = await recommendationProducer.produce(context);
    const second = await recommendationProducer.produce(context);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledWith("/api/recommendations?course=c&lesson=l1");
  });
});

describe("daily plan producer adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  const item = {
    id: "review:k1", kind: "review", title: "Review Cell biology",
    reason: "A review of Cell biology is due.", conceptId: "k1", concept: "Cell biology", lessonId: "l1",
    source: { documentId: "d1", title: "Cell notes", page: 1, excerpt: "DNA lives in the nucleus." },
    action: { kind: "study", courseId: "c", lessonId: "l1" },
    priority: 108,
    preparation: { cardId: "card1", dueAt: "2020-01-01T00:00:00.000Z", focus: "Cell biology" },
  };
  const dailyItem = (grounding: "cited" | "derived") => ({
    ...item,
    day: "2026-11-24",
    grounding,
  });

  const planResponse = (items: unknown[]) => ({ date: "2026-11-24", courseId: "c", lessonId: "l1", items });

  it("maps a cited item with a plan badge and unchanged citation", () => {
    const mapped = mapDailyPlanItem(dailyItem("cited") as Parameters<typeof mapDailyPlanItem>[0], planResponse([dailyItem("cited"), { ...dailyItem("derived"), id: "practice:k2" }]) as Parameters<typeof mapDailyPlanItem>[1], context);
    expect(mapped.id).toBe("daily-plan:2026-11-24:review:k1");
    expect(mapped.plan).toEqual({ date: "2026-11-24", day: "2026-11-24", step: 1, total: 2 });
    expect(mapped.source).toMatchObject({ title: "Cell notes", excerpt: "DNA lives in the nucleus." });
  });

  it("prefixes derived items and keeps source null", () => {
    const mapped = mapDailyPlanItem({ ...dailyItem("derived"), source: null } as Parameters<typeof mapDailyPlanItem>[0], planResponse([{ ...dailyItem("derived"), source: null, id: "practice:k2" }]) as Parameters<typeof mapDailyPlanItem>[1], context);
    expect(mapped.preview.startsWith("From your activity — ")).toBe(true);
    expect(mapped.source).toBeNull();
  });

  it("fetches the lesson-scoped endpoint and is deterministic", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => planResponse([dailyItem("cited")]) })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const first = await dailyPlanProducer.produce(context);
    const second = await dailyPlanProducer.produce(context);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledWith("/api/daily-plans?course=c&lesson=l1");
  });
});

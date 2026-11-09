import { describe, expect, it } from "vitest";
import { budgetTutorContext, getTutorContextBudget, TutorContextBudgetError } from "../server/tutor-context";

describe("Tutor context budgeting", () => {
  it("preserves validated canvas evidence, uncertainty, source references, and the current question", () => {
    const analysis = {
      boardId: "board-current",
      revisionHash: "rev-current",
      sourceObjectRefs: [{ scope: "quickdraw", id: "shape-17" }],
      observedEvidence: { items: [{ id: "observed-1", sourceIds: ["shape-17"], sourceRef: "source:observed-1", text: "Observed arrow geometry" }] },
      inferredInterpretations: { items: [{ statement: "May indicate force", uncertainty: ["No force label is present."], sourceObjectIds: ["shape-17"] }] },
      uncertainty: ["The diagram does not label the force."],
    };
    const contexts = [
      { description: "StudyAI current workspace and structured canvas metadata", value: { courseId: "course-1", lessonId: "lesson-1" } },
      { description: "StudyAI active scientific canvas objects", value: { objects: [{ id: "shape-17", text: "Arrow" }] } },
      { description: "StudyAI canvas analysis result", value: analysis },
      { description: "optional annotation", value: "discard-me-".repeat(500) },
    ];
    const evidence = { status: "evidence", results: [{ sourceRef: "doc:page:9", excerpt: "Candidate excerpt" }] };
    const conversation = [
      { type: "human", content: "Old question " + "x".repeat(1200) },
      { type: "ai", content: "Old answer" },
      { type: "human", content: "Why is this arrow here?" },
    ];
    const result = budgetTutorContext({ systemInstructions: "Tutor rules remain fixed.", contexts, evidence, conversation, budgetTokens: 350 });
    const serialized = JSON.stringify(result.contexts);
    expect(serialized).toContain("rev-current");
    expect(serialized).toContain("observed-1");
    expect(serialized).toContain("No force label is present.");
    expect(serialized).toContain("shape-17");
    expect(JSON.stringify(result.evidenceJson)).toContain("doc:page:9");
    expect(result.conversation).toEqual([conversation[2]]);
    expect(result.omittedContextCount).toBe(1);
    expect(result.omittedTurnCount).toBe(1);
  });

  it("rejects protected canvas data that cannot fit without pruning", () => {
    expect(() => budgetTutorContext({
      systemInstructions: "Instructions",
      contexts: [{ description: "StudyAI active scientific canvas objects", value: { observed: "x".repeat(5000) } }],
      evidence: { sourceRef: "kept" },
      conversation: [{ type: "human", content: "Question" }],
      budgetTokens: 512,
    })).toThrow(TutorContextBudgetError);
  });

  it("validates the configured context budget", () => {
    expect(getTutorContextBudget({} as NodeJS.ProcessEnv)).toBe(16_384);
    expect(getTutorContextBudget({ TUTOR_CONTEXT_BUDGET: "4096" } as NodeJS.ProcessEnv)).toBe(4096);
    expect(() => getTutorContextBudget({ TUTOR_CONTEXT_BUDGET: "10" } as NodeJS.ProcessEnv)).toThrow(/512 through 131072/);
  });
});

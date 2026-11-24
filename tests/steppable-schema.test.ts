import { describe, expect, it } from "vitest";
import { artifactPackageSchema, exampleStepSchema } from "../src/artifacts/package";
import { artifactBriefSchema } from "../src/canvas/ai/teaching-scene";

const basePackage = {
  schemaVersion: 1 as const,
  id: "pkg-steppable",
  objective: "Worked example on friction",
  courseId: "CHEM-120",
  lessonId: "quantum",
  components: [] as unknown[],
};

const claim = {
  claim: "Friction opposes motion",
  sourceRef: "studyai://document/module-1/text/4?chunk=0",
  excerpt: "Friction opposes the motion",
  relationship: "direct" as const,
};

const threeStates = [
  { id: "setup", narration: "Set up the incline.", reveal: ["question"], highlight: ["question"], claims: [claim] },
  { id: "forces", narration: "Add the three forces.", reveal: ["gravity", "normal", "friction"], highlight: ["friction"] },
  { id: "answer", narration: "State the result.", reveal: ["gravity", "normal", "friction"], highlight: [], focus: "question" },
];

describe("additive step intents on worked examples (Task 1.1)", () => {
  it("legacy worked-example with string steps still parses with no states", () => {
    const pkg = artifactPackageSchema.parse({
      ...basePackage,
      components: [{
        id: "we-legacy",
        sourceRefs: [],
        kind: "worked-example",
        prompt: "Find the net force.",
        steps: ["Identify motion", "Oppose it"],
        answer: "Friction opposes motion.",
      }],
    });
    const component = pkg.components[0];
    expect(component.kind).toBe("worked-example");
    expect(component).not.toHaveProperty("states");
  });

  it("a worked-example with three states round-trips with defaults applied", () => {
    const pkg = artifactPackageSchema.parse({
      ...basePackage,
      components: [{ id: "we-step", sourceRefs: [], kind: "worked-example", prompt: "Find the net force.", steps: ["legacy"], answer: "Result", states: threeStates }],
    });
    const component = pkg.components[0];
    expect(component.kind).toBe("worked-example");
    if (component.kind !== "worked-example") throw new Error("unreachable");
    expect(component.states).toHaveLength(3);
    expect(component.states?.[0].reveal).toEqual(["question"]);
    expect(component.states?.[1].highlight).toEqual(["friction"]);
    expect(component.states?.[2].focus).toBe("question");
    expect(component.states?.[0].claims?.[0].relationship).toBe("direct");
  });

  it("exampleStepSchema is strict about unknown keys", () => {
    expect(() => exampleStepSchema.parse({ id: "s", narration: "n", x: 10 })).toThrow();
  });

  it("rejects more than twelve states and an empty states array", () => {
    const many = Array.from({ length: 13 }, (_, index) => ({ id: `s${index}`, narration: "n", reveal: [], highlight: [] }));
    expect(() => artifactPackageSchema.parse({
      ...basePackage,
      components: [{ id: "we-many", sourceRefs: [], kind: "worked-example", prompt: "p", steps: ["x"], answer: "a", states: many }],
    })).toThrow();
    expect(() => artifactPackageSchema.parse({
      ...basePackage,
      components: [{ id: "we-empty", sourceRefs: [], kind: "worked-example", prompt: "p", steps: ["x"], answer: "a", states: [] }],
    })).toThrow();
  });

  it("the same step intents parse through artifactBriefSchema on a worked-example", () => {
    const brief = artifactBriefSchema.parse({
      boardId: "board-1",
      topic: "friction",
      artifact: {
        kind: "worked-example",
        count: 1,
        prompt: "Find the net force.",
        answer: "Result",
        concepts: [],
        states: threeStates,
      },
      placement: { relation: "clear-area" },
      sourceRefs: [claim.sourceRef],
      reason: "A replayable worked example.",
    });
    expect(brief.artifact.kind).toBe("worked-example");
    if (brief.artifact.kind !== "worked-example") throw new Error("unreachable");
    expect(brief.artifact.states).toHaveLength(3);
  });

  it("an unresolved-conflict claim still parses; labelling happens in review", () => {
    const state = exampleStepSchema.parse({
      id: "conflict",
      narration: "Sources disagree here.",
      reveal: [],
      highlight: [],
      claims: [{ ...claim, relationship: "unresolved-conflict" }],
    });
    expect(state.claims?.[0].relationship).toBe("unresolved-conflict");
  });
});

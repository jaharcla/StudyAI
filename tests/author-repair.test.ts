import { describe, expect, it } from "vitest";
import { artifactBriefSchema, type ArtifactBrief } from "../src/canvas/ai/teaching-scene";
import { briefComponents, briefRepairSignature, buildBriefRepairResult, checkBriefPreserve } from "../src/canvas/ai/author-repair";
import type { ValidationReport } from "../src/artifacts/contracts";

const REF = "studyai://document/module-1/text/4?chunk=0";

const makeBrief = (overrides: Record<string, unknown> = {}): ArtifactBrief => artifactBriefSchema.parse({
  boardId: "b1",
  topic: "friction from module 1",
  artifact: {
    kind: "question",
    count: 1,
    prompt: "Which way does friction act?",
    answer: "Uphill.",
    figure: {
      kind: "freebody",
      title: "Forces on the block",
      forces: [
        { label: "normal", components: [100, 0] },
        { label: "friction", components: [0, 100] },
      ],
    },
  },
  placement: { relation: "clear-area" },
  sourceRefs: [REF],
  reason: "Friction question with a diagram.",
  ...overrides,
});

const failingReport: ValidationReport = {
  ok: false,
  problems: [
    {
      componentId: "force-9f1c2a3b",
      validator: "force-diagram",
      message: "Friction is not parallel to the incline surface.",
      requestedCorrection: "Fix the force component: Friction is not parallel to the incline surface.",
    },
  ],
};

describe("briefComponents", () => {
  it("uses stable brief-level ids instead of generated object ids", () => {
    expect(briefComponents(makeBrief()).map((component) => component.id)).toEqual(["figure", "question"]);
  });

  it("gives each problem-set item its own id", () => {
    const brief = makeBrief({
      artifact: {
        kind: "problem-set",
        count: 2,
        prompt: "Forces",
        items: [{ prompt: "First?" }, { prompt: "Second?" }],
      },
    });
    expect(briefComponents(brief).map((component) => component.id)).toEqual(["item-1", "item-2"]);
  });
});

describe("briefRepairSignature", () => {
  it("stays the same when only the figure changes", () => {
    const original = makeBrief();
    const repaired = makeBrief({
      artifact: {
        ...original.artifact,
        figure: { kind: "freebody", title: "Forces", forces: [{ label: "normal", components: [3, 5] }] },
      },
    });
    expect(briefRepairSignature(repaired)).toBe(briefRepairSignature(original));
  });

  it("changes when the question text or a citation changes", () => {
    const original = makeBrief();
    expect(briefRepairSignature(makeBrief({ topic: "different topic" }))).not.toBe(briefRepairSignature(original));
    expect(briefRepairSignature(makeBrief({ sourceRefs: ["studyai://document/module-1/text/5?chunk=0"] }))).not.toBe(briefRepairSignature(original));
    expect(briefRepairSignature(makeBrief({
      artifact: { ...original.artifact, prompt: "Different question?" },
    }))).not.toBe(briefRepairSignature(original));
  });
});

describe("buildBriefRepairResult", () => {
  it("maps a force problem to the brief figure and preserves the question and citation", () => {
    const result = buildBriefRepairResult(makeBrief(), failingReport);
    expect(result.status).toBe("needs_repair");
    if (result.status !== "needs_repair") return;
    expect(result.messages[0]?.componentId).toBe("figure");
    expect(result.preserve.componentIds).toEqual(["question"]);
    expect(result.preserve.sourceRefs).toEqual([REF]);
    expect(result.text).toContain("requestedCorrection");
    expect(result.text).not.toMatch(/doc_|sess_|chunk_/);
  });
});

describe("checkBriefPreserve", () => {
  const preserve = (() => {
    const result = buildBriefRepairResult(makeBrief(), failingReport);
    if (result.status !== "needs_repair") throw new Error("expected needs_repair");
    return result.preserve;
  })();

  it("rejects a changed question prompt", () => {
    const original = makeBrief();
    const changed = makeBrief({ artifact: { ...original.artifact, prompt: "Different question?" } });
    const check = checkBriefPreserve(original, changed, preserve);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.changed).toContain("question");
  });

  it("rejects a changed citation", () => {
    const original = makeBrief();
    const changed = makeBrief({ sourceRefs: ["studyai://document/module-1/text/5?chunk=0"] });
    expect(checkBriefPreserve(original, changed, preserve).ok).toBe(false);
  });

  it("accepts a changed figure", () => {
    const original = makeBrief();
    const changed = makeBrief({
      artifact: {
        ...original.artifact,
        figure: { kind: "freebody", title: "Forces", forces: [{ label: "normal", components: [3, 5] }] },
      },
    });
    expect(checkBriefPreserve(original, changed, preserve)).toEqual({ ok: true });
  });
});

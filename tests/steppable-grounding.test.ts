import { describe, expect, it } from "vitest";
import { parseArtifactPackage } from "../src/artifacts/package";
import { reviewCompiledStates, reviewProvenance } from "../src/artifacts/provenance";
import { compileArtifactBrief, type ArtifactBrief } from "../src/canvas/ai/teaching-scene";
import { proposeArtifactBrief } from "../src/canvas/tutor";

const REF = "studyai://document/module-1/text/4?chunk=0";
const OTHER_REF = "studyai://document/module-1/text/4?chunk=9";
const chunks = [{ ref: REF, text: "Friction opposes the motion down the slope." }];

const claim = (excerpt: string, relationship: "direct" | "interpretation" | "extension" | "unresolved-conflict" = "direct", sourceRef = REF) => ({
  claim: `Claim: ${excerpt}`, sourceRef, excerpt, relationship,
});

const state = (overrides: Record<string, unknown> = {}) => ({
  id: "grounded", narration: "Add gravity.", reveal: ["question"], highlight: [], ...overrides,
});

const pkgWithStateClaim = (stateClaims: unknown[]) => ({
  schemaVersion: 1 as const, id: "ground-pkg", objective: "Friction", courseId: "c1", lessonId: "l1",
  components: [{
    id: "we", kind: "worked-example", prompt: "Find the net force.", steps: ["legacy"], answer: "Result",
    sourceRefs: [REF], states: [state({ claims: stateClaims })],
  }],
});

const workedBrief = (states: ArtifactBrief["artifact"]["states"]): ArtifactBrief => ({
  boardId: "board-1", topic: "friction from module 1",
  artifact: {
    kind: "worked-example", count: 1, prompt: "Draw the three forces.",
    answer: "Friction opposes the motion down the slope.", concepts: ["friction"],
    states,
    figure: { kind: "freebody", title: "Forces", forces: [{ label: "gravity", components: [0, -9.8] }] },
  },
  placement: { relation: "clear-area" }, sourceRefs: [REF], reason: "A replayable worked example.",
} as ArtifactBrief);

describe("steppable grounding (claim gates on every replay state)", () => {
  it("parse rejects a state claim whose ref was not retrieved", () => {
    expect(() => parseArtifactPackage(pkgWithStateClaim([claim("Friction opposes", "direct", OTHER_REF)]), [REF]))
      .toThrow(/was not retrieved/);
  });

  it("parse rejects a direct state claim with no literal excerpt containment", () => {
    expect(() => parseArtifactPackage(pkgWithStateClaim([claim("Friction always acts uphill")]), [REF], chunks))
      .toThrow(/containment/);
  });

  it("parse accepts an honest direct state claim with containment", () => {
    const pkg = parseArtifactPackage(pkgWithStateClaim([claim("Friction opposes the motion")]), [REF], chunks);
    expect(pkg.components[0].kind).toBe("worked-example");
  });

  it("reviewProvenance downgrades a non-contained direct state claim and blocks an unresolved conflict", () => {
    const pkg = parseArtifactPackage(pkgWithStateClaim([
      claim("Friction opposes the motion"),
      claim("Friction always acts uphill"),
      claim("Sources disagree", "unresolved-conflict"),
    ]), [REF]);
    const reviews = reviewProvenance(pkg, chunks);
    expect(reviews.map((review) => review.outcome)).toEqual(["verified", "needs-review", "needs-review"]);
    expect(reviews[1]?.reason).toMatch(/containment/);
    expect(reviews[2]?.reason).toMatch(/conflict/);
  });

  it("compiling carries authored claims onto states and labels no-claim states as view", () => {
    const compiled = compileArtifactBrief(workedBrief([
      state({ claims: [claim("Friction opposes the motion")] }),
      state({ id: "checkpoint", reveal: ["question", "gravity"] }),
    ]));
    expect(compiled.states?.[0]?.claims).toHaveLength(1);
    expect(compiled.states?.[0]?.claims[0]).toMatchObject({ relationship: "direct", sourceRef: REF });
    expect(compiled.states?.[0]?.kind).toBe("evidence");
    expect(compiled.states?.[1]?.claims).toEqual([]);
    expect(compiled.states?.[1]?.kind).toBe("view");
  });

  it("a brief with a state claim ref outside retrieved refs is rejected", () => {
    const bad = workedBrief([state({ claims: [claim("x", "direct", OTHER_REF)], reveal: ["question", "gravity"] })]);
    expect(() => proposeArtifactBrief({ boardId: "board-1", courseId: "c1", lessonId: "l1", revision: 3, objects: [] }, bad))
      .toThrow(/State claim sourceRef .* was not retrieved/);
  });

  it("reviewCompiledStates applies the same gates to compiled replay states", () => {
    const compiled = compileArtifactBrief(workedBrief([
      state({ claims: [claim("Friction opposes the motion"), claim("Uphill", "interpretation")] }),
      state({ id: "checkpoint", reveal: ["question", "gravity"] }),
    ]));
    const reviews = reviewCompiledStates(compiled.states ?? [], chunks);
    expect(reviews.map((review) => review.outcome)).toEqual(["verified", "needs-review"]);
    expect(reviews.every((review) => review.relationship !== undefined)).toBe(true);
  });

  it("proposeArtifactBrief preserves state claims and labels without touching revision", () => {
    const states = [state({ claims: [claim("Friction opposes the motion")] }), state({ id: "checkpoint", reveal: ["question", "gravity"] })];
    const proposal = proposeArtifactBrief({ boardId: "board-1", courseId: "c1", lessonId: "l1", revision: 3, objects: [] }, workedBrief(states));
    expect(proposal.states?.map((item) => item.kind)).toEqual(["evidence", "view"]);
    expect(proposal.states?.[0]?.claims).toHaveLength(1);
    expect(proposal.baseRevision).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { mergeDelta } from "../server/canvas-reasoning/state.js";
import type { CanvasReasoningClaimDraft, CanvasReasoningDelta, CanvasReasoningState } from "../server/canvas-reasoning/types.js";

const allowed = new Set(["shape-1", "shape-2"]);

function blankState(over: Partial<CanvasReasoningState> = {}): CanvasReasoningState {
  return {
    schemaVersion: 1,
    boardId: "board-1",
    revisionHash: "revision-1",
    question: "What is drawn?",
    entities: [],
    claims: [],
    contradictions: [],
    unresolved: [],
    coveredChunks: [],
    calls: 0,
    ...over,
  };
}

function blankDelta(over: Partial<CanvasReasoningDelta> = {}): CanvasReasoningDelta {
  return { coveredChunkId: "chunk-1", entitiesToAdd: [], claimsToAdd: [], contradictions: [], unresolved: [], confidence: 0.8, ...over };
}

function draft(over: Partial<CanvasReasoningClaimDraft> = {}): CanvasReasoningClaimDraft {
  return { subject: "molecule", relation: "is", object: "right side", value: "benzene", status: "observed", confidence: 0.8, evidence: ["shape-1"], ...over };
}

describe("mergeDelta", () => {
  it("keeps both claims and records one contradiction when values differ", () => {
    const merged = mergeDelta(blankState(), blankDelta({ claimsToAdd: [draft({ value: "benzene" }), draft({ value: "cyclohexane" })] }), allowed);

    expect(merged.claims).toHaveLength(2);
    expect(merged.claims.every((claim) => claim.status === "contradicted")).toBe(true);
    expect(merged.contradictions).toHaveLength(1);
    expect([...merged.contradictions[0].claimIds].sort()).toEqual(merged.claims.map((claim) => claim.id).sort());
    expect(merged.contradictions[0].reason.length).toBeGreaterThan(0);
  });

  it("does not record a contradiction when only the object differs", () => {
    const merged = mergeDelta(blankState(), blankDelta({ claimsToAdd: [draft({ object: "left", value: "benzene" }), draft({ object: "right", value: "benzene" })] }), allowed);

    expect(merged.claims).toHaveLength(2);
    expect(merged.contradictions).toHaveLength(0);
  });

  it("drops claims and entities citing sources outside the chunk", () => {
    const merged = mergeDelta(
      blankState(),
      blankDelta({
        claimsToAdd: [draft({ evidence: ["ghost-shape"] }), draft({ evidence: ["shape-1", "ghost-shape"] })],
        entitiesToAdd: [{ label: "H", kind: "atom", regionId: "chunk-1", evidence: ["ghost-shape"] }],
      }),
      allowed,
    );

    expect(merged.claims).toHaveLength(0);
    expect(merged.entities).toHaveLength(0);
  });

  it("drops claims with no evidence", () => {
    const merged = mergeDelta(blankState(), blankDelta({ claimsToAdd: [draft({ evidence: [] })] }), allowed);

    expect(merged.claims).toHaveLength(0);
  });

  it("deduplicates entities and claims by normalized key", () => {
    const merged = mergeDelta(
      blankState(),
      blankDelta({
        claimsToAdd: [
          draft({ subject: "  Molecule ", relation: "IS", value: "Benzene." }),
          draft({ subject: "molecule", relation: "is", value: "benzene" }),
        ],
        entitiesToAdd: [
          { label: " Benzene ", kind: "molecule", regionId: "chunk-1", evidence: ["shape-1"] },
          { label: "benzene", kind: "MOLECULE", regionId: "chunk-1", evidence: ["shape-2"] },
        ],
      }),
      allowed,
    );

    expect(merged.claims).toHaveLength(1);
    expect(merged.entities).toHaveLength(1);
    expect(merged.entities[0].evidence.sort()).toEqual(["shape-1", "shape-2"]);
  });

  it("trims the lowest-confidence claims when the cap is exceeded", () => {
    const claims = Array.from({ length: 205 }, (_, index) => draft({ object: `atom-${index}`, confidence: index / 1000 }));

    const merged = mergeDelta(blankState(), blankDelta({ claimsToAdd: claims }), allowed);

    expect(merged.claims).toHaveLength(200);
    const keptObjects = new Set(merged.claims.map((claim) => claim.object));
    expect(keptObjects.has("atom-0")).toBe(false);
    expect(keptObjects.has("atom-204")).toBe(true);
  });

  it("is idempotent for identical deltas", () => {
    const delta = blankDelta({
      claimsToAdd: [draft({ value: "benzene" }), draft({ value: "cyclohexane" })],
      entitiesToAdd: [{ label: "C", kind: "atom", regionId: "chunk-1", evidence: ["shape-1"] }],
      unresolved: [{ question: "How many hydrogens?", relatedIds: ["shape-1"] }],
    });

    const once = mergeDelta(blankState(), delta, allowed);
    const twice = mergeDelta(once, delta, allowed);

    expect(twice).toEqual(once);
    expect(twice.coveredChunks).toEqual(["chunk-1"]);
  });
});

import { describe, expect, it } from "vitest";
import { runReasoningPass, type ReasoningCall } from "../server/canvas-reasoning/service.js";
import { mergeDelta } from "../server/canvas-reasoning/state.js";
import type { CanvasChunk, CanvasReasoningState } from "../server/canvas-reasoning/types.js";

const chunk: CanvasChunk = {
  id: "chunk-1",
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  sourceIds: ["shape-1", "shape-2"],
  labels: ["molecule", "H2O"],
  detail: JSON.stringify([{ id: "shape-1", type: "text", text: "H2O" }]),
};

const state: CanvasReasoningState = {
  schemaVersion: 1,
  boardId: "board-1",
  revisionHash: "revision-1",
  question: "What molecule is drawn?",
  entities: [],
  claims: [
    { id: "clm_prior", subject: "molecule", relation: "is", object: "left", value: "CO2", status: "observed", confidence: 0.6, evidence: ["shape-2"] },
  ],
  contradictions: [],
  unresolved: [],
  coveredChunks: [],
  calls: 0,
};

const validDelta = {
  coveredChunkId: "chunk-1",
  entitiesToAdd: [{ label: "H", kind: "atom", regionId: "chunk-1", evidence: ["shape-1"] }],
  claimsToAdd: [{ subject: "molecule", relation: "is", object: "right", value: "H2O", status: "observed", confidence: 0.9, evidence: ["shape-1"] }],
  contradictions: [],
  unresolved: [{ question: "How many hydrogens?", relatedIds: ["shape-1"] }],
  confidence: 0.9,
};

const allowed = new Set(chunk.sourceIds);

describe("runReasoningPass", () => {
  it("returns a validated delta that merges into the state", async () => {
    const call: ReasoningCall = async () => validDelta;

    const result = await runReasoningPass({ state, chunk, call });
    const merged = mergeDelta(state, result.delta, allowed);

    expect(result.callCount).toBe(1);
    expect(merged.entities).toHaveLength(1);
    expect(merged.claims.some((claim) => claim.value === "H2O")).toBe(true);
    expect(merged.coveredChunks).toContain("chunk-1");
    expect(merged.unresolved).toHaveLength(1);
  });

  it("parses JSON wrapped in a code fence", async () => {
    const call: ReasoningCall = async () => `here you go\n\`\`\`json\n${JSON.stringify(validDelta)}\n\`\`\``;

    const result = await runReasoningPass({ state, chunk, call });

    expect(result.delta.claimsToAdd).toHaveLength(1);
  });

  it("retries once on a malformed response, then throws", async () => {
    let calls = 0;
    const call: ReasoningCall = async () => {
      calls++;
      return "not json at all";
    };

    await expect(runReasoningPass({ state, chunk, call })).rejects.toThrow(/could not be parsed/i);
    expect(calls).toBe(2);
  });

  it("recovers when the repair retry returns valid JSON", async () => {
    let calls = 0;
    const call: ReasoningCall = async () => {
      calls++;
      return calls === 1 ? "nope" : validDelta;
    };

    const result = await runReasoningPass({ state, chunk, call });

    expect(result.callCount).toBe(2);
    expect(result.delta.claimsToAdd).toHaveLength(1);
  });

  it("rejects only the entities and claims citing unknown sources", async () => {
    const call: ReasoningCall = async () => ({
      ...validDelta,
      entitiesToAdd: [
        { label: "H", kind: "atom", regionId: "chunk-1", evidence: ["ghost"] },
        { label: "O", kind: "atom", regionId: "chunk-1", evidence: ["shape-2"] },
      ],
      claimsToAdd: [
        { subject: "molecule", relation: "is", object: "right", value: "H2O", status: "observed", confidence: 0.9, evidence: ["ghost"] },
        { subject: "molecule", relation: "has", object: "O", value: "1", status: "observed", confidence: 0.8, evidence: ["shape-2"] },
      ],
    });

    const result = await runReasoningPass({ state, chunk, call });

    expect(result.delta.entitiesToAdd.map((entity) => entity.label)).toEqual(["O"]);
    expect(result.delta.claimsToAdd.map((claim) => claim.relation)).toEqual(["has"]);
  });

  it("owns the covered chunk id regardless of what the model returns", async () => {
    const call: ReasoningCall = async () => ({ ...validDelta, coveredChunkId: "chunk-elsewhere" });

    const result = await runReasoningPass({ state, chunk, call });

    expect(result.delta.coveredChunkId).toBe("chunk-1");
  });

  it("sends the current claims, the source ids, and the rules", async () => {
    const seen: Array<{ system: string; prompt: string }> = [];
    const call: ReasoningCall = async (input) => {
      seen.push(input);
      return validDelta;
    };

    await runReasoningPass({ state, chunk, call });

    expect(seen).toHaveLength(1);
    expect(seen[0].prompt).toContain("shape-1");
    expect(seen[0].prompt).toContain("shape-2");
    expect(seen[0].prompt).toContain("CO2");
    expect(seen[0].system).toMatch(/only json/i);
    expect(seen[0].system).toMatch(/absence/i);
  });

  it("refuses to call with an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const call: ReasoningCall = async () => {
      calls++;
      return validDelta;
    };

    await expect(runReasoningPass({ state, chunk, call, signal: controller.signal })).rejects.toThrow(/aborted/i);
    expect(calls).toBe(0);
  });
});

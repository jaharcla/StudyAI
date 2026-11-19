import { describe, expect, it } from "vitest";
import {
  MAX_SCENE_EXPERIMENT_REQUESTS,
  buildSceneSourcePayload,
  buildStrokeCandidates,
  createSceneRequestBudget,
  exactBase64ByteLength,
  scoreStrokeGroups,
  validateSceneProposal,
} from "../server/canvas-intelligence/scene-experiment.js";
import type { CanvasInput } from "../server/canvas-intelligence/types.js";

function input(): CanvasInput {
  return {
    boardId: "test-board",
    selectedIds: [],
    revision: "test-revision",
    scientificObjects: [],
    relationships: [],
    nativeRecords: [
      { id: "stroke-a", type: "draw", bounds: { x: 10, y: 20, width: 8, height: 12 }, geometry: { kind: "stroke", points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 18, y: 32, pressure: 0.7 }] }, raw: { id: "stroke-a", typeName: "shape", type: "draw", x: 10, y: 20, rot: 0, props: { pts: [0, 0, 0.5, 8, 12, 0.7] } } },
      { id: "text-a", type: "text", bounds: { x: 30, y: 20, width: 16, height: 20 }, geometry: { kind: "text", width: 16, height: 20 }, text: "C", raw: { id: "text-a", typeName: "shape", type: "text", x: 30, y: 20, rot: 0, props: { text: "C", size: "m" } } },
    ],
  };
}

describe("isolated whole-board scene experiment", () => {
  it("preserves source ink without adding timestamps or exposing text values", () => {
    const payload = buildSceneSourcePayload(input());
    expect(payload.strokes).toEqual([{ id: "stroke-a", type: "draw", x: 10, y: 20, rotation: 0, points: [0, 0, 0.5, 8, 12, 0.7] }]);
    expect(payload.objects).toEqual([{ id: "text-a", type: "text", x: 30, y: 20, rotation: 0, bounds: { x: 30, y: 20, width: 16, height: 20 }, boundsBasis: "normalized-layout", geometry: { kind: "text" } }]);
    expect(JSON.stringify(payload)).not.toMatch(/timestamp|"text":"C"|"confidence"/i);
  });

  it("creates deterministic candidates backed by existing source stroke IDs", () => {
    const candidates = buildStrokeCandidates(input());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: "candidate-001", sourceIds: ["stroke-a"], features: { strokeCount: 1, pointCount: 2 } });
    expect(candidates[0].features.strokes[0]).toMatchObject({ sourceId: "stroke-a", start: { x: 10, y: 20 }, end: { x: 18, y: 32 } });
  });

  it("rejects invented coordinates and confidence while reporting fabricated evidence references", () => {
    const proposal = {
      observations: [{ text: "C", kind: "symbol", status: "proposed", evidenceRefs: [{ kind: "source-object", id: "made-up" }] }],
      relations: [],
      interpretations: [],
      ambiguities: [],
    };
    const result = validateSceneProposal(proposal, new Set(["stroke-a"]), new Set(), new Set());
    expect(result.proposal.observations[0].evidenceRefs).toEqual([]);
    expect(result.rejectedReferences).toEqual([{ kind: "source-object", id: "made-up" }]);
    expect(() => validateSceneProposal({ ...proposal, coordinates: [{ x: 1, y: 2 }] }, new Set(), new Set(), new Set())).toThrow();
    expect(() => validateSceneProposal({ ...proposal, observations: [{ ...proposal.observations[0], confidence: 0.99 }] }, new Set(), new Set(), new Set())).toThrow();
  });

  it("scores grouping correctness separately from valid source-ID resolution", () => {
    const score = scoreStrokeGroups(
      [
        { id: "candidate-001", sourceIds: ["a1", "a2", "b1"] },
        { id: "candidate-002", sourceIds: ["b2"] },
        { id: "candidate-003", sourceIds: ["unrecognized-id"] },
      ],
      [
        { id: "label-a", sourceIds: ["a1", "a2"] },
        { id: "arrow-b", sourceIds: ["b1", "b2"] },
      ],
      new Set(["a1", "a2", "b1", "b2"]),
    );
    expect(score).toMatchObject({ goldObjectCount: 2, candidateCount: 3, completeObjectRecall: 0.5, falseMergeCount: 1, splitObjectCount: 1, exactGroupMatchCount: 0, invalidSourceReferenceCount: 1, sourceIdResolutionPrecision: 0.8 });
  });

  it("enforces the experiment-wide provider request ceiling", async () => {
    expect(MAX_SCENE_EXPERIMENT_REQUESTS).toBe(8);
    const budget = createSceneRequestBudget(8, async () => Response.json({ usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }));
    const fetcher = budget.fetcherFor("B");
    for (let i = 0; i < 8; i++) await fetcher("https://example.invalid", { method: "POST", body: "{}" });
    await expect(fetcher("https://example.invalid", { method: "POST", body: "{}" })).rejects.toThrow(/budget/i);
    expect(budget.attempts).toBe(8);
    expect(budget.records).toHaveLength(8);
    expect(budget.records[0]).toMatchObject({ condition: "B", promptTokens: 2, completionTokens: 1, totalTokens: 3, status: 200 });
  });

  it("counts padded base64 image bytes exactly", () => {
    expect(exactBase64ByteLength("AQIDBA==")).toBe(4);
    expect(exactBase64ByteLength("data:image/png;base64,AQIDBA==")).toBe(4);
  });
});

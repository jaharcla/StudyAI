import { describe, expect, it } from "vitest";
import { allowedEvidenceForCondition } from "../server/canvas-intelligence/scene-experiment.js";
import { evaluateScenePredictions } from "./experiments/whole-board-scene/evaluation.js";

const gold = {
  sourceHash: "test-source",
  textItems: [
    { id: "h-top", text: "H", kind: "symbol", sourceIds: ["ht-1", "ht-2"] },
    { id: "carbon", text: "C", kind: "symbol", sourceIds: ["c-1"] },
    { id: "h-left", text: "H", kind: "symbol", sourceIds: ["hl-1", "hl-2"] },
  ],
  relations: [
    { id: "bond-top", from: "h-top", to: "carbon", relation: "bond", evidenceIds: ["bond-top-ink"], state: "clear" },
    { id: "bond-left", from: "h-left", to: "carbon", relation: "bond", evidenceIds: ["bond-left-ink"], state: "uncertain" },
  ],
  strokeGroups: [
    { id: "h-top", sourceIds: ["ht-1", "ht-2"], state: "clear" },
    { id: "carbon", sourceIds: ["c-1"], state: "clear" },
    { id: "h-left", sourceIds: ["hl-1", "hl-2"], state: "clear" },
    { id: "bond-top", sourceIds: ["bond-top-ink"], state: "clear" },
    { id: "bond-left", sourceIds: ["bond-left-ink"], state: "clear" },
  ],
} as const;

describe("whole-board experiment evaluation", () => {
  it("separates transcription from exact spatial grounding and ambiguity", () => {
    const result = evaluateScenePredictions({
      condition: "D",
      gold,
      knownStrokeIds: new Set(["ht-1", "ht-2", "c-1", "hl-1", "hl-2", "bond-top-ink", "bond-left-ink"]),
      candidateSources: new Map([["candidate-broad", ["ht-1", "ht-2", "c-1", "hl-1", "hl-2"]]]),
      prediction: {
        observations: [
          { text: "H", kind: "symbol", status: "proposed", evidenceRefs: [{ kind: "stroke", id: "ht-1" }, { kind: "stroke", id: "ht-2" }] },
          { text: "C", kind: "symbol", status: "proposed", evidenceRefs: [{ kind: "stroke", id: "c-1" }] },
          { text: "H", kind: "symbol", status: "proposed", evidenceRefs: [{ kind: "candidate", id: "candidate-broad" }] },
        ],
        relations: [
          { from: 0, to: 1, relation: "single bond", status: "proposed", evidenceRefs: [{ kind: "stroke", id: "bond-top-ink" }] },
          { from: 2, to: 1, relation: "bond", status: "ambiguous", evidenceRefs: [{ kind: "stroke", id: "bond-left-ink" }] },
        ],
        interpretations: [],
        ambiguities: ["The left bond is not clearly attached."],
      },
    });

    expect(result.recognition).toMatchObject({ truePositive: 3, falsePositive: 0, falseNegative: 0, precision: 1, recall: 1 });
    expect(result.spatialAssociation).toMatchObject({ precise: 2, ambiguous: 1 });
    expect(result.relations).toMatchObject({ clearTruePositives: 1, ambiguousAcknowledged: 1, falseAssociations: 0 });
    expect(result.sourceStrokeGrounding.precision).toBeLessThan(1);
  });

  it("does not treat image-only claims as source-grounded", () => {
    const result = evaluateScenePredictions({
      condition: "B",
      gold,
      knownStrokeIds: new Set(["ht-1", "ht-2", "c-1", "hl-1", "hl-2", "bond-top-ink", "bond-left-ink"]),
      candidateSources: new Map(),
      prediction: {
        observations: [{ text: "C", kind: "symbol", status: "proposed", evidenceRefs: [] }],
        relations: [],
        interpretations: [],
        ambiguities: [],
      },
    });
    expect(result.sourceStrokeGrounding).toMatchObject({ status: "not-available", precision: null, recall: null });
    expect(result.spatialAssociation).toMatchObject({ unlocalized: 1, precision: null });
  });

  it("does not use an unrelated top-left ambiguity to qualify the target formula", () => {
    const result = evaluateScenePredictions({
      condition: "D",
      gold: { ...gold, expectedFormula: { formula: "CH4", status: "conditional-on-left-connector", reason: "The left connector is uncertain." } },
      knownStrokeIds: new Set(["ht-1", "ht-2", "c-1", "hl-1", "hl-2", "bond-top-ink", "bond-left-ink"]),
      candidateSources: new Map(),
      prediction: {
        observations: [
          { text: "H", kind: "symbol", status: "proposed", evidenceRefs: [] },
          { text: "C", kind: "symbol", status: "proposed", evidenceRefs: [] },
        ],
        relations: [],
        interpretations: [{ claim: "The drawing shows methane (CH4).", status: "proposed", evidenceRefs: [] }],
        ambiguities: ["The top-left sketch contains a potentially ambiguous C-C triple bond."],
      },
    });

    expect(result.scientificInterpretation.formulaMentioned).toBe(true);
    expect(result.scientificInterpretation.formulaConditionallyQualified).toBe(false);
  });

  it("allows only references included by each controlled condition", () => {
    const source = { strokes: [{ id: "stroke-1", type: "draw" as const, x: 0, y: 0, rotation: 0, points: [0, 0, 1] }], objects: [{ id: "object-1", type: "line", x: 0, y: 0, rotation: 0 }], rejectedStrokeIds: [] };
    const candidates = [{ id: "candidate-001", sourceIds: ["stroke-1"], worldBounds: { x: 0, y: 0, width: 1, height: 1 }, features: { strokeCount: 1, pointCount: 1, totalPathLength: 0, aspectRatio: 1, strokes: [] } }];
    const b = allowedEvidenceForCondition("B", source, candidates), c = allowedEvidenceForCondition("C", source, candidates), d = allowedEvidenceForCondition("D", source, candidates);
    expect([...b.strokeIds]).toEqual([]);
    expect([...b.sourceObjectIds]).toEqual([]);
    expect([...b.candidateIds]).toEqual([]);
    expect([...c.strokeIds]).toEqual(["stroke-1"]);
    expect([...c.sourceObjectIds]).toEqual(["object-1"]);
    expect([...c.candidateIds]).toEqual([]);
    expect([...d.strokeIds]).toEqual(["stroke-1"]);
    expect([...d.sourceObjectIds]).toEqual(["object-1"]);
    expect([...d.candidateIds]).toEqual(["candidate-001"]);
  });
});

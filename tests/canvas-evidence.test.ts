import { describe, expect, it } from "vitest";
import { buildCanvasEvidence, selectCanvasContext, SelectedCanvasContextSchema, type CanvasEvidenceBundle } from "../server/canvas-intelligence/evidence.js";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { associateOCRLabels } from "../server/canvas-intelligence/regions.js";
import { OCRResultSchema, StructureResultSchema } from "../server/canvas-intelligence/types.js";

const emptyStructure = () => StructureResultSchema.parse({ objects: [], relationships: [], observations: [], ambiguities: [] });
const emptyOCR = () => OCRResultSchema.parse({ items: [], uncertain: false, raw: "" });
const input = (extra: Array<Record<string, unknown>> = []) => normalizeCanvasInput({
  boardId: "board", courseId: "CHEM", lessonId: "forces",
  snapshot: { document: { store: { ink: { id: "ink", type: "draw", x: 4, y: 4, width: 10, height: 10 } } } },
  scientificObjects: [{ id: "f", kind: "force", x: 40, y: 0, width: 30, height: 24, label: "F", value: 5, unit: "N" }, ...extra],
});
const ocrText = (text: string, options: Record<string, unknown> = {}) => OCRResultSchema.parse({
  items: [{ text, kind: "equation", confidence: 0.95, alternatives: [], sourceIds: ["ink"], imageRegion: { x: 40, y: 0, width: 15, height: 12 }, worldRegion: { x: 40, y: 0, width: 15, height: 12 }, sourceRegionId: null, locationPrecision: "item", uncertain: false, ...options }],
  uncertain: false, raw: text,
});
const bundle = (value = input(), ocr = emptyOCR(), structure = emptyStructure()) =>
  buildCanvasEvidence(value, ocr, structure, associateOCRLabels(value, ocr));

describe("canvas evidence normalization", () => {
  it("preserves known native quantities and geometry as observations, not truth of the user's intent", () => {
    const result = bundle();
    expect(result.scope).toMatchObject({ boardId: "board", courseId: "CHEM", lessonId: "forces" });
    expect(result.scope.revisionHash).toHaveLength(64);
    expect(result.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ origin: "native", subjectId: "f", claimKey: "quantity:f", claimValue: "5 n", confidence: 1 })]));
    expect(result.evidence.filter((e) => e.origin === "geometry").length).toBeGreaterThan(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("records contradictory OCR quantity and exact native value without selecting a winner", () => {
    const value = input(), ocr = ocrText("F = 50 N");
    const associations = associateOCRLabels(value, ocr);
    expect(associations[0]).toMatchObject({ status: "geometry-supported", candidateIds: ["f"] });
    const result = buildCanvasEvidence(value, ocr, emptyStructure(), associations);
    const conflict = result.conflicts.find((c) => c.claimKey === "quantity:f");
    expect(conflict).toMatchObject({ subjectId: "f", values: ["5 n", "50 n"], resolution: "unresolved" });
    expect(result.evidence.filter((e) => conflict!.evidenceIds.includes(e.id)).map((e) => e.origin).sort()).toEqual(["native", "ocr"]);
  });

  it("does not assign a crop without precise association as a fact about an object", () => {
    const value = input();
    const ocr = ocrText("F = 50 N", { locationPrecision: "region", worldRegion: null, imageRegion: null, confidence: null, uncertain: true });
    const result = bundle(value, ocr);
    expect(result.conflicts).toHaveLength(0);
    expect(result.evidence.find((e) => e.origin === "ocr")).toMatchObject({ subjectId: null, claimKey: null, uncertain: true, confidence: null });
  });

  it("labels model predictions as model claims even when the model claims a geometry basis", () => {
    const structure = StructureResultSchema.parse({
      objects: [{ id: "f", kind: "force", label: "gravity", sourceIds: ["f"], confidence: 0.99, basis: "native" }],
      relationships: [], observations: [{ description: "Probably points up", sourceIds: ["f"], confidence: 0.99, basis: "geometry" }],
      ambiguities: ["Direction might be wrong"],
    });
    const result = bundle(input(), emptyOCR(), structure);
    expect(result.evidence.filter((e) => e.origin === "model").every((e) => e.uncertain)).toBe(true);
    expect(result.conflicts.some((c) => c.claimKey === "label")).toBe(true);
    expect(result.warnings).toContain("Structure ambiguity: Direction might be wrong");
  });

  it("rejects hallucinated object references and strips unverified OCR source IDs", () => {
    const structure = StructureResultSchema.parse({
      objects: [{ id: "made-up", kind: "atom", label: "N", sourceIds: ["made-up"], confidence: 1, basis: "native" }],
      relationships: [], observations: [], ambiguities: [],
    });
    const ocr = ocrText("Fn", { sourceIds: ["ink", "invalid-shape"], confidence: null });
    const result = bundle(input(), ocr, structure);
    expect(result.warnings).toContain("Rejected model object with unknown canvas ID.");
    expect(result.evidence.some((e) => e.sourceIds.includes("invalid-shape") || e.sourceIds.includes("made-up"))).toBe(false);
    expect(result.evidence.find((e) => e.origin === "ocr")?.uncertaintyReasons).toContain("Unrecognized source IDs omitted");
  });

  it("preserves selected objects and both sides of conflicts under pruning", () => {
    const value = input(Array.from({ length: 40 }, (_, i) => ({ id: `irrelevant-${i}`, kind: "graph", x: 2000 + i * 10, y: 0, width: 8, height: 8 })));
    const ocr = ocrText("F = 50 N");
    const whole = bundle(value, ocr);
    const context = selectCanvasContext(whole, { question: "What is the magnitude of F?", selectedIds: ["f"], expectedRevisionHash: value.revision, maxChars: 7200 });
    const c = context.conflicts.find((x) => x.claimKey === "quantity:f");
    expect(c).toBeDefined();
    expect(c!.evidenceIds.every((id) => context.evidence.some((e) => e.id === id))).toBe(true);
    expect(context.evidence.some((e) => e.subjectId === "f" && e.origin === "native")).toBe(true);
    expect(context.truncated).toBe(true);
    expect(context.excludedEvidenceCount).toBeGreaterThan(0);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(7200);
    expect(SelectedCanvasContextSchema.parse(context)).toEqual(context);
    expect(whole.evidence.length).toBeGreaterThan(context.evidence.length);
  });

  it("fails safely rather than silently omitting critical evidence or accepting stale context", () => {
    const value = input(), whole = bundle(value, ocrText("F = 50 N"));
    expect(() => selectCanvasContext(whole, { question: "F", expectedRevisionHash: "older-revision", maxChars: 10_000 })).toThrow(/Stale canvas evidence/);
    expect(() => selectCanvasContext(whole, { question: "F", selectedIds: ["f"], maxChars: 350 })).toThrow(/budget/);
    expect(whole.evidence.every((e) => e.revisionHash === value.revision)).toBe(true);
  });

  it("uses scientific question terms and creates deterministic selection", () => {
    const value = input([{ id: "other", kind: "vector", x: 300, y: 50, width: 10, height: 10 }]);
    const whole: CanvasEvidenceBundle = bundle(value, ocrText("F = 5 N"));
    const a = selectCanvasContext(whole, { question: "F", maxChars: 3200 });
    const b = selectCanvasContext(whole, { question: "F", maxChars: 3200 });
    expect(a).toEqual(b);
    expect(a.scope.revisionHash).toBe(value.revision);
  });
});

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createCanvasAnalysisResult } from "../server/canvas-analysis/contract.js";
import { buildCanvasEvidence, selectCanvasContext } from "../server/canvas-intelligence/evidence.js";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { BaselineCanvasRecognitionAdapter, strokeGeometryFeatures } from "../server/canvas-intelligence/recognition/baseline.js";
import { warmClipRuntime } from "../server/canvas-intelligence/recognition/clip.js";
import { recognizeCanvasStrokes } from "../server/canvas-intelligence/recognition/index.js";
import { renderStrokeGroupPng, strokeGroupSvg } from "../server/canvas-intelligence/recognition/render.js";
import { initializeCanvasRecognitionSchema, listCanvasRecognitionPrototypes } from "../server/canvas-intelligence/recognition/store.js";
import { CanvasRecognitionResultSchema, type CanvasRecognitionAdapter, type CanvasRecognitionStage } from "../server/canvas-intelligence/recognition/types.js";
import { OCRResultSchema, StructureResultSchema } from "../server/canvas-intelligence/types.js";

const linePoints = Array.from({ length: 12 }, (_, index) => ({ x: index * 10, y: 0 }));
const circlePoints = Array.from({ length: 24 }, (_, index) => ({ x: Math.cos(index / 24 * Math.PI * 2) * 40, y: Math.sin(index / 24 * Math.PI * 2) * 40 }));

function snapshotWithStroke() {
  return { document: { store: {
    "stroke-line": { id: "stroke-line", typeName: "shape", type: "draw", x: 0, y: 0, rot: 0, z: 0, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 80, 0, 0.5, 120, 0, 0.5], size: "m" } },
    "stroke-circle": { id: "stroke-circle", typeName: "shape", type: "draw", x: 300, y: 0, rot: 0, z: 0, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5, 0, 40, 0.5, 0, 0, 0.5], size: "m" } },
  } } };
}

function canvasInput() {
  return normalizeCanvasInput({ boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", snapshot: snapshotWithStroke(), scientificObjects: [] });
}

describe("canvas recognition renderer", () => {
  it("renders deterministically and keeps a square canvas", async () => {
    const first = await renderStrokeGroupPng([linePoints]);
    const second = await renderStrokeGroupPng([linePoints]);
    expect(first.svg).toBe(second.svg);
    expect(first.pngBase64).toBe(second.pngBase64);
    expect(first.width).toBe(224);
    expect(first.height).toBe(224);
    expect(first.pngBase64.length).toBeGreaterThan(100);
  });

  it("renders an empty group without throwing and a single point as a dot", async () => {
    const empty = strokeGroupSvg([]);
    expect(empty).toContain("<rect");
    const dot = strokeGroupSvg([[{ x: 4, y: 5 }]]);
    expect(dot).toContain("<circle");
  });
});

describe("deterministic baseline recognition", () => {
  it("classifies a straight line and a closed loop", async () => {
    const adapter = new BaselineCanvasRecognitionAdapter();
    const [line, circle] = await adapter.recognize([
      { groupId: "g:line", sourceIds: ["line"], bounds: { x: 0, y: 0, width: 120, height: 1 }, points: linePoints, strokes: [linePoints] },
      { groupId: "g:circle", sourceIds: ["circle"], bounds: { x: -40, y: -40, width: 80, height: 80 }, points: circlePoints, strokes: [circlePoints] },
    ]);
    expect(line.candidates[0].label).toBe("line");
    expect(circle.candidates[0].label).toBe("circle");
    expect(line.uncertain).toBe(true);
    expect(line.candidates.length).toBeLessThanOrEqual(2);
  });

  it("computes inspectable geometry features", () => {
    const features = strokeGeometryFeatures(linePoints);
    expect(features.aspect).toBeGreaterThan(4);
    expect(features.closed).toBe(false);
    expect(features.pathLength).toBeCloseTo(110, 5);
  });

  it("rejects malformed recognition results", () => {
    expect(() => CanvasRecognitionResultSchema.parse({ groupId: "g", sourceIds: [], bounds: { x: 0, y: 0, width: 1, height: 1 }, candidates: [], uncertain: true, uncertaintyReasons: [], extra: true })).toThrow();
  });
});

describe("CLIP warmup", () => {
  it("stays off unless CANVAS_CLIP_WARMUP is exactly 1", async () => {
    await expect(warmClipRuntime({})).resolves.toBe(false);
    await expect(warmClipRuntime({ CANVAS_CLIP_WARMUP: "0" })).resolves.toBe(false);
    await expect(warmClipRuntime({ CANVAS_CLIP_WARMUP: "true" })).resolves.toBe(false);
  });
});

describe("recognition stage orchestration", () => {
  it("recognizes stroke groups from a persisted snapshot", async () => {
    const stage = await recognizeCanvasStrokes(canvasInput(), { mode: "baseline" });
    expect(stage).not.toBeNull();
    expect(stage!.mode).toBe("baseline");
    expect(stage!.results.length).toBeGreaterThan(0);
    expect(stage!.results[0].sourceIds.length).toBeGreaterThan(0);
  });

  it("uses an injected adapter and falls back to baseline on failure", async () => {
    const injected: CanvasRecognitionAdapter = {
      id: "fake", version: "1",
      async recognize(inputs) {
        return inputs.map((input) => CanvasRecognitionResultSchema.parse({ groupId: input.groupId, sourceIds: input.sourceIds, bounds: input.bounds, candidates: [{ label: "triangle", kind: "shape", confidence: 0.9, alternatives: [] }], uncertain: true, uncertaintyReasons: ["fake"] }));
      },
    };
    const stage = await recognizeCanvasStrokes(canvasInput(), { mode: "clip", adapter: injected });
    expect(stage!.adapterId).toBe("fake");
    expect(stage!.results[0].candidates[0].label).toBe("triangle");

    const failing: CanvasRecognitionAdapter = { id: "fail", version: "1", async recognize() { throw new Error("boom"); } };
    const fallback = await recognizeCanvasStrokes(canvasInput(), { mode: "clip", adapter: failing });
    expect(fallback!.mode).toBe("baseline");
    expect(fallback!.warnings.join(" ")).toContain("boom");
    expect(fallback!.results.length).toBeGreaterThan(0);
  });
});

describe("recognition evidence", () => {
  it("adds unconfirmed recognition observations without dropping source IDs", () => {
    const stage: CanvasRecognitionStage = {
      mode: "baseline", adapterId: "geometry-baseline", adapterVersion: "1",
      results: [{ groupId: "g:1", sourceIds: ["stroke-line"], bounds: { x: 0, y: 0, width: 120, height: 1 }, candidates: [{ label: "line", kind: "shape", confidence: 0.6, alternatives: ["underline"] }], uncertain: true, uncertaintyReasons: ["Geometry-only symbol candidate; not a semantic label."] }],
      warnings: [], latencyMs: 1, groupsConsidered: 1, groupsRecognized: 1,
    };
    const bundle = buildCanvasEvidence(canvasInput(), OCRResultSchema.parse({ items: [], uncertain: false, raw: "" }), StructureResultSchema.parse({ objects: [], relationships: [], observations: [], ambiguities: [] }), [], stage);
    const evidence = bundle.evidence.find((item) => item.origin === "recognition");
    expect(evidence).toBeTruthy();
    expect(evidence!.sourceIds).toEqual(["stroke-line"]);
    expect(evidence!.uncertain).toBe(true);
    expect(evidence!.text).toContain("line");
  });

  it("binds recognition evidence to its own provenance stage", () => {
    const input = canvasInput();
    const stage: CanvasRecognitionStage = {
      mode: "clip", adapterId: "clip-vit-b32", adapterVersion: "1",
      results: [{ groupId: "g:1", sourceIds: ["stroke-line"], bounds: { x: 0, y: 0, width: 120, height: 1 }, candidates: [{ label: "line", kind: "shape", confidence: 0.6, alternatives: [] }], uncertain: true, uncertaintyReasons: ["Uncalibrated."] }],
      warnings: [], latencyMs: 1, groupsConsidered: 1, groupsRecognized: 1,
    };
    const structure = StructureResultSchema.parse({ objects: [], relationships: [], observations: [], ambiguities: [] });
    const ocr = OCRResultSchema.parse({ items: [], uncertain: false, raw: "" });
    const evidence = buildCanvasEvidence(input, ocr, structure, [], stage);
    const selectedContext = selectCanvasContext(evidence, { question: "What is drawn?", expectedRevisionHash: input.revision, maxChars: 100_000, nativeRecords: input.nativeRecords, scientificObjects: [] });
    const createdAt = "2026-11-18T12:00:00.000Z";
    const provenance = ["canvas", "geometry", "ocr", "recognition", "structure", "fusion"].map((name) => ({ id: `prov-${name}`, stage: name, provider: name === "recognition" ? "local" : "system", method: "test", model: name === "recognition" ? "clip-vit-b32" : null, createdAt }));
    const result = createCanvasAnalysisResult({
      board: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", revision: 1, document: { version: 1, snapshot: snapshotWithStroke(), objects: [] } },
      canvasInput: input,
      evidence,
      selectedContext,
      pipelineResult: { schemaVersion: 1, fixtureId: "fixture-1", pipelineId: "P1", pipelineVersion: "test", status: "complete", objects: [], relationships: [], interpretations: [], provenance, uncertainties: [], errors: [] },
    });
    const recognition = result.observedEvidence.items.find((item) => item.origin === "recognition");
    expect(recognition?.provenanceIds).toEqual(["prov-recognition"]);
  });
});

describe("prototype store", () => {
  it("returns only valid embeddings for a course", () => {
    const db = new Database(":memory:");
    initializeCanvasRecognitionSchema(db);
    const valid = Array.from({ length: 512 }, () => 0.01);
    db.prepare("INSERT INTO canvas_recognition_examples(id,course_id,label,embedding) VALUES(?,?,?,?)").run("a", "course-1", "force arrow", JSON.stringify(valid));
    db.prepare("INSERT INTO canvas_recognition_examples(id,course_id,label,embedding) VALUES(?,?,?,?)").run("b", "course-1", "broken", "{not-json");
    db.prepare("INSERT INTO canvas_recognition_examples(id,course_id,label,embedding) VALUES(?,?,?,?)").run("c", "course-2", "other", JSON.stringify(valid));
    db.prepare("INSERT INTO canvas_recognition_examples(id,course_id,label,embedding) VALUES(?,?,?,?)").run("d", "course-1", "force arrow", JSON.stringify(Array.from({ length: 100 }, () => 0.01)));
    const prototypes = listCanvasRecognitionPrototypes(db, "course-1");
    expect(Object.keys(prototypes)).toEqual(["force arrow"]);
    expect(prototypes["force arrow"][0]).toHaveLength(512);
    db.close();
  });
});

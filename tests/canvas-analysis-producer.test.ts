import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { z } from "zod";
import { buildCanvasEvidence, selectCanvasContext } from "../server/canvas-intelligence/evidence.js";
import { geometryObservations, normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { associateOCRLabels, groupQuickdrawStrokes } from "../server/canvas-intelligence/regions.js";
import { CANVAS_OCR_DEFAULT_PADDING, canvasOCRRegionTransform, planCanvasOCRCrops } from "../src/canvas/ocr-regions.js";
import { FusionResultSchema, OCRResultSchema, StructureResultSchema } from "../server/canvas-intelligence/types.js";
import { CanvasAnalysisValidationError, currentCanvasRevision, validateCanvasAnalysisForBoard } from "../server/canvas-analysis/contract.js";
import { createCanvasAnalysisProducerHandler, produceCanvasAnalysisForPersistedBoard, type CanvasAnalysisRequest } from "../server/canvas-analysis/producer.js";
import type { UnderstandCanvasArgs } from "../server/canvas-intelligence/service.js";

const snapshot = { document: { store: {
  "shape-1": { id: "shape-1", type: "arrow", x: 0, y: 0, width: 20, height: 20, geometry: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } } },
} } };
const vector = { id: "vector-1", kind: "vector", x: 10, y: 10, width: 20, height: 20, components: [10, 0, 0], units: "N", label: "F" };
const document = { version: 1, snapshot, objects: [vector] };
const board = { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", revision: 7, document: JSON.stringify(document) };
const scope = { boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId };
const request = (): CanvasAnalysisRequest => ({ expectedRevision: board.revision, document: structuredClone(document), selectedIds: ["shape-1"], image: { base64: "aW1hZ2U=", mimeType: "image/png" } });

const database = new Database(":memory:");
database.exec("CREATE TABLE lessons(id TEXT,course_id TEXT,PRIMARY KEY(course_id,id)); CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT);");
beforeEach(() => {
  database.prepare("INSERT OR REPLACE INTO lessons(id,course_id) VALUES(?,?)").run(board.lessonId, board.courseId);
  database.prepare("INSERT OR REPLACE INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run(board.boardId, board.courseId, board.lessonId, board.revision, board.document);
});
afterAll(() => database.close());

function cropFixture() {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.write("IHDR", 12, "ascii"); png.writeUInt32BE(72, 16); png.writeUInt32BE(64, 20);
  const cropDocument = structuredClone(document);
  (cropDocument.snapshot.document.store as Record<string, unknown>)["ink-1"] = { id: "ink-1", type: "draw", x: 10, y: 20, width: 12, height: 8 };
  database.prepare("UPDATE canvases SET document=? WHERE id=?").run(JSON.stringify(cropDocument), board.boardId);
  const payload = request();
  payload.document = cropDocument;
  payload.image = { regions: [{
    id: "stroke-group:ink-1", base64: png.toString("base64"), mimeType: "image/png",
    worldBounds: { x: 10, y: 20, width: 12, height: 8 }, cropBounds: { x: -2, y: 8, width: 36, height: 32 },
    sourceIds: ["ink-1"], pixelWidth: 72, pixelHeight: 64,
    pixelToWorld: { scaleX: 0.5, scaleY: 0.5, offsetX: -2, offsetY: 8 },
  }] };
  return { payload, cropDocument };
}

function deterministicAnalyze() {
  const calls = vi.fn(async (args: UnderstandCanvasArgs) => {
    const input = normalizeCanvasInput(args);
    const ocr = OCRResultSchema.parse({ items: [], uncertain: false, raw: "" });
    const structure = StructureResultSchema.parse({ objects: [], relationships: [], observations: geometryObservations(input), ambiguities: [] });
    const associations = associateOCRLabels(input, ocr);
    const evidence = buildCanvasEvidence(input, ocr, structure, associations);
    const selectedContext = selectCanvasContext(evidence, { question: args.userQuestion, selectedIds: args.selectedIds, expectedRevisionHash: input.revision, maxChars: 100_000, nativeRecords: input.nativeRecords, scientificObjects: input.scientificObjects });
    const fusion = FusionResultSchema.parse({ answer: "The board contains a persisted arrow and vector.", objects: [], relationships: [], associations: [], uncertainties: ["The intended relationship is uncertain."] });
    return { mode: "deep" as const, revision: input.revision, structure, fusion, evidence, selectedContext, latencyMs: { total: 8, structure: 3, fusion: 5 }, cached: [] };
  });
  return calls;
}

describe("persisted canvas analysis producer", () => {
  it("uses the authoritative document, adapts existing evidence, and preserves observed versus inferred data", async () => {
    const analyze = deterministicAnalyze();
    const result = await produceCanvasAnalysisForPersistedBoard(database, scope, request(), { analyze, now: () => new Date("2026-11-08T17:00:00.000Z") });
    const args = analyze.mock.calls[0][0];
    expect(args.snapshot).toEqual(snapshot);
    expect(args.mode).toBe("deep");
    expect(args.image?.base64).toBe("aW1hZ2U=");
    expect(result).toMatchObject({ boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId, revision: board.revision, revisionHash: currentCanvasRevision(board).revisionHash, analysisStatus: "complete" });
    expect(result.sourceObjectIds).toEqual(expect.arrayContaining(["shape-1", "vector-1"]));
    expect(result.observedEvidence.items.every((item) => item.origin !== "model")).toBe(true);
    expect(result.inferredInterpretations.items[0]).toMatchObject({ verificationStatus: "unverified", uncertainty: expect.arrayContaining(["AI-generated interpretation; not independently verified."]) });
    expect(result.provenance.find((item) => item.stage === "fusion")).toMatchObject({ provider: "system", model: null });
    expect(result.diagnostics.timings?.stages).toMatchObject({ total: 8, structure: 3, fusion: 5 });
  });

  it("rejects client canvas data that differs from the persisted snapshot before inference", async () => {
    const analyze = deterministicAnalyze();
    const input = request();
    input.document = { ...document, objects: [] };
    await expect(produceCanvasAnalysisForPersistedBoard(database, scope, input, { analyze })).rejects.toMatchObject({ code: "stale_revision" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("accepts a source-linked OCR crop only when its IDs, bounds, PNG size, and transform match the saved strokes", async () => {
    const { payload } = cropFixture();
    const analyze = deterministicAnalyze();
    const result = await produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze });

    expect(analyze).toHaveBeenCalledOnce();
    expect(analyze.mock.calls[0][0].image?.regions?.[0]).toMatchObject({ id: "stroke-group:ink-1", sourceIds: ["ink-1"], worldBounds: { x: 10, y: 20, width: 12, height: 8 } });
    expect(result.analysisStatus).toBe("complete");
  });

  it("returns explicit source-linked records for every uncaptured or lower-priority ink region", async () => {
    const previousLimit = process.env.CANVAS_OCR_MAX_REGIONS;
    process.env.CANVAS_OCR_MAX_REGIONS = "3";
    try {
      const expanded = structuredClone(document);
      const store = expanded.snapshot.document.store as Record<string, unknown>;
      for (let index = 0; index < 4; index++) store[`ink-${index}`] = { id: `ink-${index}`, type: "draw", x: index * 100, y: 80, width: 12, height: 8 };
      database.prepare("UPDATE canvases SET document=? WHERE id=?").run(JSON.stringify(expanded), board.boardId);
      const payload = request();
      payload.document = expanded;
      payload.selectedIds = [];
      payload.image = { regions: [] };

      const result = await produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze: deterministicAnalyze() });

      expect(result.omittedRegions).toHaveLength(4);
      expect(result.omittedRegions.map((region) => region.sourceIds[0]).sort()).toEqual(["ink-0", "ink-1", "ink-2", "ink-3"]);
      expect(result.omittedRegions.filter((region) => region.reason === "not-captured")).toHaveLength(3);
      expect(result.omittedRegions.filter((region) => region.reason === "crop-limit")).toHaveLength(1);
    } finally {
      if (previousLimit === undefined) delete process.env.CANVAS_OCR_MAX_REGIONS;
      else process.env.CANVAS_OCR_MAX_REGIONS = previousLimit;
    }
  });

  it("validates omitted regions against the full persisted board when far strokes are outside the analyzed context", async () => {
    const { payload } = cropFixture();
    const expanded = structuredClone(payload.document as typeof document);
    (expanded.snapshot.document.store as Record<string, unknown>)["ink-far"] = { id: "ink-far", type: "draw", x: 1200, y: 1200, width: 12, height: 8 };
    database.prepare("UPDATE canvases SET document=? WHERE id=?").run(JSON.stringify(expanded), board.boardId);
    payload.document = expanded;

    const result = await produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze: deterministicAnalyze() });

    expect(result.sourceObjectIds).not.toContain("ink-far");
    expect(result.omittedRegions).toEqual(expect.arrayContaining([expect.objectContaining({ sourceIds: ["ink-far"], reason: "not-captured" })]));
    expect(() => validateCanvasAnalysisForBoard({ ...result, omittedRegions: result.omittedRegions.map((region) => region.sourceIds.includes("ink-far") ? { ...region, sourceIds: ["fabricated-stroke"] } : region) }, { ...board, document: JSON.stringify(expanded) })).toThrow(expect.objectContaining({ code: "invalid_result" }));
  });

  it("accepts one whole-expression crop for a pure-ink math board", async () => {
    const mathDocument = { version: 1, snapshot: { document: { store: Object.fromEntries(Array.from({ length: 3 }, (_, index) => [`ink-${index}`, { id: `ink-${index}`, type: "draw", x: index * 100, y: 0, width: 10, height: 10 }])) } }, objects: [] };
    database.prepare("UPDATE canvases SET document=? WHERE id=?").run(JSON.stringify(mathDocument), board.boardId);
    const input = normalizeCanvasInput({ boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId, snapshot: mathDocument.snapshot, scientificObjects: [] });
    const groups = groupQuickdrawStrokes(input);
    expect(groups).toHaveLength(1);
    const [plan] = planCanvasOCRCrops(groups, { padding: CANVAS_OCR_DEFAULT_PADDING });
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
    png.write("IHDR", 12, "ascii"); png.writeUInt32BE(plan.width, 16); png.writeUInt32BE(plan.height, 20);
    const region = {
      id: plan.id, base64: png.toString("base64"), mimeType: "image/png" as const,
      worldBounds: plan.worldBounds, cropBounds: plan.cropBounds, sourceIds: plan.sourceIds,
      pixelWidth: plan.width, pixelHeight: plan.height,
      pixelToWorld: canvasOCRRegionTransform(plan.cropBounds, plan.width, plan.height),
    };
    const payload = { expectedRevision: board.revision, document: mathDocument, selectedIds: [], image: { regions: [region] } };

    const result = await produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze: deterministicAnalyze() });
    expect(result.omittedRegions).toEqual([]);
    expect(result.analysisStatus).toBe("complete");
  });

  it("rejects OCR crops that invent source stroke IDs or coordinates before inference", async () => {
    const { payload } = cropFixture();
    payload.image!.regions![0].sourceIds = ["invented-stroke"];
    const analyze = deterministicAnalyze();

    await expect(produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze })).rejects.toMatchObject({ code: "scope_mismatch" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects OCR crops with a fabricated pixel-to-world transform before inference", async () => {
    const { payload } = cropFixture();
    payload.image!.regions![0].pixelToWorld.offsetX = 900;
    const analyze = deterministicAnalyze();

    await expect(produceCanvasAnalysisForPersistedBoard(database, scope, payload, { analyze })).rejects.toMatchObject({ code: "invalid_result" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects a board revision changed while Canvas Intelligence is running", async () => {
    const analyze = deterministicAnalyze();
    const duringInference = async (args: UnderstandCanvasArgs) => {
      const result = await analyze(args);
      database.prepare("UPDATE canvases SET revision=revision+1 WHERE id=?").run(board.boardId);
      return result;
    };
    await expect(produceCanvasAnalysisForPersistedBoard(database, scope, request(), { analyze: duringInference })).rejects.toMatchObject({ code: "stale_revision" });
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("returns the validated analysis from its explicit POST adapter and reports stale expected revisions", async () => {
    expect(database.prepare("SELECT revision FROM canvases WHERE id=?").get(board.boardId)).toEqual({ revision: board.revision });
    const analyze = deterministicAnalyze();
    const handler = createCanvasAnalysisProducerHandler(database, "http://localhost", { analyze });
    const call = async (payload: unknown) => {
      const req = Object.assign(Readable.from([JSON.stringify(payload)]), { method: "POST", url: `/api/canvases/${board.boardId}/analysis?course=${board.courseId}&lesson=${board.lessonId}` }) as unknown as IncomingMessage;
      const result: { status?: number; body?: string } = {};
      const res = { writeHead(status: number) { result.status = status; }, end(body: string) { result.body = body; } } as unknown as ServerResponse;
      const handled = await handler(req, res);
      return { handled, status: result.status, body: JSON.parse(result.body ?? "{}") as Record<string, any> };
    };
    const valid = await call(request());
    expect(valid).toMatchObject({ handled: true, status: 200, body: { analysis: { boardId: board.boardId, revision: board.revision } } });
    const stale = await call({ ...request(), expectedRevision: board.revision - 1 });
    expect(stale).toMatchObject({ handled: true, status: 409, body: { code: "stale_revision" } });
    const invalid = await call({ ...request(), expectedRevision: -1 });
    expect(invalid).toMatchObject({ handled: true, status: 400, body: { code: "invalid_request" } });
    const invalidProvider = await createCanvasAnalysisProducerHandler(database, "http://localhost", { analyze: async () => { throw new z.ZodError([]); } });
    const req = Object.assign(Readable.from([JSON.stringify(request())]), { method: "POST", url: `/api/canvases/${board.boardId}/analysis?course=${board.courseId}&lesson=${board.lessonId}` }) as unknown as IncomingMessage;
    const result: { status?: number; body?: string } = {};
    const res = { writeHead(status: number) { result.status = status; }, end(body: string) { result.body = body; } } as unknown as ServerResponse;
    await invalidProvider(req, res);
    expect({ status: result.status, body: JSON.parse(result.body ?? "{}") }).toMatchObject({ status: 502, body: { code: "invalid_result" } });
  });
});

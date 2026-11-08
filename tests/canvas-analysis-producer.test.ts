import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { buildCanvasEvidence, selectCanvasContext } from "../server/canvas-intelligence/evidence.js";
import { geometryObservations, normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { associateOCRLabels } from "../server/canvas-intelligence/regions.js";
import { FusionResultSchema, OCRResultSchema, StructureResultSchema } from "../server/canvas-intelligence/types.js";
import { CanvasAnalysisValidationError, currentCanvasRevision } from "../server/canvas-analysis/contract.js";
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
  });
});

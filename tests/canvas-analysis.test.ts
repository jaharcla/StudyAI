import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { CanvasEvidenceBundleSchema, SelectedCanvasContextSchema } from "../server/canvas-intelligence/evidence.js";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { CanvasAnalysisResultSchema, CanvasAnalysisValidationError, createCanvasAnalysisResult, currentCanvasRevision, validateCanvasAnalysisForBoard } from "../server/canvas-analysis/contract.js";
import { createCanvasAnalysisHandler } from "../server/canvas-analysis/http.js";

const snapshot = {
  document: { store: {
    "shape-1": { id: "shape-1", type: "arrow", x: 0, y: 0, width: 20, height: 20, geometry: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } } },
    "shape-2": { id: "shape-2", type: "ellipse", x: 20, y: 0, width: 20, height: 20, geometry: { kind: "ellipse" } },
  } },
};
const vector = { id: "vector-1", kind: "vector", x: 10, y: 10, width: 20, height: 20, components: [10, 0, 0], geometry: { tail: { x: 10, y: 10 }, tip: { x: 30, y: 10 }, tailRef: { scope: "quickdraw", id: "shape-1" }, tipRef: { scope: "science", id: "shape-2" } } };
const board = {
  boardId: "board-1",
  courseId: "course-1",
  lessonId: "lesson-1",
  revision: 7,
  document: JSON.stringify({ version: 1, snapshot, objects: [vector] }),
};
const canvasInput = normalizeCanvasInput({ boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId, snapshot, scientificObjects: [vector], selectedIds: ["shape-1"] });
const inputRevisionHash = canvasInput.revision;
const scope = { boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId, revisionHash: inputRevisionHash };
const evidence = CanvasEvidenceBundleSchema.parse({
  schemaVersion: 1,
  scope,
  evidence: [
    { id: "ev:0", revisionHash: inputRevisionHash, origin: "native", kind: "object", subjectId: "shape-1", claimKey: null, claimValue: null, text: "Arrow shape", sourceIds: ["shape-1"], confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] },
    { id: "ev:1", revisionHash: inputRevisionHash, origin: "geometry", kind: "observation", subjectId: null, claimKey: null, claimValue: null, text: "Arrow is near circle", sourceIds: ["shape-1", "shape-2"], confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] },
    { id: "ev:2", revisionHash: inputRevisionHash, origin: "model", kind: "relationship", subjectId: "shape-1", claimKey: null, claimValue: null, text: "Arrow may indicate force on circle", sourceIds: ["shape-1", "shape-2"], confidence: 0.72, locationPrecision: null, uncertain: true, uncertaintyReasons: ["Model relation; claimed basis is not proof"] },
  ],
  conflicts: [],
  warnings: [],
});
const selectedContext = SelectedCanvasContextSchema.parse({
  schemaVersion: 1,
  scope,
  evidence: evidence.evidence,
  sourceRecords: canvasInput.nativeRecords.map(({ id, type, bounds, geometry, text }) => ({ id, type, ...(bounds ? { bounds } : {}), ...(geometry ? { geometry } : {}), ...(text !== undefined ? { text } : {}) })),
  scientificObjects: [vector],
  conflicts: [],
  warnings: [],
  excludedEvidenceCount: 0,
  excludedSourceCount: 0,
  truncated: false,
});
const provenance = [
  { id: "p-canvas", stage: "canvas", provider: "quickdraw", method: "native snapshot", model: null, createdAt: "2026-11-08T16:00:00.000Z" },
  { id: "p-geometry", stage: "geometry", provider: "system", method: "exact canvas geometry", model: null, createdAt: "2026-11-08T16:00:00.000Z" },
  { id: "p-structure", stage: "structure", provider: "local", method: "structured analysis", model: "qwen3:latest", createdAt: "2026-11-08T16:00:00.000Z" },
  { id: "p-fusion", stage: "fusion", provider: "local", method: "evidence fusion", model: "qwen3:latest", createdAt: "2026-11-08T16:00:00.000Z" },
];
const pipelineResult = {
  schemaVersion: 1,
  fixtureId: "fixture-1",
  pipelineId: "P1",
  pipelineVersion: "canvas-fusion/1.0.0",
  status: "complete",
  objects: [],
  relationships: [{ fromId: "shape-1", toId: "shape-2", relation: "may point toward", sourceIds: ["shape-1", "shape-2"], confidence: 0.72, basis: "model" }],
  interpretations: [{ id: "interpretation-1", statement: "The arrow may represent force acting on the circle.", sourceObjectIds: ["shape-1", "shape-2"], supportingEvidenceIds: ["ev:0", "ev:1"], confidence: 0.72, uncertainty: ["The diagram has no force label."], provenanceIds: ["p-fusion"] }],
  provenance,
  uncertainties: ["The scientific meaning is not explicit."],
  errors: [],
  timings: { totalMs: 12, stages: { fusion: 12 } },
};

function buildResult(source = board, options: { evidence?: typeof evidence; context?: typeof selectedContext; pipeline?: typeof pipelineResult } = {}) {
  return createCanvasAnalysisResult({ board: source, canvasInput, evidence: options.evidence ?? evidence, selectedContext: options.context ?? selectedContext, pipelineResult: options.pipeline ?? pipelineResult });
}

const receiverDb = new Database(":memory:");
receiverDb.exec("CREATE TABLE lessons(id TEXT,course_id TEXT); CREATE TABLE canvases(id TEXT,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT);");
const canvasAnalysisHandler = createCanvasAnalysisHandler(receiverDb, "http://localhost");
beforeEach(() => {
  receiverDb.prepare("INSERT OR REPLACE INTO lessons(id,course_id) VALUES(?,?)").run(board.lessonId, board.courseId);
  receiverDb.prepare("INSERT OR REPLACE INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run(board.boardId, board.courseId, board.lessonId, board.revision, board.document);
});
afterAll(() => receiverDb.close());

async function validateAtApi(input: unknown, scope = { boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId }) {
  const request = Object.assign(Readable.from([JSON.stringify(input)]), { method: "POST", url: `/api/canvases/${encodeURIComponent(scope.boardId)}/analysis/validate?course=${encodeURIComponent(scope.courseId)}&lesson=${encodeURIComponent(scope.lessonId)}` }) as unknown as IncomingMessage;
  const result: { status?: number; body?: string } = {};
  const response = { writeHead(status: number) { result.status = status; }, end(body: string) { result.body = body; } } as unknown as ServerResponse;
  const handled = await canvasAnalysisHandler(request, response);
  return { handled, status: result.status, body: JSON.parse(result.body ?? "{}") as Record<string, unknown> };
}

describe("CanvasAnalysisResult contract", () => {
  it("adapts existing fixture, pipeline, and evidence schemas without mixing observations and inference", () => {
    const result = buildResult();
    expect(result.revisionHash).toBe(currentCanvasRevision(board).revisionHash);
    expect(result.observedEvidence.items.map((item) => item.origin)).toEqual(["native", "geometry"]);
    expect(result.inferredInterpretations.evidence.every((item) => item.origin === "model" && item.uncertain)).toBe(true);
    expect(result.inferredInterpretations.items[0].verificationStatus).toBe("unverified");
    expect(result.relationships[0]).toMatchObject({ classification: "inferred", verificationStatus: "unverified" });
    expect(result.sourceObjectRefs).toEqual(expect.arrayContaining([{ scope: "quickdraw", id: "shape-1" }, { scope: "science", id: "vector-1" }]));
    expect(result.observedEvidence.selectedContext.sourceRecords[0].geometry).toBeDefined();
    expect(result.observedEvidence.selectedContext.scientificObjects[0].geometry).toMatchObject({ tailRef: { scope: "quickdraw", id: "shape-1" }, tipRef: { scope: "science", id: "shape-2" } });
    expect(result.analysisStatus).toBe("complete");
    expect(result.diagnostics.timings?.stages.fusion).toBe(12);
  });

  it("rejects complete analysis without observed evidence", () => {
    const emptyEvidence = CanvasEvidenceBundleSchema.parse({ ...evidence, evidence: evidence.evidence.filter((item) => item.origin === "model") });
    const emptyContext = SelectedCanvasContextSchema.parse({ ...selectedContext, evidence: emptyEvidence.evidence });
    expect(() => buildResult(board, { evidence: emptyEvidence, context: emptyContext })).toThrow(CanvasAnalysisValidationError);
  });

  it("rejects interpretations without observed supporting evidence", () => {
    const invalidPipeline = { ...pipelineResult, interpretations: [{ ...pipelineResult.interpretations[0], supportingEvidenceIds: ["missing-evidence"] }] };
    expect(() => buildResult(board, { pipeline: invalidPipeline })).toThrow(CanvasAnalysisValidationError);
  });

  it.each(["boardId", "courseId", "lessonId"] as const)("rejects mismatched %s scope", (field) => {
    const invalidBoard = { ...board, [field]: `other-${field}` };
    expect(() => buildResult(invalidBoard)).toThrow(/scope/i);
  });

  it("rejects a newer authoritative revision", () => {
    const result = buildResult();
    expect(() => validateCanvasAnalysisForBoard(result, { ...board, revision: board.revision + 1 })).toThrow(/stale/i);
  });

  it("rejects changed authoritative content even when the revision number was not advanced", () => {
    const result = buildResult();
    const changed = { ...board, document: JSON.stringify({ objects: [{ id: "shape-1", kind: "text", text: "changed" }] }) };
    expect(() => validateCanvasAnalysisForBoard(result, changed)).toThrow(/stale/i);
  });

  it("rejects an observation bundle captured for a different board", () => {
    const changed = CanvasEvidenceBundleSchema.parse({ ...evidence, scope: { ...scope, boardId: "other-board" } });
    expect(() => buildResult(board, { evidence: changed })).toThrow(/scope/i);
  });

  it("rejects a model relationship labeled as observed", () => {
    const invalid = { ...buildResult(), relationships: [{ ...buildResult().relationships[0], classification: "observed", verificationStatus: "observed" }] };
    expect(CanvasAnalysisResultSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates API results against the current persisted board revision", async () => {
    const result = await validateAtApi(buildResult());
    expect(result).toMatchObject({ handled: true, status: 200, body: { valid: true } });
    receiverDb.prepare("UPDATE canvases SET revision=? WHERE id=?").run(board.revision + 1, board.boardId);
    const stale = await validateAtApi(buildResult());
    expect(stale).toMatchObject({ handled: true, status: 409, body: { code: "stale_revision" } });
  });

  it("rejects API results whose board, course, or lesson scope differs", async () => {
    const result = buildResult();
    const mismatch = { ...result, courseId: "other-course", observedEvidence: { ...result.observedEvidence, sourceScope: { ...result.observedEvidence.sourceScope, courseId: "other-course" }, selectedContext: { ...result.observedEvidence.selectedContext, scope: { ...result.observedEvidence.selectedContext.scope, courseId: "other-course" } } } };
    const response = await validateAtApi(mismatch);
    expect(response).toMatchObject({ handled: true, status: 409, body: { code: "scope_mismatch" } });
  });
});

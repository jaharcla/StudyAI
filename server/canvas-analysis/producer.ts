import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { z } from "zod";
import { understandCanvas, type CanvasUnderstanding, type UnderstandCanvasArgs } from "../canvas-intelligence/service.js";
import { normalizeCanvasInput } from "../canvas-intelligence/input.js";
import { CanvasAnalysisValidationError, createCanvasAnalysisResult, currentCanvasRevision, type AuthoritativeCanvasRevision, type CanvasAnalysisResult } from "./contract.js";
import { validateCanvasAnalysisAtReceiver } from "./receiver.js";

type CanvasRow = AuthoritativeCanvasRevision & { name?: string };

const CanvasAnalysisRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  document: z.unknown(),
  selectedIds: z.array(z.string().min(1).max(512)).max(5000).default([]),
  image: z.object({
    base64: z.string().min(1).max(12_000_000),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/png"),
  }).strict(),
}).strict();

export type CanvasAnalysisRequest = z.infer<typeof CanvasAnalysisRequestSchema>;
type AnalyzeCanvas = (args: UnderstandCanvasArgs) => Promise<CanvasUnderstanding>;

export function produceCanvasAnalysisForPersistedBoard(
  database: Database.Database,
  scope: { boardId: string; courseId: string; lessonId: string },
  input: CanvasAnalysisRequest,
  options: { analyze?: AnalyzeCanvas; now?: () => Date } = {},
): Promise<CanvasAnalysisResult> {
  return produce(database, scope, input, options);
}

async function produce(
  database: Database.Database,
  scope: { boardId: string; courseId: string; lessonId: string },
  input: CanvasAnalysisRequest,
  options: { analyze?: AnalyzeCanvas; now?: () => Date },
): Promise<CanvasAnalysisResult> {
  const row = database.prepare("SELECT id AS boardId,course_id AS courseId,lesson_id AS lessonId,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(scope.boardId, scope.courseId, scope.lessonId) as CanvasRow | undefined;
  if (!row) throw new CanvasAnalysisValidationError("scope_mismatch", "No authoritative canvas exists for this board, course, and lesson.");
  if (row.revision !== input.expectedRevision) throw new CanvasAnalysisValidationError("stale_revision", "The persisted board revision changed. Reload the board and analyze again.");
  const authoritative = currentCanvasRevision(row);
  const submitted = currentCanvasRevision({ ...row, document: input.document });
  if (submitted.snapshotHash !== authoritative.snapshotHash) {
    throw new CanvasAnalysisValidationError("stale_revision", "The displayed canvas differs from the persisted board. Save the current board and analyze again.");
  }

  let document: Record<string, unknown>;
  try {
    const parsed: unknown = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Canvas document must be an object.");
    document = parsed as Record<string, unknown>;
  } catch {
    throw new CanvasAnalysisValidationError("invalid_result", "The persisted canvas document is invalid.");
  }
  if (!document.snapshot || !Array.isArray(document.objects)) {
    throw new CanvasAnalysisValidationError("invalid_result", "The persisted canvas document is missing its snapshot or scientific objects.");
  }

  const canvasInput = normalizeCanvasInput({
    boardId: row.boardId,
    courseId: row.courseId,
    lessonId: row.lessonId,
    snapshot: document.snapshot,
    scientificObjects: document.objects,
    selectedIds: input.selectedIds,
    image: input.image,
  });
  const knownIds = new Set([...canvasInput.nativeRecords.map((item) => item.id), ...canvasInput.scientificObjects.map((item) => item.id)]);
  if (input.selectedIds.some((id) => !knownIds.has(id))) throw new CanvasAnalysisValidationError("scope_mismatch", "A selected canvas object is not present in the persisted board.");
  const understanding = await (options.analyze ?? understandCanvas)({
    boardId: row.boardId,
    courseId: row.courseId,
    lessonId: row.lessonId,
    snapshot: document.snapshot,
    scientificObjects: document.objects,
    selectedIds: input.selectedIds,
    image: input.image,
    userQuestion: "Analyze this persisted board. Separate observed canvas data from uncertain interpretations. Do not infer meaning from coordinates alone or propose edits.",
    mode: "deep",
  });
  if (!understanding.evidence || !understanding.selectedContext || !understanding.fusion) {
    throw new CanvasAnalysisValidationError("invalid_result", "Canvas Intelligence did not return complete evidence and analysis context.");
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  const provenance = [
    { id: "prov-canvas", stage: "canvas" as const, provider: "quickdraw" as const, method: "Persisted Quickdraw snapshot and scientific objects", model: null, createdAt: now },
    { id: "prov-geometry", stage: "geometry" as const, provider: "system" as const, method: "Deterministic Canvas Intelligence geometry observations", model: null, createdAt: now },
    { id: "prov-ocr", stage: "ocr" as const, provider: "system" as const, method: "Canvas Intelligence OCR stage; effective provider is not exposed by understandCanvas", model: null, createdAt: now },
    { id: "prov-structure", stage: "structure" as const, provider: "system" as const, method: "Canvas Intelligence structure stage; effective provider is not exposed by understandCanvas", model: null, createdAt: now },
    { id: "prov-fusion", stage: "fusion" as const, provider: "system" as const, method: "Canvas Intelligence fusion stage; effective provider is not exposed by understandCanvas", model: null, createdAt: now },
  ];
  const observedSourceIds = [...new Set(understanding.evidence.evidence.filter((item) => item.origin !== "model").flatMap((item) => item.sourceIds))];
  const supportingEvidenceIds = understanding.evidence.evidence.filter((item) => item.origin !== "model").map((item) => item.id);
  const interpretations = understanding.fusion.answer.trim() && observedSourceIds.length && supportingEvidenceIds.length
    ? [{
      id: "canvas-fusion-summary",
      statement: understanding.fusion.answer,
      sourceObjectIds: observedSourceIds,
      supportingEvidenceIds,
      confidence: null,
      uncertainty: ["AI-generated interpretation; not independently verified.", ...understanding.fusion.uncertainties.filter((value): value is string => typeof value === "string")],
      provenanceIds: ["prov-structure", "prov-fusion"],
    }]
    : [];
  const relationships = [...understanding.structure.relationships, ...understanding.fusion.relationships]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.fromId === item.fromId && candidate.toId === item.toId && candidate.relation === item.relation && candidate.basis === item.basis) === index);
  const pipelineResult = {
    schemaVersion: 1,
    fixtureId: `canvas-${row.boardId}`,
    pipelineId: "P1",
    pipelineVersion: "canvas-intelligence-contract-adapter/1",
    status: understanding.evidence.evidence.some((item) => item.origin !== "model") ? "complete" : "partial",
    objects: [...understanding.structure.objects, ...understanding.fusion.objects],
    relationships,
    interpretations,
    provenance,
    uncertainties: understanding.fusion.uncertainties,
    errors: [],
    timings: {
      totalMs: Math.max(0, understanding.latencyMs.total ?? 0),
      stages: Object.fromEntries(Object.entries(understanding.latencyMs).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0)),
    },
  };
  const result = createCanvasAnalysisResult({
    board: row,
    canvasInput,
    evidence: understanding.evidence,
    selectedContext: understanding.selectedContext,
    pipelineResult,
  });
  return validateCanvasAnalysisAtReceiver(database, result, scope);
}

export function createCanvasAnalysisProducerHandler(database: Database.Database, origin: string, options: { analyze?: AnalyzeCanvas; now?: () => Date } = {}) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    if (request.method !== "POST") return false;
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/api\/canvases\/([^/]+)\/analysis$/.exec(url.pathname);
    if (!match) return false;
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
      response.end(JSON.stringify(data));
    };
    let boardId: string;
    try { boardId = decodeURIComponent(match[1]); }
    catch { send(400, { error: "Invalid board ID." }); return true; }
    const courseId = url.searchParams.get("course") ?? "";
    const lessonId = url.searchParams.get("lesson") ?? "";
    if (!courseId || !lessonId) { send(400, { error: "course and lesson are required." }); return true; }
    if (!database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(courseId, lessonId)) { send(404, { error: "Lesson not found in this course." }); return true; }
    try {
      const body = JSON.parse(await readBody(request));
      const input = CanvasAnalysisRequestSchema.parse(body);
      const analysis = await produceCanvasAnalysisForPersistedBoard(database, { boardId, courseId, lessonId }, input, options);
      send(200, { analysis });
    } catch (error) {
      if (error instanceof CanvasAnalysisValidationError) {
        const status = error.code === "scope_mismatch" || error.code === "stale_revision" ? 409 : 400;
        send(status, { error: error.message, code: error.code });
      } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
        send(400, { error: "Canvas analysis request is invalid.", code: "invalid_request" });
      } else {
        send(502, { error: error instanceof Error ? error.message : "Canvas analysis failed.", code: "analysis_failed" });
      }
    }
    return true;
  };
}

function readBody(request: IncomingMessage, limit = 20_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      value += chunk;
      if (value.length > limit) reject(new Error("Canvas analysis payload is too large."));
    });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

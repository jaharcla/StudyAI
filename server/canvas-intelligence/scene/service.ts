import type Database from "better-sqlite3";
import { z } from "zod";
import { parseCanvasDocument } from "../../../src/canvas/model.js";
import { normalizeCanvasInput } from "../input.js";
import { currentCanvasRevision, CanvasAnalysisResultSchema, type AuthoritativeCanvasRevision } from "../../canvas-analysis/contract.js";
import { recognizeCanvasStrokes } from "../recognition/index.js";
import { listCanvasRecognitionPrototypes } from "../recognition/store.js";
import { loadCanvasRecognitionFeedback } from "../recognition/feedback.js";
import { buildCanvasSceneGraph } from "./build.js";
import { initializeCanvasSceneSchema, loadCanvasSceneGraph, saveCanvasSceneGraph, searchCanvasScene, searchCurrentCourseCanvasScene } from "./store.js";
import type { CanvasSceneGraph } from "../../../src/canvas/spatial/types.js";

const BuildSchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  expectedRevision: z.number().int().nonnegative(),
  analysis: z.unknown().optional(),
}).strict();

const QuerySchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  revisionHash: z.string().min(1).max(128),
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(8),
}).strict();

const CourseQuerySchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512).optional(),
  boardId: z.string().min(1).max(512).optional(),
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(8),
}).strict();

export class CanvasSceneError extends Error {
  constructor(public readonly code: "invalid_request" | "scope_mismatch" | "stale_revision" | "index_unavailable" | "scene_build_failed", message: string, public readonly status: number) {
    super(message);
    this.name = "CanvasSceneError";
  }
}

type CanvasRow = AuthoritativeCanvasRevision & { name?: string };

export async function buildCanvasScene(database: Database.Database, boardId: string, input: unknown): Promise<{ scene: CanvasSceneGraph; indexStatus: "indexed"; warnings: string[] }> {
  initializeCanvasSceneSchema(database);
  const request = BuildSchema.parse(input);
  const row = database.prepare("SELECT id AS boardId,course_id AS courseId,lesson_id AS lessonId,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(boardId, request.courseId, request.lessonId) as CanvasRow | undefined;
  if (!row) throw new CanvasSceneError("scope_mismatch", "No canvas exists for this board, course, and lesson.", 404);
  if (row.revision !== request.expectedRevision) throw new CanvasSceneError("stale_revision", "The persisted board revision changed. Reload the board and try again.", 409);
  let document;
  try {
    document = parseCanvasDocument(typeof row.document === "string" ? JSON.parse(row.document) : row.document);
  } catch {
    throw new CanvasSceneError("invalid_request", "The persisted canvas document is invalid.", 400);
  }
  const current = currentCanvasRevision({ ...row, document });
  const canvasInput = normalizeCanvasInput({ boardId: row.boardId, courseId: row.courseId, lessonId: row.lessonId, snapshot: document.snapshot, scientificObjects: document.objects, selectedIds: [] });
  let analysis = null;
  if (request.analysis !== undefined && request.analysis !== null) {
    const parsed = CanvasAnalysisResultSchema.safeParse(request.analysis);
    if (!parsed.success) throw new CanvasSceneError("invalid_request", "The supplied canvas analysis is invalid.", 400);
    if (parsed.data.boardId !== row.boardId || parsed.data.courseId !== row.courseId || parsed.data.lessonId !== row.lessonId) throw new CanvasSceneError("scope_mismatch", "The canvas analysis belongs to another board or scope.", 404);
    if (parsed.data.revision !== row.revision || parsed.data.observedEvidence.sourceScope.revisionHash !== current.revisionHash) throw new CanvasSceneError("stale_revision", "The canvas analysis does not match the persisted revision.", 409);
    analysis = parsed.data;
  }
  const recognitionMode = process.env.CANVAS_SCENE_RECOGNITION || "baseline";
  const prototypes = listCanvasRecognitionPrototypes(database, row.courseId);
  const recognition = recognitionMode === "off" ? null : await recognizeCanvasStrokes(canvasInput, { mode: recognitionMode === "clip" ? "clip" : recognitionMode === "auto" ? "auto" : "baseline", prototypes, labels: Object.keys(prototypes) });
  const feedback = loadCanvasRecognitionFeedback(database, row.courseId, row.boardId);
  const scene = buildCanvasSceneGraph({
    input: canvasInput,
    scope: { boardId: row.boardId, courseId: row.courseId, lessonId: row.lessonId },
    revision: row.revision,
    revisionHash: current.revisionHash,
    snapshotHash: current.snapshotHash,
    recognition,
    analysis,
    feedback,
  });
  saveCanvasSceneGraph(database, scene);
  return { scene, indexStatus: "indexed", warnings: scene.warnings };
}

export function queryCanvasScene(database: Database.Database, boardId: string, input: unknown): { nodes: CanvasSceneGraph["nodes"]; edges: CanvasSceneGraph["edges"]; warnings: string[]; truncated: boolean } {
  const request = QuerySchema.parse(input);
  const graph = loadCanvasSceneGraph(database, boardId, request.revisionHash);
  if (!graph) throw new CanvasSceneError("index_unavailable", "No scene graph is available for this revision. Build it first.", 409);
  if (graph.scope.courseId !== request.courseId || graph.scope.lessonId !== request.lessonId) throw new CanvasSceneError("scope_mismatch", "The scene graph belongs to another course or lesson.", 404);
  const result = searchCanvasScene(database, { courseId: request.courseId, lessonId: request.lessonId, boardId, revisionHash: request.revisionHash }, request.query, request.limit);
  return { nodes: result.nodes, edges: result.edges, warnings: result.warnings, truncated: result.truncated };
}

export function queryCourseCanvasScene(database: Database.Database, courseId: string, input: unknown): ReturnType<typeof searchCurrentCourseCanvasScene> {
  const request = CourseQuerySchema.parse(input);
  if (request.courseId !== courseId) throw new CanvasSceneError("scope_mismatch", "The scene search belongs to another course.", 404);
  initializeCanvasSceneSchema(database);
  return searchCurrentCourseCanvasScene(database, { courseId, lessonId: request.lessonId, boardId: request.boardId }, request.query, request.limit);
}

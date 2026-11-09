import type Database from "better-sqlite3";
import { CanvasAnalysisResultSchema, CanvasAnalysisValidationError, validateCanvasAnalysisForBoard, type CanvasAnalysisResult } from "./contract.js";

export type CanvasAnalysisExpectedScope = Pick<CanvasAnalysisResult, "boardId" | "courseId" | "lessonId">;

type CanvasRow = { id: string; course_id: string; lesson_id: string; revision: number; document: string };

export function validateCanvasAnalysisAtReceiver(database: Database.Database, input: unknown, expected: CanvasAnalysisExpectedScope): CanvasAnalysisResult {
  const parsed = CanvasAnalysisResultSchema.safeParse(parseTransportValue(input));
  if (!parsed.success) throw new CanvasAnalysisValidationError("invalid_result", "Canvas analysis result is invalid.", parsed.error.issues);
  const result = parsed.data;
  if (result.boardId !== expected.boardId || result.courseId !== expected.courseId || result.lessonId !== expected.lessonId) {
    throw new CanvasAnalysisValidationError("scope_mismatch", "Canvas analysis does not match the active board, course, and lesson.");
  }
  const row = database.prepare("SELECT id,course_id,lesson_id,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(expected.boardId, expected.courseId, expected.lessonId) as CanvasRow | undefined;
  if (!row) throw new CanvasAnalysisValidationError("scope_mismatch", "No authoritative canvas exists for this board, course, and lesson.");
  return validateCanvasAnalysisForBoard(result, { boardId: row.id, courseId: row.course_id, lessonId: row.lesson_id, revision: row.revision, document: row.document });
}

function parseTransportValue(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try { return JSON.parse(input) as unknown; }
  catch { throw new CanvasAnalysisValidationError("invalid_result", "Canvas analysis context is not valid JSON."); }
}

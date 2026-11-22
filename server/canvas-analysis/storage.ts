import type Database from "better-sqlite3";

export function initializeCanvasAnalysisStorage(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS canvas_analyses (
      board_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function saveCanvasAnalysis(
  database: Database.Database,
  boardId: string,
  courseId: string,
  lessonId: string,
  revision: number,
  analysis: unknown,
): void {
  database.prepare(`
    INSERT INTO canvas_analyses(board_id, course_id, lesson_id, revision, result_json, saved_at)
    VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(board_id) DO UPDATE SET
      course_id=excluded.course_id, lesson_id=excluded.lesson_id,
      revision=excluded.revision, result_json=excluded.result_json, saved_at=excluded.saved_at
  `).run(boardId, courseId, lessonId, revision, JSON.stringify(analysis), new Date().toISOString());
}

export function loadCanvasAnalysis(
  database: Database.Database,
  boardId: string,
  courseId: string,
  lessonId: string,
  revision: number,
): unknown | null {
  const row = database.prepare(`
    SELECT result_json FROM canvas_analyses
    WHERE board_id=? AND course_id=? AND lesson_id=? AND revision=?
  `).get(boardId, courseId, lessonId, revision) as { result_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.result_json) as unknown; } catch { return null; }
}

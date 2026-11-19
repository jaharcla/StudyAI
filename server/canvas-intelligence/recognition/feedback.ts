import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { RECOGNITION_LIMITS } from "./types.js";

export type CanvasRecognitionDecision = "accept" | "reject" | "correct";

export type CanvasRecognitionFeedback = {
  groupKey: string;
  decision: CanvasRecognitionDecision;
  label: string | null;
  sourceIds: string[];
};

const MAX_STROKE_IDS = 32;
const MAX_GROUP_KEY_CHARS = 16_000;

export function initializeCanvasRecognitionFeedbackSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_recognition_feedback (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      group_key TEXT NOT NULL,
      decision TEXT NOT NULL,
      label TEXT,
      source_ids TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS canvas_recognition_feedback_scope_idx ON canvas_recognition_feedback(course_id,board_id,group_key);
  `);
}

/** Stable key for one stroke group: sorted, unique source IDs. */
export function recognitionGroupKey(sourceIds: readonly string[]): string {
  return [...new Set(sourceIds.map((id) => String(id)))].filter(Boolean).sort().join("|");
}

export function normalizeRecognitionLabel(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, RECOGNITION_LIMITS.maxLabelChars);
}

export function parseRecognitionFeedbackInput(value: unknown): { courseId: string; boardId: string; strokeIds: string[]; decision: CanvasRecognitionDecision; label: string | null } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const courseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
  const boardId = typeof input.boardId === "string" ? input.boardId.trim() : "";
  const decision = input.decision;
  if (!courseId) throw new Error("A course ID is required.");
  if (!boardId) throw new Error("A board ID is required.");
  if (decision !== "accept" && decision !== "reject" && decision !== "correct") throw new Error("The feedback decision must be accept, reject, or correct.");
  const strokeIds = Array.isArray(input.strokeIds) ? input.strokeIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  const unique = [...new Set(strokeIds)];
  if (!unique.length) throw new Error("At least one source stroke ID is required.");
  if (unique.length > MAX_STROKE_IDS) throw new Error(`At most ${MAX_STROKE_IDS} source strokes can be reviewed at once.`);
  const label = normalizeRecognitionLabel(input.label);
  if (decision !== "reject" && !label) throw new Error("An accepted or corrected label is required.");
  return { courseId, boardId, strokeIds: unique, decision, label: label || null };
}

export function saveCanvasRecognitionFeedback(db: Database.Database, input: { courseId: string; boardId: string; strokeIds: string[]; decision: CanvasRecognitionDecision; label: string | null }): CanvasRecognitionFeedback {
  initializeCanvasRecognitionFeedbackSchema(db);
  const groupKey = recognitionGroupKey(input.strokeIds);
  if (!groupKey || groupKey.length > MAX_GROUP_KEY_CHARS) throw new Error("The stroke group is too large to record.");
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM canvas_recognition_feedback WHERE course_id=? AND board_id=? AND group_key=?").run(input.courseId, input.boardId, groupKey);
    db.prepare("INSERT INTO canvas_recognition_feedback(id,course_id,board_id,group_key,decision,label,source_ids) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), input.courseId, input.boardId, groupKey, input.decision, input.label, JSON.stringify(input.strokeIds.slice().sort()));
  });
  transaction.immediate();
  return { groupKey, decision: input.decision, label: input.label, sourceIds: input.strokeIds.slice().sort() };
}

export function loadCanvasRecognitionFeedback(db: Database.Database, courseId: string, boardId: string): Map<string, CanvasRecognitionFeedback> {
  initializeCanvasRecognitionFeedbackSchema(db);
  const rows = db.prepare("SELECT group_key,decision,label,source_ids FROM canvas_recognition_feedback WHERE course_id=? AND board_id=?").all(courseId, boardId) as Array<{ group_key: string; decision: string; label: string | null; source_ids: string }>;
  const result = new Map<string, CanvasRecognitionFeedback>();
  for (const row of rows) {
    if (row.decision !== "accept" && row.decision !== "reject" && row.decision !== "correct") continue;
    let sourceIds: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.source_ids);
      if (Array.isArray(parsed)) sourceIds = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      continue;
    }
    result.set(row.group_key, { groupKey: row.group_key, decision: row.decision, label: row.label, sourceIds });
  }
  return result;
}

export function clearCanvasRecognitionFeedback(db: Database.Database, courseId: string, boardId: string, strokeIds: readonly string[]): void {
  initializeCanvasRecognitionFeedbackSchema(db);
  db.prepare("DELETE FROM canvas_recognition_feedback WHERE course_id=? AND board_id=? AND group_key=?").run(courseId, boardId, recognitionGroupKey(strokeIds));
}

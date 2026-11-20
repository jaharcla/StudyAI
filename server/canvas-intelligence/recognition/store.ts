import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { embedRecognitionImage } from "./clip.js";
import { RECOGNITION_LIMITS } from "./types.js";

const MAX_EXAMPLES_PER_LABEL = 20;

export function initializeCanvasRecognitionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_recognition_examples (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      label TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS canvas_recognition_examples_scope_idx ON canvas_recognition_examples(course_id,label,created_at);
  `);
}

export type RecognitionExampleInput = { courseId: string; label: string; pngBase64: string };

export async function teachCanvasRecognitionExample(db: Database.Database, input: RecognitionExampleInput): Promise<{ id: string; label: string; examples: number }> {
  initializeCanvasRecognitionSchema(db);
  const courseId = String(input.courseId ?? "").trim();
  const label = String(input.label ?? "").trim().toLowerCase().slice(0, RECOGNITION_LIMITS.maxLabelChars);
  if (!courseId) throw new Error("A course ID is required for a recognition example.");
  if (!label) throw new Error("A non-empty label is required for a recognition example.");
  if (typeof input.pngBase64 !== "string" || !input.pngBase64) throw new Error("A rendered drawing is required for a recognition example.");
  const embedding = await embedRecognitionImage(input.pngBase64);
  if (embedding.length < 64 || embedding.length > 4096) throw new Error("Unexpected CLIP embedding dimension.");
  const id = randomUUID();
  db.prepare("INSERT INTO canvas_recognition_examples(id,course_id,label,embedding) VALUES(?,?,?,?)")
    .run(id, courseId, label, JSON.stringify(Array.from(embedding)));
  const examples = (db.prepare("SELECT COUNT(*) AS count FROM canvas_recognition_examples WHERE course_id=? AND label=?").get(courseId, label) as { count: number }).count;
  return { id, label, examples };
}

export function listCanvasRecognitionPrototypes(db: Database.Database, courseId: string): Record<string, number[][]> {
  initializeCanvasRecognitionSchema(db);
  if (!courseId) return {};
  const rows = db.prepare("SELECT label,embedding FROM canvas_recognition_examples WHERE course_id=? ORDER BY label,created_at DESC")
    .all(courseId) as Array<{ label: string; embedding: string }>;
  const prototypes: Record<string, number[][]> = {};
  const dimensions: Record<string, number> = {};
  for (const row of rows) {
    const list = prototypes[row.label] ?? [];
    if (list.length >= MAX_EXAMPLES_PER_LABEL) continue;
    try {
      const values: unknown = JSON.parse(row.embedding);
      if (!Array.isArray(values) || values.length < 64 || values.length > 4096 || !values.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
      const dimension = dimensions[row.label] ?? values.length;
      if (values.length !== dimension) continue;
      dimensions[row.label] = dimension;
      list.push(values as number[]);
      prototypes[row.label] = list;
    } catch {
      continue;
    }
  }
  return prototypes;
}

export function countCanvasRecognitionExamples(db: Database.Database, courseId: string): Record<string, number> {
  initializeCanvasRecognitionSchema(db);
  const rows = db.prepare("SELECT label,COUNT(*) AS count FROM canvas_recognition_examples WHERE course_id=? GROUP BY label").all(courseId) as Array<{ label: string; count: number }>;
  return Object.fromEntries(rows.map((row) => [row.label, row.count]));
}

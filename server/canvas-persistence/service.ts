import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { parseCanvasDocument } from "../../src/canvas/model.js";

const saveCanvasSchema = z.object({
  id: z.string().min(1).max(512).optional(),
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(120),
  document: z.unknown(),
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

type CanvasRow = { id: string; course_id: string; lesson_id: string; revision: number };
export type SaveCanvasInput = z.infer<typeof saveCanvasSchema>;
export type SaveCanvasResult = { status: number; body: { id?: string; revision?: number; error?: string; code?: string; currentRevision?: number } };

export class CanvasPersistenceInputError extends Error {
  constructor(message: string) { super(message); this.name = "CanvasPersistenceInputError"; }
}

export function saveCanvasDocument(database: Database.Database, value: unknown): SaveCanvasResult {
  let input: SaveCanvasInput;
  let document: ReturnType<typeof parseCanvasDocument>;
  try {
    input = saveCanvasSchema.parse(value);
    document = parseCanvasDocument(input.document);
  } catch (error) {
    throw new CanvasPersistenceInputError(error instanceof Error ? error.message : "Invalid canvas save.");
  }
  const id = input.id ?? randomUUID();
  const serialized = JSON.stringify(document);

  const save = database.transaction((): SaveCanvasResult => {
    const existing = database.prepare("SELECT id,course_id,lesson_id,revision FROM canvases WHERE id=?").get(id) as CanvasRow | undefined;
    if (existing && (existing.course_id !== input.courseId || existing.lesson_id !== input.lessonId)) {
      return { status: 409, body: { error: "Canvas belongs to another course or lesson.", code: "scope_mismatch", currentRevision: existing.revision } };
    }
    if (!database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) {
      return { status: 404, body: { error: "Lesson not found in this course.", code: "lesson_not_found" } };
    }
    if (!existing) {
      if (input.expectedRevision !== 0) return { status: 409, body: { error: "Canvas revision is stale.", code: "stale_revision", currentRevision: 0 } };
      database.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,document,revision) VALUES(?,?,?,?,?,1)")
        .run(id, input.courseId, input.lessonId, input.name, serialized);
      return { status: 200, body: { id, revision: 1 } };
    }

    if (input.expectedRevision !== existing.revision) {
      return { status: 409, body: { error: "Canvas revision is stale.", code: "stale_revision", currentRevision: existing.revision } };
    }
    const updated = database.prepare("UPDATE canvases SET name=?,document=?,revision=revision+1,updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE id=? AND course_id=? AND lesson_id=? AND revision=?")
      .run(input.name, serialized, id, input.courseId, input.lessonId, input.expectedRevision);
    if (updated.changes !== 1) {
      const current = database.prepare("SELECT revision FROM canvases WHERE id=?").get(id) as { revision: number } | undefined;
      return { status: 409, body: { error: "Canvas revision is stale.", code: "stale_revision", currentRevision: current?.revision ?? 0 } };
    }
    return { status: 200, body: { id, revision: input.expectedRevision + 1 } };
  });

  return save.immediate();
}

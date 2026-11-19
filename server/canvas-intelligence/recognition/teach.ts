import type Database from "better-sqlite3";
import { parseCanvasDocument } from "../../../src/canvas/model.js";
import { normalizeCanvasInput } from "../input.js";
import type { CanvasRecognitionPoint } from "./types.js";
import { renderStrokeGroupPng } from "./render.js";
import { normalizeRecognitionLabel } from "./feedback.js";
import { teachCanvasRecognitionExample } from "./store.js";

export type TeachCanvasRecognitionInput = {
  db: Database.Database;
  board: { boardId: string; courseId: string; lessonId: string; document: string | unknown };
  strokeIds: readonly string[];
  label: unknown;
};

export type TeachCanvasRecognitionResult = { label: string; examples: number };

const MAX_TEACH_STROKES = 32;

/** Validate and extract the persisted points for a set of freehand stroke IDs. */
export function persistedStrokePoints(board: TeachCanvasRecognitionInput["board"], strokeIds: readonly string[]): CanvasRecognitionPoint[][] {
  const ids = [...new Set(strokeIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one freehand stroke to teach.");
  if (ids.length > MAX_TEACH_STROKES) throw new Error(`At most ${MAX_TEACH_STROKES} strokes can be taught at once.`);
  let document;
  try {
    document = parseCanvasDocument(typeof board.document === "string" ? JSON.parse(board.document) : board.document);
  } catch {
    throw new Error("The persisted canvas document is invalid.");
  }
  const canvasInput = normalizeCanvasInput({
    boardId: board.boardId,
    courseId: board.courseId,
    lessonId: board.lessonId,
    snapshot: document.snapshot,
    scientificObjects: document.objects,
    selectedIds: [],
  });
  const byId = new Map(canvasInput.nativeRecords.map((record) => [record.id, record]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`Unknown canvas stroke ID: ${missing[0]}.`);
  const notInk = ids.filter((id) => !["draw", "highlight"].includes(byId.get(id)!.type));
  if (notInk.length) throw new Error(`Only freehand strokes can be taught (${notInk[0]} is not ink).`);
  const strokes: CanvasRecognitionPoint[][] = ids.map((id) => {
    const record = byId.get(id)!;
    const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
    const values = Array.isArray(geometry.points) ? geometry.points : [];
    return values.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Record<string, unknown>;
      return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y)
        ? [{ x: point.x, y: point.y }]
        : [];
    });
  });
  if (!strokes.some((stroke) => stroke.length)) throw new Error("The selected strokes have no usable points.");
  return strokes;
}

/**
 * Teach one stroke group using the persisted board as the source of truth.
 * The server renders the same deterministic raster used for recognition queries,
 * so a taught example cannot diverge from the query preprocessing.
 */
export async function teachCanvasRecognitionFromStrokes(input: TeachCanvasRecognitionInput): Promise<TeachCanvasRecognitionResult> {
  const label = normalizeRecognitionLabel(input.label);
  if (!label) throw new Error("A non-empty label is required.");
  const strokes = persistedStrokePoints(input.board, input.strokeIds);
  const rendered = await renderStrokeGroupPng(strokes.filter((stroke) => stroke.length));
  const saved = await teachCanvasRecognitionExample(input.db, { courseId: input.board.courseId, label, pngBase64: rendered.pngBase64 });
  return { label: saved.label, examples: saved.examples };
}

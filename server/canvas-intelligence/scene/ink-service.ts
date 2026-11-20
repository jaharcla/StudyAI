import type Database from "better-sqlite3";
import { z } from "zod";
import type { CanvasInkItem } from "../../../src/canvas/ai/scene-tools.js";
import { parseCanvasDocument } from "../../../src/canvas/model.js";
import { currentCanvasRevision } from "../../canvas-analysis/contract.js";
import { normalizeCanvasInput } from "../input.js";
import { canvasOCR } from "../groq.js";
import { persistedStrokePoints } from "../recognition/teach.js";
import { renderStrokeGroupPng } from "../recognition/render.js";
import { recognizeCanvasStrokes } from "../recognition/index.js";
import type { OCRResult } from "../types.js";
import { buildCanvasScene, CanvasSceneError } from "./service.js";
import { loadCanvasSceneGraph, saveCanvasSceneGraph } from "./store.js";
import { mergeInkEvidence } from "./ink.js";

const InkReadSchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  expectedRevision: z.number().int().nonnegative(),
  groupIds: z.array(z.string().min(1).max(512)).min(1).max(8),
  profile: z.enum(["auto", "math", "diagram"]).optional(),
}).strict();

export type CanvasInkReadInput = z.infer<typeof InkReadSchema>;

export type CanvasInkDeps = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  allowImageEgress?: boolean;
  ocr?: (input: Parameters<typeof canvasOCR>[0]) => Promise<OCRResult>;
  recognize?: typeof recognizeCanvasStrokes;
};

type CanvasRow = { boardId: string; courseId: string; lessonId: string; revision: number; document: string };

function groupIdOf(nodeId: string): string {
  return nodeId;
}

export async function readCanvasInk(
  database: Database.Database,
  boardId: string,
  input: unknown,
  deps: CanvasInkDeps = {},
): Promise<{ revisionHash: string; items: CanvasInkItem[]; warnings: string[] }> {
  const request = InkReadSchema.parse(input);
  const row = database.prepare("SELECT id AS boardId,course_id AS courseId,lesson_id AS lessonId,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(boardId, request.courseId, request.lessonId) as CanvasRow | undefined;
  if (!row) throw new CanvasSceneError("scope_mismatch", "No canvas exists for this board, course, and lesson.", 404);
  if (row.revision !== request.expectedRevision) throw new CanvasSceneError("stale_revision", "The persisted board revision changed. Reload the board and try again.", 409);
  let document;
  try {
    document = parseCanvasDocument(typeof row.document === "string" ? JSON.parse(row.document) : row.document);
  } catch {
    throw new CanvasSceneError("invalid_request", "The persisted canvas document is invalid.", 400);
  }
  const current = currentCanvasRevision(row);
  const canvasInput = normalizeCanvasInput({ boardId: row.boardId, courseId: row.courseId, lessonId: row.lessonId, snapshot: document.snapshot, scientificObjects: document.objects, selectedIds: [] });
  const loaded = loadCanvasSceneGraph(database, boardId, current.revisionHash);
  const graph = loaded ?? (await buildCanvasScene(database, boardId, { courseId: request.courseId, lessonId: request.lessonId, expectedRevision: request.expectedRevision })).scene;

  const pureInk = canvasInput.scientificObjects.length === 0 && canvasInput.nativeRecords.length > 0
    && canvasInput.nativeRecords.every((record) => record.type === "draw" || record.type === "highlight");
  const profile = request.profile && request.profile !== "auto" ? request.profile : pureInk ? "math" : "diagram";
  const minConfidence = Number(process.env.CANVAS_INK_MIN_CONFIDENCE || 0.55);
  const warnings: string[] = [];
  const items: CanvasInkItem[] = [];
  const resolve = deps.ocr ?? canvasOCR;

  for (const nodeId of request.groupIds) {
    const group = graph.nodes.find((node) => node.id === nodeId);
    if (!group || group.kind !== "stroke-group") {
      warnings.push(`${nodeId} is not a freehand group.`);
      continue;
    }
    const recognises = graph.edges.filter((edge) => edge.kind === "recognizes" && edge.to === group.id);
    const confirmed = recognises
      .map((edge) => graph.nodes.find((node) => node.id === edge.from))
      .find((node) => node?.verificationStatus === "confirmed" && node.text);
    if (confirmed?.text) {
      items.push({ groupId: groupIdOf(group.id), text: confirmed.text, format: "text", confidence: confirmed.confidence, source: "user", confirmed: true });
      continue;
    }
    const candidate = recognises
      .map((edge) => graph.nodes.find((node) => node.id === edge.from))
      .filter((node) => node?.kind === "recognition-candidate" && node.verificationStatus === "unconfirmed" && (node.confidence ?? 0) >= minConfidence)
      .sort((left, right) => (right?.confidence ?? 0) - (left?.confidence ?? 0))[0];
    if (candidate?.text) {
      items.push({ groupId: group.id, text: candidate.text, format: "text", confidence: candidate.confidence, source: "recognition", confirmed: false });
      continue;
    }
    const storedOcr = recognises
      .map((edge) => graph.nodes.find((node) => node.id === edge.from))
      .filter((node) => node?.kind === "ocr-item" && node.text && (node.confidence ?? 0) >= minConfidence)
      .sort((left, right) => (right?.confidence ?? 0) - (left?.confidence ?? 0))[0];
    if (storedOcr?.text) {
      items.push({
        groupId: group.id,
        text: storedOcr.text,
        format: storedOcr.recordType === "latex" ? "latex" : "text",
        confidence: storedOcr.confidence,
        source: "ocr",
        confirmed: false,
      });
      continue;
    }

    const strokeIds = graph.edges.filter((edge) => edge.kind === "contains" && edge.from === group.id && edge.to.startsWith("q:")).map((edge) => edge.to.slice(2));
    if (!strokeIds.length) {
      warnings.push(`No source strokes are available for ${group.id}.`);
      continue;
    }
    try {
      const strokes = persistedStrokePoints(
        { boardId: row.boardId, courseId: row.courseId, lessonId: row.lessonId, document },
        strokeIds,
      ).filter((stroke) => stroke.length > 0);
      if (!strokes.length) {
        warnings.push(`No usable stroke points are available for ${group.id}.`);
        continue;
      }
      const rendered = await renderStrokeGroupPng(strokes, { size: 448 });
      const result = await resolve({
        base64: rendered.pngBase64,
        mimeType: "image/png",
        profile,
        allowImageEgress: deps.allowImageEgress,
        fetcher: deps.fetcher,
        signal: deps.signal,
      });
      const ocrItems = result.items.slice(0, 4);
      if (!ocrItems.length) {
        warnings.push(`No confident transcription for ${group.id}.`);
        items.push({ groupId: group.id, text: "", format: profile === "math" ? "latex" : "text", confidence: null, source: "ocr", confirmed: false });
        continue;
      }
      for (const item of ocrItems) {
        items.push({
          groupId: group.id,
          text: item.text.slice(0, 2000),
          format: profile === "math" ? "latex" : "text",
          confidence: item.confidence,
          source: "ocr",
          confirmed: false,
        });
      }
    } catch (error) {
      if (deps.signal?.aborted) throw error;
      warnings.push(`Ink transcription failed for ${group.id}: ${error instanceof Error ? error.message : "provider failed"}.`);
      items.push({ groupId: group.id, text: "", format: profile === "math" ? "latex" : "text", confidence: null, source: "ocr", confirmed: false });
    }
  }

  if (items.some((item) => item.source === "ocr" && item.text)) {
    const merged = mergeInkEvidence(graph, items.filter((item) => item.source === "ocr" && item.text));
    saveCanvasSceneGraph(database, merged);
  }
  return { revisionHash: current.revisionHash, items, warnings };
}

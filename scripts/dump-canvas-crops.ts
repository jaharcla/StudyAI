import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { groupQuickdrawStrokes } from "../server/canvas-intelligence/regions.js";
import { clampOCRRegionLimit, planCanvasOCRCrops, selectCanvasOCRGroups } from "../src/canvas/ocr-regions.js";
import { renderStrokeGroupPng } from "../server/canvas-intelligence/recognition/render.js";

// Renders the exact same OCR crops the canvas benchmark feeds to the provider chain,
// so non-HTTP OCR tools (Tesseract, Docling) can be scored on identical pixels.
const dbPath = process.env.STUDYAI_BENCHMARK_DB ?? "data/canvas-dataset-benchmark/studyai.sqlite";
const truthPath = "data/canvas-dataset-benchmark/scoring/ground-truth.json";
const outDir = "data/canvas-benchmark/model-comparison/crops";

type Truth = { mathWriting: Array<{ boardId: string; normalizedLabel: string }>; physAlign: { boardId: string; expectedReading: string } };
type BoardRow = { id: string; course_id: string; lesson_id: string; name: string; revision: number; document: string };

const db = new Database(dbPath, { readonly: true });
const boards = db.prepare("SELECT id,course_id,lesson_id,name,revision,document FROM canvases ORDER BY name").all() as BoardRow[];
db.close();
const truth = JSON.parse(readFileSync(truthPath, "utf8")) as Truth;

const expectedFor = (boardId: string) =>
  truth.mathWriting.find((item) => item.boardId === boardId)?.normalizedLabel ??
  (truth.physAlign.boardId === boardId ? truth.physAlign.expectedReading : "");

mkdirSync(outDir, { recursive: true });
const manifest: Array<{ boardId: string; name: string; expected: string; crops: Array<{ path: string; width: number; height: number }> }> = [];

for (const board of boards) {
  const document = JSON.parse(board.document) as { snapshot: unknown; objects: unknown[] };
  const input = normalizeCanvasInput({ boardId: board.id, courseId: board.course_id, lessonId: board.lesson_id, snapshot: document.snapshot, scientificObjects: document.objects, selectedIds: [] });
  const points = new Map<string, Array<{ x: number; y: number }>>();
  for (const record of input.nativeRecords) {
    const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
    const values = Array.isArray(geometry.points) ? geometry.points : [];
    const parsed = values.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Record<string, unknown>;
      return typeof point.x === "number" && typeof point.y === "number" ? [{ x: point.x, y: point.y }] : [];
    });
    if (parsed.length) points.set(record.id, parsed);
  }
  const records = input.nativeRecords.filter((record) => record.type === "draw" || record.type === "highlight").map((record) => ({ id: record.id, type: record.type, bounds: record.bounds, points: points.get(record.id) ?? [] }));
  const groups = groupQuickdrawStrokes(input);
  const relevanceBounds = [
    ...input.nativeRecords.filter((record) => record.bounds && record.type !== "draw" && record.type !== "highlight").map((record) => record.bounds!),
    ...input.scientificObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height })),
  ];
  const selection = selectCanvasOCRGroups(groups, { records, relevanceBounds, selectedIds: [], limit: clampOCRRegionLimit(process.env.CANVAS_OCR_MAX_REGIONS) });
  const crops: Array<{ path: string; width: number; height: number }> = [];
  let index = 0;
  for (const plan of planCanvasOCRCrops(selection.selected, { padding: 12, pixelsPerWorld: 2 })) {
    const strokes = plan.sourceIds.map((id) => points.get(id) ?? []).filter((stroke) => stroke.length > 0);
    if (!strokes.length) continue;
    const rendered = await renderStrokeGroupPng(strokes, { size: 448 });
    const file = `${outDir}/${board.id}-${index++}.png`;
    writeFileSync(file, Buffer.from(rendered.pngBase64, "base64"));
    crops.push({ path: file, width: rendered.width, height: rendered.height });
  }
  manifest.push({ boardId: board.id, name: board.name, expected: expectedFor(board.id), crops });
  console.log(`${board.name}: ${crops.length} crop(s)`);
}

writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`manifest written to ${outDir}/manifest.json`);

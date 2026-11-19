import "dotenv/config";
import Database from "better-sqlite3";
import { parseCanvasDocument } from "../src/canvas/model.js";
import { ClipCanvasRecognitionAdapter, loadClipRuntime } from "../server/canvas-intelligence/recognition/clip.js";
import {
  calibrationGrid,
  recommendThresholds,
  sweepThresholdGrid,
  type RecognitionCalibrationSample,
  type ThresholdCell,
} from "../server/canvas-intelligence/recognition/calibration.js";
import { recognitionGroupKey } from "../server/canvas-intelligence/recognition/feedback.js";
import { renderStrokeGroupPng } from "../server/canvas-intelligence/recognition/render.js";
import { listCanvasRecognitionPrototypes } from "../server/canvas-intelligence/recognition/store.js";
import { persistedStrokePoints } from "../server/canvas-intelligence/recognition/teach.js";
import { RECOGNITION_LIMITS, type CanvasRecognitionPoint } from "../server/canvas-intelligence/recognition/types.js";

// Replays every recorded teach/accept/correct/dismiss decision through the CLIP
// adapter at confidence 0 / margin 0, then sweeps CANVAS_RECOGNITION_MIN_CONFIDENCE
// and CANVAS_RECOGNITION_MIN_MARGIN over the recorded outcomes. Report-only: the
// defaults in recognition/types.ts change only when this script shows a win.
// The DB is opened read-write because the reused recognition helpers run their
// idempotent `CREATE TABLE IF NOT EXISTS` schema init; no decision or embedding
// row is ever written by this script. fileMustExist stops a typo creating a DB.
const dbPath = (process.argv.find((arg) => arg.startsWith("--db="))?.slice(5)) || process.env.STUDYAI_DB || "data/studyai.sqlite";
const courseFilter = process.argv.find((arg) => arg.startsWith("--course="))?.slice(9) || "";

type FeedbackRow = { course_id: string; board_id: string; group_key: string; decision: string; label: string | null; source_ids: string };
type BoardRow = { id: string; course_id: string; lesson_id: string; document: string };

const db = new Database(dbPath, { fileMustExist: true });
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => (row as { name: string }).name));
if (!tables.has("canvas_recognition_feedback") || !tables.has("canvases")) {
  console.log(`${dbPath} has no recognition feedback yet; nothing to calibrate. Defaults unchanged.`);
  db.close();
  process.exit(0);
}
const rows = db.prepare("SELECT course_id,board_id,group_key,decision,label,source_ids FROM canvas_recognition_feedback ORDER BY course_id,board_id,group_key").all() as FeedbackRow[];
const selected = courseFilter ? rows.filter((row) => row.course_id === courseFilter) : rows;
const rowsByBoard = new Map<string, FeedbackRow[]>();
for (const row of selected) rowsByBoard.set(`${row.course_id}\u0000${row.board_id}`, [...rowsByBoard.get(`${row.course_id}\u0000${row.board_id}`) ?? [], row]);

const boardStatement = db.prepare("SELECT id,course_id,lesson_id,document FROM canvases WHERE id=?");
const prototypesByCourse = new Map<string, Record<string, number[][]>>();
const samples: RecognitionCalibrationSample[] = [];
const skipped: Array<{ boardId: string; reason: string }> = [];
let boardsRead = 0;

if (rowsByBoard.size) {
  const started = performance.now();
  await loadClipRuntime();
  console.log(`CLIP runtime ready in ${(performance.now() - started).toFixed(0)} ms; prototypes probe uses ${RECOGNITION_LIMITS.maxLabels} labels.`);
}

for (const [key, boardRows] of rowsByBoard) {
  const [courseId, boardId] = key.split("\u0000");
  const board = boardStatement.get(boardId) as BoardRow | undefined;
  if (!board) {
    skipped.push({ boardId, reason: "board no longer exists" });
    continue;
  }
  boardsRead++;
  if (!prototypesByCourse.has(courseId)) prototypesByCourse.set(courseId, listCanvasRecognitionPrototypes(db, courseId));
  const prototypes = prototypesByCourse.get(courseId)!;

  const replayable = boardRows.flatMap((row) => {
    const sourceIds = row.source_ids ? (JSON.parse(row.source_ids) as unknown) : [];
    const ids = Array.isArray(sourceIds) ? sourceIds.filter((id): id is string => typeof id === "string") : [];
    if (ids.length !== (Array.isArray(sourceIds) ? sourceIds.length : 0) || !ids.length) {
      skipped.push({ boardId, reason: `unreadable source IDs for group ${row.group_key.slice(0, 40)}` });
      return [];
    }
    let strokes: CanvasRecognitionPoint[][];
    try {
      const parsed = parseCanvasDocument(JSON.parse(board.document));
      strokes = persistedStrokePoints({ boardId, courseId, lessonId: board.lesson_id, document: parsed }, ids);
    } catch (error) {
      skipped.push({ boardId, reason: error instanceof Error ? error.message : "unreadable strokes" });
      return [];
    }
    return [{ row, ids, strokes: strokes.filter((stroke) => stroke.length > 0) }];
  });
  if (!replayable.length) continue;

  const records = replayable.filter(({ row }) => {
    if (row.decision === "accept" || row.decision === "correct" || row.decision === "reject") return true;
    skipped.push({ boardId, reason: `unknown decision ${row.decision}` });
    return false;
  });
  if (!records.length) continue;
  const adapter = new ClipCanvasRecognitionAdapter({ prototypes, minConfidence: 0, minMargin: 0, maxCandidates: 2 });
  const inputs = await Promise.all(records.map(async ({ ids, strokes }) => {
    const points = strokes.flat();
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const rendered = await renderStrokeGroupPng(strokes);
    return { groupId: recognitionGroupKey(ids), sourceIds: ids, bounds, points, strokes, pngBase64: rendered.pngBase64, pngWidth: rendered.width, pngHeight: rendered.height };
  }));
  const results = await adapter.recognize(inputs);
  if (results.length !== records.length) throw new Error(`CLIP returned ${results.length} results for ${records.length} groups.`);
  records.forEach(({ row }, index) => {
    const top = results[index].candidates[0];
    if (!top) {
      skipped.push({ boardId, reason: "CLIP offered no candidate at confidence 0" });
      return;
    }
    samples.push({
      decision: row.decision as RecognitionCalibrationSample["decision"],
      label: row.label,
      topLabel: top.label,
      topProbability: top.confidence,
      secondProbability: results[index].candidates[1]?.confidence ?? 0,
    });
  });
}

const current = { minConfidence: RECOGNITION_LIMITS.minConfidence, minMargin: RECOGNITION_LIMITS.minMargin };

console.log(`\nDatabase: ${dbPath}${courseFilter ? ` (course ${courseFilter})` : ""}`);
console.log(`Boards read: ${boardsRead}; recorded decisions: ${selected.length}; replayed samples: ${samples.length}`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} decision(s):`);
  for (const item of skipped.slice(0, 10)) console.log(`  - ${item.boardId}: ${item.reason}`);
}
if (!samples.length) {
  console.log("\nNo recorded teach/accept/correct/dismiss decisions are available, so no threshold sweep exists.");
  console.log(`Defaults stay at minConfidence=${current.minConfidence}, minMargin=${current.minMargin}.`);
  console.log("Record decisions through the canvas Labels panel, then re-run this script.");
  db.close();
  process.exit(0);
}

const counts = { accept: 0, correct: 0, reject: 0 };
for (const sample of samples) counts[sample.decision]++;
const grid = calibrationGrid();
const cells = sweepThresholdGrid(samples, grid.confidenceValues, grid.marginValues);
const recommendation = recommendThresholds(samples, cells, current);
console.log(`Decision mix: accept ${counts.accept}, correct ${counts.correct}, dismiss ${counts.reject}.`);
console.log("\nbalanced = accept coverage - false-offer rate (rows: minConfidence, columns: minMargin)\n");
const marginSteps = [0, 0.03, 0.05, 0.1, 0.15, 0.2];
const confidenceSteps = [0, 0.05, 0.1, 0.15, 0.18, 0.2, 0.25, 0.3, 0.4, 0.5];
console.log(["conf\\margin", ...marginSteps.map((margin) => margin.toFixed(2))].map((value) => value.padStart(10)).join(""));
for (const confidence of confidenceSteps) {
  const row = marginSteps.map((margin) => {
    const cell = cells.find((item) => item.minConfidence === confidence && item.minMargin === margin);
    return (cell ? cell.balanced.toFixed(3) : "-").padStart(10);
  });
  console.log([confidence.toFixed(2).padStart(10), ...row].join(""));
}

const format = (cell: ThresholdCell | null) => cell
  ? `minConfidence=${cell.minConfidence} minMargin=${cell.minMargin} -> coverage ${cell.coverage.toFixed(3)} (${cell.agreements}/${cell.positives} label matches), false-offer ${cell.falseOfferRate.toFixed(3)} of ${cell.negatives}, balanced ${cell.balanced.toFixed(3)}`
  : "n/a";
console.log(`\nCurrent defaults: ${format(recommendation.current)}`);
console.log(`Best grid cell:   ${format(recommendation.best)}`);
console.log(`\nRecommendation: ${recommendation.changed ? "CHANGE" : "KEEP"} — ${recommendation.reason}`);
if (recommendation.changed) console.log("Update RECOGNITION_LIMITS in server/canvas-intelligence/recognition/types.ts and re-run the canvas benchmark before committing.");
db.close();

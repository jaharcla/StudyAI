import "dotenv/config";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCanvasScene, queryCanvasScene, queryCourseCanvasScene } from "../server/canvas-intelligence/scene/service.js";

const sourcePath = process.env.STUDYAI_BENCHMARK_DB ?? "data/canvas-dataset-benchmark/studyai.sqlite";
const QUERY_ITERATIONS = Number(process.env.CANVAS_SCENE_QUERY_ITERATIONS ?? 1000);

type BoardRow = { id: string; course_id: string; lesson_id: string; name: string; revision: number; document: string };

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

const directory = mkdtempSync(join(tmpdir(), "studyai-scene-benchmark-"));
const copyPath = join(directory, "studyai.sqlite");

// Measure on a throwaway copy so the persisted benchmark database is never mutated.
const source = new Database(sourcePath, { readonly: true });
source.exec(`VACUUM INTO '${copyPath.replaceAll("'", "''")}'`);
source.close();
const db = new Database(copyPath);

const boards = db.prepare("SELECT id,course_id,lesson_id,name,revision,document FROM canvases ORDER BY name").all() as BoardRow[];
console.log(`boards: ${boards.length}`);

const queries = ["spring", "wall", "axis", "graph", "fraction", "integral", "sum", "logistic", "derivative", "slope", "force", "label"];
const queryLatencies: number[] = [];
const courseLatencies: number[] = [];
const buildLatencies: number[] = [];
const revisionHashes = new Map<string, string>();

for (const board of boards) {
  const started = performance.now();
  const built = await buildCanvasScene(db, board.id, { courseId: board.course_id, lessonId: board.lesson_id, expectedRevision: board.revision });
  buildLatencies.push(performance.now() - started);
  revisionHashes.set(board.id, built.scene.revisionHash);
  console.log(`${board.name}: build ${(performance.now() - started).toFixed(1)} ms, ${built.scene.nodes.length} nodes, ${built.scene.edges.length} edges, recognition ${built.scene.nodes.filter((node) => node.kind === "recognition-candidate").length}`);
}

for (let index = 0; index < QUERY_ITERATIONS; index += 1) {
  const board = boards[index % boards.length];
  const revisionHash = revisionHashes.get(board.id);
  if (!revisionHash) throw new Error(`no persisted scene for ${board.id}`);
  const query = `${queries[index % queries.length]} ${queries[(index * 5 + 3) % queries.length]}`;
  const started = performance.now();
  queryCanvasScene(db, board.id, { courseId: board.course_id, lessonId: board.lesson_id, revisionHash, query, limit: 8 });
  queryLatencies.push(performance.now() - started);

  const courseStarted = performance.now();
  queryCourseCanvasScene(db, board.course_id, { courseId: board.course_id, query: queries[index % queries.length], limit: 8 });
  courseLatencies.push(performance.now() - courseStarted);
}

db.close();
rmSync(directory, { recursive: true, force: true });

function report(label: string, values: number[]) {
  const rounded = values.map((value) => Number(value.toFixed(2)));
  console.log(`${label}: n=${values.length} p50=${percentile(rounded, 0.5)} ms p95=${percentile(rounded, 0.95)} ms p99=${percentile(rounded, 0.99)} ms max=${Math.max(...rounded)} ms`);
}

report("scene build (uncached)", buildLatencies);
report("cached scene query", queryLatencies);
report("cached course scene query", courseLatencies);

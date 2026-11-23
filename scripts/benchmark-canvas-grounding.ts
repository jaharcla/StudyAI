/**
 * Measures the seam between the canvas and course retrieval. No provider call, no model, no cost:
 * it drives the real intent gate and the real FTS5 bm25 index that the Tutor uses.
 *
 *   npx tsx scripts/benchmark-canvas-grounding.ts
 *
 * gate            does shouldRetrieveCourseDocuments() let the question reach course retrieval at all
 * reach           does searchDocuments(utterance) return the one passage that answers it
 * board-informed  same, but with the board's own terms appended to the query
 *
 * reach is the baseline and the bug list. The gap between board-informed reach and 1.0 is the
 * evidence for or against a semantic adapter, per ADR-2026-11-18-spatial-canvas-scene.md.
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { getDocumentLocation, importDocuments, searchDocuments } from "../server/document-intelligence/service.js";
import { shouldRetrieveCourseDocuments } from "../server/tutor-retrieval-policy.js";
import { groundingCases } from "../tests/fixtures/canvas-course-grounding.js";

const COURSE = "phys-210";
const root = mkdtempSync(join(tmpdir(), "studyai-grounding-"));
const db = new Database(join(root, "grounding.sqlite"));
db.exec("CREATE TABLE courses(id TEXT PRIMARY KEY, title TEXT, code TEXT, color TEXT)");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run(COURSE, "Physics", "PHYS", "#fff");
initializeDocumentIntelligenceSchema(db);

const norm = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
const imported = await importDocuments(db, COURSE, groundingCases.map((item) => ({
  name: item.lecture.filename,
  bytes: new TextEncoder().encode(item.lecture.text),
})), join(root, "files"));
if (imported.length !== groundingCases.length) throw new Error(`expected ${groundingCases.length} documents, indexed ${imported.length}`);

const chunks = db.prepare("SELECT c.id AS id, c.content AS content FROM di_chunks c JOIN di_documents d ON d.id=c.document_id WHERE c.course_id=?").all(COURSE) as Array<{ id: string; content: string }>;
for (const item of groundingCases.filter((entry) => entry.needle)) {
  const holders = chunks.filter((chunk) => norm(chunk.content).includes(norm(item.needle))).length;
  if (holders !== 1) throw new Error(`case ${item.id}: needle "${item.needle}" appears in ${holders} chunks, expected exactly 1 — the corpus is not measuring what it claims`);
}

function reaches(query: string, needle: string) {
  return searchDocuments(db, COURSE, query).some((result) => {
    const located = getDocumentLocation(db, result.sourceRef, COURSE);
    return located !== undefined && norm(located.content).includes(norm(needle));
  });
}

const rows = groundingCases.map((item) => {
  const gate = shouldRetrieveCourseDocuments(item.utterance);
  const boardQuery = `${item.utterance} ${item.board.join(" ")}`;
  return {
    ...item,
    gate,
    gateCorrect: gate === item.expectGate,
    reach: item.needle ? (gate ? reaches(item.utterance, item.needle) : null) : null,
    boardReach: item.needle ? reaches(boardQuery, item.needle) : null,
    topHit: item.needle ? searchDocuments(db, COURSE, item.utterance)[0]?.title ?? "(nothing)" : "-",
  };
});

const pad = (value: string, width: number) => (value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width));
console.log(`${pad("case", 28)}${pad("gate", 7)}${pad("reach", 8)}${pad("board", 8)}why`);
console.log("-".repeat(100));
for (const row of rows) {
  console.log(
    `${pad(row.id, 28)}${pad(row.gate ? "yes" : "NO", 7)}${pad(row.reach === null ? (row.gate ? "no" : "n/a") : row.reach ? "yes" : "no", 8)}${pad(row.boardReach === null ? "n/a" : row.boardReach ? "yes" : "no", 8)}${row.gate === row.expectGate ? row.why : `INTENDED gate=${row.expectGate ? "yes" : "no"}; ${row.why}`}`,
  );
}

const canvas = rows.filter((row) => row.needle && !row.id.startsWith("control-"));
const controls = rows.filter((row) => !row.needle);
const allowed = canvas.filter((row) => row.gate);
console.log(`${canvas.length} questions about something drawn, ${controls.length} controls that ask nothing`);
console.log(`gate:   ${allowed.length}/${canvas.length} reach course retrieval at all`);
console.log(`reach:  ${canvas.filter((row) => row.reach).length}/${canvas.length} return the passage that answers them from the utterance alone`);
console.log(`board-informed: ${canvas.filter((row) => row.boardReach).length}/${canvas.length} return it when the board's own terms are added`);
console.log(`controls: ${controls.every((row) => row.gate === row.expectGate) ? "ask-nothing cases still declined, description case now prefetched as intended" : "UNEXPECTED — " + controls.filter((row) => row.gate !== row.expectGate).map((row) => row.id).join(", ")}`);

db.close();
rmSync(root, { recursive: true, force: true });

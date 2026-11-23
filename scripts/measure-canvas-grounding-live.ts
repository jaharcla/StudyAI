/**
 * Measures the free version: does the tutor model, shown the question and the board, author a
 * retrieval query that reaches the passage that answers it?
 *
 *   npx tsx scripts/measure-canvas-grounding-live.ts [--repeats 2]
 *
 * This spends Groq calls — one per case per repeat, on the model in GROQ_MODEL. It measures query
 * authoring, not the whole agent graph: the same judgement the tutor makes when it decides to call
 * search_course_documents, run against the real FTS5 index and the corpus in
 * tests/fixtures/canvas-course-grounding.ts.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { getDocumentLocation, importDocuments, searchDocuments } from "../server/document-intelligence/service.js";
import { groundingCases } from "../tests/fixtures/canvas-course-grounding.js";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) throw new Error("GROQ_API_KEY is required for the live measurement");
const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const repeats = Number(process.argv.find((arg) => arg.startsWith("--repeats="))?.split("=")[1] ?? 2);
const COURSE = "phys-210";

const root = mkdtempSync(join(tmpdir(), "studyai-grounding-live-"));
const db = new Database(join(root, "grounding.sqlite"));
db.exec("CREATE TABLE courses(id TEXT PRIMARY KEY, title TEXT, code TEXT, color TEXT)");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run(COURSE, "Physics", "PHYS", "#fff");
initializeDocumentIntelligenceSchema(db);
await importDocuments(db, COURSE, groundingCases.map((item) => ({ name: item.lecture.filename, bytes: new TextEncoder().encode(item.lecture.text) })), join(root, "files"));

const norm = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
const reaches = (query: string, needle: string) => query.trim().length > 0
  && searchDocuments(db, COURSE, query).some((result) => norm(getDocumentLocation(db, result.sourceRef, COURSE)?.content ?? "").includes(norm(needle)));

const SYSTEM = "You are a tutor answering a student who has drawn something. Decide for yourself whether the question needs the student's course material, and if so write one keyword query to search their lecture notes. Reply only with JSON {\"search\": true or false, \"query\": \"keywords\"}.";

async function ask(caseItem: (typeof groundingCases)[number]): Promise<{ search: boolean; query: string; tokens: number }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model, temperature: 0, max_completion_tokens: 300, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `The student asks: "${caseItem.utterance}"\n\nWhat is on their board: ${caseItem.board.join(", ")}.` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { completion_tokens?: number; prompt_tokens?: number } };
  const content = payload.choices?.[0]?.message?.content ?? "";
  let parsed: { search?: unknown; query?: unknown } = {};
  try { parsed = JSON.parse(content); } catch { /* counted as a miss below */ }
  return {
    search: parsed.search === true,
    query: typeof parsed.query === "string" ? parsed.query : "",
    tokens: (payload.usage?.prompt_tokens ?? 0) + (payload.usage?.completion_tokens ?? 0),
  };
}

const cases = groundingCases.filter((item) => item.needle && !item.id.startsWith("control-"));
const perCase = new Map<string, { hits: number; tries: number; queries: string[]; tokens: number }>();
for (const item of cases) perCase.set(item.id, { hits: 0, tries: 0, queries: [], tokens: 0 });

for (let pass = 0; pass < repeats; pass++) {
  for (const item of cases) {
    const entry = perCase.get(item.id)!;
    const answer = await ask(item);
    entry.tries++;
    entry.tokens += answer.tokens;
    entry.queries.push(answer.search ? answer.query : "(declined to search)");
    if (answer.search && reaches(answer.query, item.needle)) entry.hits++;
  }
}

console.log(`model: ${model}   repeats: ${repeats}\n`);
for (const item of cases) {
  const entry = perCase.get(item.id)!;
  console.log(`${item.id.padEnd(24)} ${entry.hits}/${entry.tries} reached "${item.needle}"`);
  for (const query of entry.queries) console.log(`    query: ${query}`);
}
const hits = [...perCase.values()].reduce((sum, entry) => sum + entry.hits, 0);
const tries = [...perCase.values()].reduce((sum, entry) => sum + entry.tries, 0);
const tokens = [...perCase.values()].reduce((sum, entry) => sum + entry.tokens, 0);
console.log(`\nmodel-authored reach: ${hits}/${tries} (${Math.round((hits / tries) * 100)}%)`);
console.log(`tokens used: ${tokens} — ${tries} calls`);

db.close();
rmSync(root, { recursive: true, force: true });

import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { extname, basename, resolve, sep } from "node:path";
import { db } from "./db.js";
import { createDocumentIntelligenceHandler } from "./document-intelligence/http.js";
import { reconcileDocumentFiles } from "./document-intelligence/service.js";
import { parseCanvasDocument } from "../src/canvas/model.js";
import { initializeDocumentIntelligenceSchema } from "./document-intelligence/schema.js";
import { migrateLegacyDocuments } from "./document-intelligence/legacy.js";
import { getStudyAIConfig, LOOPBACK_HOST, rejectUntrustedRequest } from "./config.js";
export { rejectUntrustedRequest } from "./config.js";
import { getModelStatus } from "./models.js";
import { LearningService } from "./learning/service.js";
import { getCourseProgress } from "./progress.js";
import { getRecommendations } from "./recommendations.js";
import { buildDailyPlan } from "./daily-plans.js";
import { buildConceptGraph } from "./concept-graph.js";
import { createLearningHandler } from "./learning/http.js";
import { createStudioHandler } from "./studio/http.js";
import { createSlideDeckHandler } from "./presentations/http.js";
import { renderLocalDeck } from "./presentations/local-renderer.js";
import { artifactDataDir } from "./presentations/paths.js";
import { extractDocument } from "./document-intelligence/extract.js";
import { initializeStudioSchema } from "./studio/schema.js";
import { LearningActivityService } from "./learning/activities/service.js";
import { createLearningActivityHandler } from "./learning/activities/http.js";
import { createCanvasAnalysisHandler } from "./canvas-analysis/http.js";
import { initializeCanvasAnalysisStorage } from "./canvas-analysis/storage.js";
import { createCanvasAnalysisProducerHandler } from "./canvas-analysis/producer.js";
import { createCanvasPersistenceHandler } from "./canvas-persistence/http.js";
import { createCanvasSceneHandler } from "./canvas-intelligence/scene/http.js";
import { createCanvasRecognitionHandler } from "./canvas-intelligence/recognition/http.js";
import { warmClipRuntime } from "./canvas-intelligence/recognition/clip.js";
import { countCanvasRecognitionExamples, teachCanvasRecognitionExample } from "./canvas-intelligence/recognition/store.js";
import { providerBudgetSnapshot, configureProviderBudgetDatabase } from "./canvas-intelligence/provider-budget.js";
import { configureProviderUsageDatabase, persistedProviderUsageSnapshot, providerCircuitSnapshot } from "./canvas-intelligence/provider-usage.js";
import { providerChain, resolveCompletionProviders, resolveVisionProviders } from "./canvas-intelligence/providers.js";
import { isImageEgressAllowed } from "./canvas-intelligence/groq.js";
import { tutorProviderStatus } from "./tutor-provider.js";
import { handleMathRequest } from "./math/http.js";

const config = getStudyAIConfig();
const port = config.dataPort;
const allowedHosts = new Set([`${LOOPBACK_HOST}:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set(config.allowedOrigins);
const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);
export function resolveAllowedOrigin(reqOrOrigin: import("node:http").IncomingMessage | string | undefined): string {
  const candidate = typeof reqOrOrigin === "string" ? reqOrOrigin : reqOrOrigin?.headers?.origin;
  if (candidate && allowedOrigins.has(candidate)) return candidate;
  return config.webOrigin;
}
// rejectUntrustedRequest imported from ./config.js
configureProviderBudgetDatabase(db);
configureProviderUsageDatabase(db);
initializeDocumentIntelligenceSchema(db);
await reconcileDocumentFiles(db, process.env.STUDYAI_DOCUMENTS);
initializeStudioSchema(db);
initializeCanvasAnalysisStorage(db);
const legacyDocuments = await migrateLegacyDocuments(db);
if (legacyDocuments.failures.length) console.warn("Legacy document indexing failures:", legacyDocuments.failures);
const requestOrigins = new WeakMap<import("node:http").ServerResponse, string>();
const json = (res: import("node:http").ServerResponse, status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": requestOrigins.get(res) ?? config.webOrigin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" }); res.end(JSON.stringify(data)); };
const documentHandler = createDocumentIntelligenceHandler(db, process.env.STUDYAI_DOCUMENTS);
const learningService = new LearningService(db);
const learningHandler = createLearningHandler(learningService, resolveAllowedOrigin);
const studioHandler = createStudioHandler(db, learningService, resolveAllowedOrigin);
const artifactsDir = artifactDataDir();
const slideDeckHandler = createSlideDeckHandler(db, {
  renderer: (request) => renderLocalDeck(request, { outputDir: artifactsDir }),
  readDeckText: async (pptxPath) => {
    const bytes = await readFile(resolve(artifactsDir, pptxPath));
    const document = await extractDocument("deck.pptx", new Uint8Array(bytes));
    return document.units.map((unit) => unit.text).join("\n");
  },
}, resolveAllowedOrigin, artifactsDir);
const activityService = new LearningActivityService(db, learningService);
const activityHandler = createLearningActivityHandler(activityService, resolveAllowedOrigin);
const canvasAnalysisHandler = createCanvasAnalysisHandler(db, resolveAllowedOrigin);
const canvasAnalysisProducerHandler = createCanvasAnalysisProducerHandler(db, resolveAllowedOrigin);
const canvasPersistenceHandler = createCanvasPersistenceHandler(db, resolveAllowedOrigin, (value) => activityService.validateCanvasSave(value));
const canvasSceneHandler = createCanvasSceneHandler(db, resolveAllowedOrigin);
const canvasRecognitionHandler = createCanvasRecognitionHandler(db, resolveAllowedOrigin);

const server = createServer(async (req, res) => {
  try {
  requestOrigins.set(res, resolveAllowedOrigin(req.headers.origin as string | undefined));
  const untrusted = rejectUntrustedRequest(req);
  if (untrusted) return json(res, 403, { error: untrusted });
  if (await activityHandler(req, res)) return;
  if (await learningHandler(req, res)) return;
  if (await studioHandler(req, res)) return;
  if (await slideDeckHandler(req, res)) return;
  if (await documentHandler(req, res)) return;
  if (await canvasRecognitionHandler(req, res)) return;
  if (await canvasPersistenceHandler(req, res)) return;
  if (await canvasSceneHandler(req, res)) return;
  if (await canvasAnalysisProducerHandler(req, res)) return;
  if (await canvasAnalysisHandler(req, res)) return;
  if (await handleMathRequest(req, res, json, body)) return;
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}:${port}`);
  if (req.method === "GET" && url.pathname === "/api/models") {
    const result = await getModelStatus(config.ollamaBaseUrl, config.ollamaModel);
    return json(res, result.status, result.body);
  }
  if (req.method === "GET" && url.pathname === "/api/tutor-status") return json(res, 200, tutorProviderStatus());
  if (req.method === "GET" && url.pathname === "/api/canvas-providers") {
    return json(res, 200, { chain: providerChain(), completion: resolveCompletionProviders(), vision: resolveVisionProviders(), budgets: providerBudgetSnapshot(), usage: persistedProviderUsageSnapshot(), circuits: providerCircuitSnapshot(), imageEgress: isImageEgressAllowed() });
  }
  if (req.method === "GET" && url.pathname === "/api/courses") return json(res, 200, db.prepare("SELECT * FROM courses").all());
  if (req.method === "GET" && url.pathname === "/api/concepts/graph") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    const course = db.prepare("SELECT title FROM courses WHERE id=?").get(courseId) as { title: string };
    return json(res, 200, buildConceptGraph(db, courseId, course.title));
  }
  if (req.method === "GET" && url.pathname === "/api/canvas-recognition/examples") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseId || !courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    return json(res, 200, { courseId, labels: countCanvasRecognitionExamples(db, courseId) });
  }
  if (req.method === "POST" && url.pathname === "/api/canvas-recognition/examples") {
    const input = await readJson(req, 8_000_000);
    if (typeof input.courseId !== "string" || !courseExists(input.courseId)) return json(res, 404, { error: "Course not found." });
    try {
      const result = await teachCanvasRecognitionExample(db, { courseId: input.courseId, label: String(input.label ?? ""), pngBase64: String(input.pngBase64 ?? "") });
      return json(res, 201, result);
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Recognition example could not be saved." });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/courses") {
    const input = await readJson(req);
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
    if (!title) return json(res, 400, { error: "A course title is required." });
    const id = randomUUID();
    const count = (db.prepare("SELECT count(*) AS total FROM courses").get() as { total: number }).total;
    const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : courseColors[count % courseColors.length];
    db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run(id, title, typeof input.code === "string" ? input.code.trim().slice(0, 120) : "", color);
    return json(res, 201, { id, title, code: typeof input.code === "string" ? input.code.trim().slice(0, 120) : "", color });
  }
  const courseDeleteMatch = req.method === "DELETE" && url.pathname.match(/^\/api\/courses\/([^/]+)$/);
  if (courseDeleteMatch) {
    let id: string;
    try { id = decodeURIComponent(courseDeleteMatch[1]); } catch { return json(res, 400, { error: "Invalid course ID." }); }
    if (!courseExists(id)) return json(res, 404, { error: "Course not found." });
    const removed = await deleteCourseCascade(db, process.env.STUDYAI_DOCUMENTS ?? "data/documents", id);
    return json(res, 200, { id, deleted: true, removed });
  }
  if (req.method === "GET" && url.pathname === "/api/lessons") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseId) return json(res, 400, { error: "course is required." });
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    return json(res, 200, db.prepare("SELECT id,title FROM lessons WHERE course_id=? ORDER BY rowid").all(courseId));
  }
  if (req.method === "POST" && url.pathname === "/api/lessons") {
    const input = await readJson(req);
    const courseId = typeof input.courseId === "string" ? input.courseId : "";
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 160) : "";
    if (!courseId || !title) return json(res, 400, { error: "courseId and title are required." });
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    const id = randomUUID();
    db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run(id, courseId, title);
    return json(res, 201, { id, title });
  }
  if (req.method === "GET" && url.pathname === "/api/notes") {
    const courseId = url.searchParams.get("course") ?? "";
    const lessonId = url.searchParams.get("lesson") ?? "";
    if (!courseId || !lessonId) return json(res, 400, { error: "course and lesson are required." });
    if (!lessonExists(courseId, lessonId)) return json(res, 404, { error: "Lesson not found in this course." });
    return json(res, 200, db.prepare("SELECT * FROM notes WHERE course_id=? AND (lesson_id=? OR lesson_id IS NULL) ORDER BY updated_at DESC").all(courseId, lessonId));
  }
  if (req.method === "GET" && url.pathname === "/api/documents") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseId) return json(res, 400, { error: "course is required." });
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    return json(res, 200, db.prepare("SELECT id,course_id,title,imported_at FROM documents WHERE course_id=? ORDER BY imported_at DESC").all(courseId));
  }
  if (req.method === "GET" && url.pathname === "/api/canvases") {
    const courseId = url.searchParams.get("course") ?? "";
    const lessonId = url.searchParams.get("lesson") ?? "";
    if (!courseId || !lessonId) return json(res, 400, { error: "course and lesson are required." });
    if (!lessonExists(courseId, lessonId)) return json(res, 404, { error: "Lesson not found in this course." });
    return json(res, 200, db.prepare("SELECT id,course_id,lesson_id,name,revision,updated_at FROM canvases WHERE course_id=? AND lesson_id=? ORDER BY updated_at DESC").all(courseId, lessonId));
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/canvases/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/canvases/".length));
    const courseId = url.searchParams.get("course") ?? "";
    const lessonId = url.searchParams.get("lesson") ?? "";
    if (!courseId || !lessonId) return json(res, 400, { error: "course and lesson are required." });
    const row = db.prepare("SELECT * FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(id, courseId, lessonId);
    return row ? json(res, 200, row) : json(res, 404, { error: "canvas not found" });
  }
  if (req.method === "POST" && url.pathname === "/api/canvases") {
    const input = await readJson(req, 20_000_000);
    if (!input.courseId || !input.lessonId || !input.name || !input.document || typeof input.document !== "object") return json(res, 400, { error: "courseId, lessonId, name, and document are required" });
    if (!db.prepare("SELECT id FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) return json(res, 400, { error: "Lesson not found in this course" });
    parseCanvasDocument(input.document);
    const id = input.id ?? randomUUID();
    const existing = db.prepare("SELECT course_id,lesson_id FROM canvases WHERE id=?").get(id) as { course_id: string; lesson_id: string } | undefined;
    if (existing && (existing.course_id !== input.courseId || existing.lesson_id !== input.lessonId)) return json(res, 409, { error: "Canvas belongs to another course or lesson" });
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,document,revision) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,revision=canvases.revision+1,updated_at=strftime('%Y-%m-%d %H:%M:%f','now')").run(id, String(input.courseId), String(input.lessonId), String(input.name).slice(0, 120), JSON.stringify(input.document));
    return json(res, 200, { id });
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/canvases/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/canvases/".length));
    const result = db.prepare("DELETE FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").run(id, url.searchParams.get("course") ?? "", url.searchParams.get("lesson") ?? "");
    if (!result.changes) return json(res, 404, { error: "canvas not found" });
    return json(res, 200, { id, deleted: true });
  }
  if (req.method === "POST" && url.pathname === "/api/notes") {
    const input = await readJson(req);
    const id = input.id ?? randomUUID();
    if (!input.courseId || !input.lessonId || typeof input.title !== "string" || typeof input.body !== "string") return json(res, 400, { error: "courseId, lessonId, title, and body are required." });
    if (!lessonExists(String(input.courseId), String(input.lessonId))) return json(res, 404, { error: "Lesson not found in this course." });
    const existing = db.prepare("SELECT course_id,lesson_id FROM notes WHERE id=?").get(id) as { course_id: string; lesson_id: string | null } | undefined;
    if (existing && (existing.course_id !== input.courseId || (existing.lesson_id && existing.lesson_id !== input.lessonId))) return json(res, 409, { error: "Note belongs to another course or lesson." });
    db.prepare("INSERT INTO notes(id,course_id,lesson_id,title,body,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET lesson_id=excluded.lesson_id,title=excluded.title,body=excluded.body,updated_at=CURRENT_TIMESTAMP").run(id, input.courseId, input.lessonId, String(input.title).trim().slice(0, 160) || "Notes", String(input.body).slice(0, 50000));
    return json(res, 200, { id });
  }
  if (req.method === "POST" && url.pathname === "/api/drawings") {
    const input = await readJson(req);
    if (!input.courseId || !courseExists(String(input.courseId)) || !input.snapshot || typeof input.snapshot !== "object") return json(res, 400, { error: "A valid courseId and snapshot are required." });
    const id = input.id ?? randomUUID();
    const existing = db.prepare("SELECT course_id FROM drawings WHERE id=?").get(id) as { course_id: string } | undefined;
    if (existing && existing.course_id !== String(input.courseId)) return json(res, 409, { error: "Drawing belongs to another course." });
    db.prepare("INSERT INTO drawings(id,course_id,snapshot,revision) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,revision=drawings.revision+1,updated_at=CURRENT_TIMESTAMP").run(id, input.courseId, JSON.stringify(input.snapshot));
    return json(res, 200, { id });
  }
  if (req.method === "GET" && url.pathname === "/api/drawings") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseId) return json(res, 400, { error: "course is required." });
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    return json(res, 200, db.prepare("SELECT * FROM drawings WHERE course_id=? ORDER BY updated_at DESC LIMIT 1").get(courseId) ?? null);
  }
  if (req.method === "POST" && url.pathname === "/api/documents") {
    const input = await readJson(req);
    if (!input.courseId || !courseExists(String(input.courseId))) return json(res, 404, { error: "Course not found." });
    if (typeof input.name !== "string" || !input.name || typeof input.content !== "string" || extname(input.name).toLowerCase() !== ".txt") return json(res, 400, { error: "Only UTF-8 .txt import is currently enabled." });
    const id = randomUUID();
    const storageRoot = resolve(process.env.STUDYAI_DOCUMENTS ?? "data/documents");
    const path = resolve(storageRoot, `${id}-${basename(input.name)}`);
    await mkdir(storageRoot, { recursive: true }); await writeFile(path, input.content, "utf8");
    const content = await readFile(path, "utf8");
    db.prepare("INSERT INTO documents(id,course_id,title,path) VALUES(?,?,?,?)").run(id, input.courseId, basename(input.name), path);
    const insert = db.prepare("INSERT INTO document_chunks(document_id,course_id,page,content) VALUES(?,?,NULL,?)").run(id, input.courseId, content);
    db.prepare("INSERT INTO chunk_search(rowid,content) VALUES(?,?)").run(insert.lastInsertRowid, content);
    const indexed = await migrateLegacyDocuments(db);
    const failure = indexed.failures.find((item) => item.id === id);
    if (failure) return json(res, 201, { id, status: "saved_unindexed", error: failure.error, pages: null });
    return json(res, 201, { id, status: "indexed", pages: null });
  }
  if (req.method === "GET" && url.pathname === "/api/progress") {
    const course = url.searchParams.get("course") ?? "";
    if (!course) return json(res, 400, { error: "course is required." });
    return json(res, 200, getCourseProgress(db, course));
  }
  if (req.method === "GET" && url.pathname === "/api/recommendations") {
    const course = url.searchParams.get("course") ?? "";
    if (!course) return json(res, 400, { error: "course is required." });
    return json(res, 200, { recommendations: getRecommendations(db, course, url.searchParams.get("lesson") ?? "") });
  }
  if (req.method === "GET" && url.pathname === "/api/daily-plans") {
    const course = url.searchParams.get("course") ?? "";
    if (!course) return json(res, 400, { error: "course is required." });
    return json(res, 200, buildDailyPlan(db, course, new Date(), url.searchParams.get("lesson") ?? ""));
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const query = url.searchParams.get("q") ?? "";
    const course = url.searchParams.get("course") ?? "";
    if (!course) return json(res, 400, { error: "course is required." });
    if (!courseExists(course)) return json(res, 404, { error: "Course not found." });
    const terms = query.replace(/["*]/g, " ").trim().split(/\s+/).filter(Boolean).map((part) => `"${part}"`).join(" OR ");
    if (!terms) return json(res, 200, []);
    const rows = db.prepare("SELECT document_chunks.document_id, documents.title, document_chunks.page, snippet(chunk_search,0,'','', '…',24) AS excerpt, bm25(chunk_search) AS score FROM chunk_search JOIN document_chunks ON document_chunks.id=chunk_search.rowid JOIN documents ON documents.id=document_chunks.document_id WHERE chunk_search MATCH ? AND document_chunks.course_id=? ORDER BY score LIMIT 8").all(terms, course);
    return json(res, 200, rows);
  }
  return json(res, 404, { error: "not found" });
  } catch (error) {
    if (error instanceof RequestAbortedError) return;
    if (error instanceof PayloadTooLargeError) return json(res, 413, { error: "Payload too large." });
    if (error instanceof InvalidJsonError) return json(res, 400, { error: error.message });
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOSPC") return json(res, 507, { error: "Course storage is full. Delete documents or courses to free space." });
    console.error("StudyAI API request failed:", error);
    return json(res, 500, { error: "Internal server error." });
  }
});
server.listen(port, LOOPBACK_HOST, () => console.log(`StudyAI local data API on http://${LOOPBACK_HOST}:${port}`));
void warmClipRuntime()
  .then((warmed) => { if (warmed) console.log("CLIP recognition runtime warmed."); })
  .catch((error: unknown) => console.warn("CLIP warmup failed:", error instanceof Error ? error.message : error));
class PayloadTooLargeError extends Error {}
class InvalidJsonError extends Error {}
class RequestAbortedError extends Error {}

async function readJson(req: import("node:http").IncomingMessage, limit?: number) {
  const raw = await body(req, limit);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new InvalidJsonError("Invalid JSON body."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InvalidJsonError("JSON request body must be an object.");
  return parsed as Record<string, unknown>;
}

// The cap counts incoming UTF-8 bytes, not decoded characters.
function body(req: import("node:http").IncomingMessage, limit = 1_000_000) {
  return new Promise<string>((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(new RequestAbortedError("request aborted"));
    };
    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > limit) {
        settled = true;
        reject(new PayloadTooLargeError("payload too large"));
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("aborted", abort);
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error?.code === "ECONNRESET" || error?.message === "aborted") abort();
      else if (!settled) { settled = true; reject(error); }
    });
  });
}

/** Remove a course and every course-scoped row, then its stored files. Rows are
 *  removed inside one transaction so a failed cascade cannot leave half a course. */
async function deleteCourseCascade(database: import("better-sqlite3").Database, storageRoot: string, courseId: string): Promise<Record<string, number>> {
  const diDocuments = database.prepare("SELECT id,storage_path FROM di_documents WHERE course_id=?").all(courseId) as Array<{ id: string; storage_path: string }>;
  const legacyDocuments = database.prepare("SELECT id,path FROM documents WHERE course_id=?").all(courseId) as Array<{ id: string; path: string }>;
  const removed: Record<string, number> = {};
  database.transaction(() => {
    // Keep external-content FTS tables consistent before their source rows go.
    const legacyChunks = database.prepare("SELECT id,content FROM document_chunks WHERE course_id=?").all(courseId) as Array<{ id: number; content: string }>;
    for (const chunk of legacyChunks) database.prepare("INSERT INTO chunk_search(chunk_search,rowid,content) VALUES('delete',?,?)").run(chunk.id, chunk.content);
    const diChunks = database.prepare("SELECT id,content FROM di_chunks WHERE course_id=?").all(courseId) as Array<{ id: number; content: string }>;
    for (const chunk of diChunks) database.prepare("INSERT INTO di_chunk_search(di_chunk_search,rowid,content) VALUES('delete',?,?)").run(chunk.id, chunk.content);
    database.prepare("DELETE FROM di_units WHERE document_id IN (SELECT id FROM di_documents WHERE course_id=?)").run(courseId);
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    for (const { name } of tables) {
      if (name.startsWith("sqlite_")) continue;
      const columns = database.pragma(`table_info(${name})`) as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "course_id")) continue;
      removed[name] = database.prepare(`DELETE FROM ${name} WHERE course_id=?`).run(courseId).changes;
    }
    database.prepare("DELETE FROM courses WHERE id=?").run(courseId);
  })();
  const root = resolve(storageRoot).toLowerCase() + sep;
  const paths = [...diDocuments.map((row) => row.storage_path), ...legacyDocuments.map((row) => row.path)];
  await Promise.all(paths.map((path) => {
    const absolute = resolve(path);
    return absolute.toLowerCase().startsWith(root) ? unlink(absolute).catch(() => undefined) : Promise.resolve();
  }));
  return removed;
}

function courseExists(courseId: string): boolean { return Boolean(db.prepare("SELECT 1 FROM courses WHERE id=?").get(courseId)); }
function lessonExists(courseId: string, lessonId: string): boolean { return courseExists(courseId) && Boolean(db.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(courseId, lessonId)); }
const courseColors = ["#ef805c", "#7a9b7b", "#7d91c8", "#c28f5c"];

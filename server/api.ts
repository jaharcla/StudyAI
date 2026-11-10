import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, basename, resolve } from "node:path";
import { db } from "./db.js";
import { createDocumentIntelligenceHandler } from "./document-intelligence/http.js";
import { parseCanvasDocument } from "../src/canvas/model.js";
import { initializeDocumentIntelligenceSchema } from "./document-intelligence/schema.js";
import { migrateLegacyDocuments } from "./document-intelligence/legacy.js";
import { getStudyAIConfig, LOOPBACK_HOST } from "./config.js";
import { getActiveModelStatus } from "./models.js";
import { getTutorProviderSettings } from "./tutor-provider.js";
import { LearningService } from "./learning/service.js";
import { createLearningHandler } from "./learning/http.js";
import { LearningActivityService } from "./learning/activities/service.js";
import { createLearningActivityHandler } from "./learning/activities/http.js";
import { createCanvasAnalysisHandler } from "./canvas-analysis/http.js";
import { createCanvasAnalysisProducerHandler } from "./canvas-analysis/producer.js";
import { createCanvasPersistenceHandler } from "./canvas-persistence/http.js";

const config = getStudyAIConfig();
const port = config.dataPort;
initializeDocumentIntelligenceSchema(db);
const legacyDocuments = await migrateLegacyDocuments(db);
if (legacyDocuments.failures.length) console.warn("Legacy document indexing failures:", legacyDocuments.failures);
const json = (res: import("node:http").ServerResponse, status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": config.webOrigin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" }); res.end(JSON.stringify(data)); };
const documentHandler = createDocumentIntelligenceHandler(db, process.env.STUDYAI_DOCUMENTS);
const learningService = new LearningService(db);
const learningHandler = createLearningHandler(learningService, config.webOrigin);
const activityService = new LearningActivityService(db, learningService);
const activityHandler = createLearningActivityHandler(activityService, config.webOrigin);
const canvasAnalysisHandler = createCanvasAnalysisHandler(db, config.webOrigin);
const canvasAnalysisProducerHandler = createCanvasAnalysisProducerHandler(db, config.webOrigin);
const canvasPersistenceHandler = createCanvasPersistenceHandler(db, config.webOrigin, (value) => activityService.validateCanvasSave(value));

const server = createServer(async (req, res) => {
  try {
  if (await activityHandler(req, res)) return;
  if (await learningHandler(req, res)) return;
  if (await documentHandler(req, res)) return;
  if (await canvasPersistenceHandler(req, res)) return;
  if (await canvasAnalysisProducerHandler(req, res)) return;
  if (await canvasAnalysisHandler(req, res)) return;
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}:${port}`);
  if (req.method === "GET" && url.pathname === "/api/models") {
    const result = await getActiveModelStatus(getTutorProviderSettings(), config.ollamaBaseUrl);
    return json(res, result.status, result.body);
  }
  if (req.method === "GET" && url.pathname === "/api/courses") return json(res, 200, db.prepare("SELECT * FROM courses").all());
  if (req.method === "POST" && url.pathname === "/api/courses") {
    const input = JSON.parse(await body(req));
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
    if (!title) return json(res, 400, { error: "A course title is required." });
    const id = randomUUID();
    const count = (db.prepare("SELECT count(*) AS total FROM courses").get() as { total: number }).total;
    const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : courseColors[count % courseColors.length];
    db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run(id, title, typeof input.code === "string" ? input.code.trim().slice(0, 120) : "", color);
    return json(res, 201, { id, title, code: typeof input.code === "string" ? input.code.trim().slice(0, 120) : "", color });
  }
  if (req.method === "GET" && url.pathname === "/api/lessons") {
    const courseId = url.searchParams.get("course") ?? "";
    if (!courseId) return json(res, 400, { error: "course is required." });
    if (!courseExists(courseId)) return json(res, 404, { error: "Course not found." });
    return json(res, 200, db.prepare("SELECT id,title FROM lessons WHERE course_id=? ORDER BY rowid").all(courseId));
  }
  if (req.method === "POST" && url.pathname === "/api/lessons") {
    const input = JSON.parse(await body(req));
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
    const input = JSON.parse(await body(req, 20_000_000));
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
    const input = JSON.parse(await body(req));
    const id = input.id ?? randomUUID();
    if (!input.courseId || !input.lessonId || typeof input.title !== "string" || typeof input.body !== "string") return json(res, 400, { error: "courseId, lessonId, title, and body are required." });
    if (!lessonExists(String(input.courseId), String(input.lessonId))) return json(res, 404, { error: "Lesson not found in this course." });
    const existing = db.prepare("SELECT course_id,lesson_id FROM notes WHERE id=?").get(id) as { course_id: string; lesson_id: string | null } | undefined;
    if (existing && (existing.course_id !== input.courseId || (existing.lesson_id && existing.lesson_id !== input.lessonId))) return json(res, 409, { error: "Note belongs to another course or lesson." });
    db.prepare("INSERT INTO notes(id,course_id,lesson_id,title,body,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET lesson_id=excluded.lesson_id,title=excluded.title,body=excluded.body,updated_at=CURRENT_TIMESTAMP").run(id, input.courseId, input.lessonId, String(input.title).trim().slice(0, 160) || "Notes", String(input.body).slice(0, 50000));
    return json(res, 200, { id });
  }
  if (req.method === "POST" && url.pathname === "/api/drawings") {
    const input = JSON.parse(await body(req));
    if (!input.courseId || !courseExists(String(input.courseId)) || !input.snapshot || typeof input.snapshot !== "object") return json(res, 400, { error: "A valid courseId and snapshot are required." });
    const id = input.id ?? randomUUID();
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
    const input = JSON.parse(await body(req));
    if (!input.courseId || !courseExists(String(input.courseId))) return json(res, 404, { error: "Course not found." });
    if (!input.name || typeof input.content !== "string" || extname(input.name).toLowerCase() !== ".txt") return json(res, 400, { error: "Only UTF-8 .txt import is currently enabled." });
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
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "Invalid request" }); }
});
server.listen(port, LOOPBACK_HOST, () => console.log(`StudyAI local data API on http://${LOOPBACK_HOST}:${port}`));
function body(req: import("node:http").IncomingMessage, limit = 1_000_000) { return new Promise<string>((resolveBody, reject) => { let value = ""; req.setEncoding("utf8"); req.on("data", (chunk) => { value += chunk; if (value.length > limit) reject(new Error("payload too large")); }); req.on("end", () => resolveBody(value)); req.on("error", reject); }); }

function courseExists(courseId: string): boolean { return Boolean(db.prepare("SELECT 1 FROM courses WHERE id=?").get(courseId)); }
function lessonExists(courseId: string, lessonId: string): boolean { return courseExists(courseId) && Boolean(db.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(courseId, lessonId)); }
const courseColors = ["#ef805c", "#7a9b7b", "#7d91c8", "#c28f5c"];

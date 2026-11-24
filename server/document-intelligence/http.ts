import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type Database from "better-sqlite3";
import { getStudyAIConfig, LOOPBACK_HOST } from "../config.js";
import { deleteDocument, getDocument, getDocumentFile, getDocumentLocation, importDocumentsIndividually, listDocuments, MAX_BATCH_BYTES, MAX_BATCH_FILES, MAX_FILE_BYTES, retrieveCourseDocuments, searchDocuments } from "./service.js";
import type { ImportFile } from "./types.js";

const MAX_REQUEST_BYTES = 70 * 1024 * 1024;
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_UPLOAD_CHUNKS = 64;
const UPLOAD_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

export function createDocumentIntelligenceHandler(db: Database.Database, storageRoot?: string): Handler {
  return async (request, response) => {
    const cfg = getStudyAIConfig();
    const requestOriginHeader = request.headers.origin as string | undefined;
    const origin = requestOriginHeader && cfg.allowedOrigins.includes(requestOriginHeader) ? requestOriginHeader : cfg.webOrigin;
    const url = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (url.pathname.startsWith("/api/document-intelligence/") && request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
      response.end();
      return true;
    }
    if (url.pathname === "/api/document-intelligence/import" && request.method === "POST") {
      try {
        const input = await readJson(request);
        if (typeof input.courseId !== "string" || !Array.isArray(input.files)) return send(response, 400, { error: "courseId and files are required." });
        if (input.lessonId !== undefined && (typeof input.lessonId !== "string" || !db.prepare("SELECT id FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId))) return send(response, 400, { error: "Lesson not found in this course." });
        if (input.files.length > MAX_BATCH_FILES) return send(response, 413, { error: `A batch can contain at most ${MAX_BATCH_FILES} files.` });
        const files: ImportFile[] = input.files.map((file: { name?: unknown; contentBase64?: unknown }) => {
          if (typeof file?.name !== "string") throw new Error("Each file needs a name and valid base64 content.");
          return { name: file.name, bytes: decodeBase64Field(file.contentBase64, "base64 content") };
        });
        if (files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > MAX_BATCH_BYTES) return send(response, 413, { error: "Batch exceeds the 50 MB total limit." });
        const results = await importDocumentsIndividually(db, input.courseId, files, storageRoot);
        if (typeof input.lessonId === "string") for (const result of results) {
          if (result.status === "imported") db.prepare("UPDATE di_documents SET lesson_id=? WHERE id=? AND course_id=?").run(input.lessonId, result.document.id, input.courseId);
        }
        return send(response, 200, { results, documents: results.filter((result) => result.status === "imported").map((result) => result.document) });
      } catch (error) { return sendError(response, error); }
    }
    if (url.pathname === "/api/document-intelligence/upload/chunk" && request.method === "POST") {
      try {
        const input = await readJson(request);
        const uploadId = validateUploadId(input.uploadId);
        const chunkIndex = Number(input.chunkIndex);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= MAX_UPLOAD_CHUNKS) throw new Error("Invalid upload chunk index.");
        const bytes = decodeBase64Field(input.contentBase64, "base64 content");
        if (bytes.length > MAX_CHUNK_BYTES) throw new Error("Upload chunk exceeds the 3 MB limit.");
        validateUploadScope(db, input);
        const dir = uploadDirectory(storageRoot, uploadId);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${chunkIndex}.part`), bytes);
        return send(response, 200, { received: chunkIndex });
      } catch (error) { return sendError(response, error); }
    }
    if (url.pathname === "/api/document-intelligence/upload/complete" && request.method === "POST") {
      let dir: string | undefined;
      try {
        const input = await readJson(request);
        const uploadId = validateUploadId(input.uploadId);
        validateUploadScope(db, input);
        const totalChunks = Number(input.totalChunks);
        if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_UPLOAD_CHUNKS) throw new Error("Invalid upload batch size.");
        const name = input.name;
        // eslint-disable-next-line no-control-regex -- stripping control characters is the point
        if (typeof name !== "string" || !basename(name).replace(/[\u0000-\u001f]/g, "")) throw new Error("A valid file name is required.");
        dir = uploadDirectory(storageRoot, uploadId);
        const chunks: Buffer[] = [];
        for (let index = 0; index < totalChunks; index++) {
          const part = join(dir, `${index}.part`);
          if (!existsSync(part)) throw new Error("Upload batch is incomplete; a chunk is missing.");
          chunks.push(await readFile(part));
        }
        const bytes = Buffer.concat(chunks);
        if (bytes.length > MAX_FILE_BYTES) throw new Error("File exceeds the 20 MB limit.");
        const results = await importDocumentsIndividually(db, input.courseId as string, [{ name, bytes }], storageRoot);
        if (typeof input.lessonId === "string") for (const result of results) {
          if (result.status === "imported") db.prepare("UPDATE di_documents SET lesson_id=? WHERE id=? AND course_id=?").run(input.lessonId, result.document.id, input.courseId);
        }
        return send(response, 200, { results, documents: results.filter((result) => result.status === "imported").map((result) => result.document) });
      } catch (error) { return sendError(response, error); }
      finally { if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
    }
    if (url.pathname === "/api/document-intelligence/search" && request.method === "GET") {
      const course = url.searchParams.get("course") ?? "";
      const query = url.searchParams.get("q") ?? "";
      if (!course || query.length > 500) return send(response, 400, { error: "A course and query of at most 500 characters are required." });
      try { return send(response, 200, { results: searchDocuments(db, course, query) }); } catch (error) { return sendError(response, error); }
    }
    if (url.pathname === "/api/document-intelligence/retrieve" && request.method === "GET") {
      const course = url.searchParams.get("course") ?? "";
      const query = url.searchParams.get("q") ?? "";
      if (!course || query.length > 500) return send(response, 400, { error: "A course and query of at most 500 characters are required." });
      try { return send(response, 200, retrieveCourseDocuments(db, course, query)); } catch (error) { return sendError(response, error); }
    }
    if (url.pathname === "/api/document-intelligence/documents" && request.method === "GET") {
      const course = url.searchParams.get("course") ?? "";
      const query = url.searchParams.get("q") ?? "";
      if (!course || query.length > 500) return send(response, 400, { error: "A course and query of at most 500 characters are required." });
      try { return send(response, 200, listDocuments(db, course, query)); } catch (error) { return sendError(response, error); }
    }
    const documentMatch = url.pathname.match(/^\/api\/document-intelligence\/documents\/([^/]+)(?:\/(file))?$/);
    if (documentMatch) {
      const course = url.searchParams.get("course") ?? "";
      let documentId: string;
      try { documentId = decodeURIComponent(documentMatch[1]); } catch { return send(response, 400, { error: "Invalid document ID." }); }
      if (!course) return send(response, 400, { error: "course is required." });
      if (request.method === "GET" && documentMatch[2] === "file") {
        try {
          const file = await getDocumentFile(db, course, documentId);
          if (!file) return send(response, 404, { error: "Document not found in this course." });
          response.writeHead(200, { "content-type": file.mimeType, "content-length": String(file.bytes.byteLength), "content-disposition": "inline; filename*=UTF-8''" + encodeURIComponent(file.filename), "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
          response.end(file.bytes);
          return true;
        } catch (error) { return sendError(response, error); }
      }
      if (request.method === "GET" && !documentMatch[2]) {
        const document = getDocument(db, course, documentId);
        return document ? send(response, 200, document) : send(response, 404, { error: "Document not found in this course." });
      }
      if (request.method === "DELETE" && !documentMatch[2]) {
        try { return await deleteDocument(db, course, documentId) ? send(response, 200, { deleted: true }) : send(response, 404, { error: "Document not found in this course." }); }
        catch (error) { return sendError(response, error); }
      }
    }
    if (url.pathname === "/api/document-intelligence/source" && request.method === "GET") {
      const course = url.searchParams.get("course") ?? "";
      const ref = url.searchParams.get("ref") ?? "";
      if (!course || !ref) return send(response, 400, { error: "course and ref are required." });
      try {
        const source = getDocumentLocation(db, ref, course);
        return source ? send(response, 200, source) : send(response, 404, { error: "Source not found in this course." });
      } catch (error) { return sendError(response, error); }
    }
    return false;
  };
}

function decodeBase64Field(value: unknown, label: string): Buffer {
  if (typeof value !== "string") throw new Error(`${label} must be a base64 string.`);
  const bytes = Buffer.from(value, "base64");
  // Linear round-trip check; a nested-quantifier regex overflows the stack on large payloads.
  if (bytes.toString("base64") !== value) throw new Error(`${label} must be a base64 string.`);
  return bytes;
}

function validateUploadId(value: unknown): string {
  if (typeof value !== "string" || !UPLOAD_ID.test(value)) throw new Error("Invalid upload session.");
  return value;
}

function validateUploadScope(db: Database.Database, input: Record<string, unknown>): void {
  if (typeof input.courseId !== "string" || !db.prepare("SELECT id FROM courses WHERE id=?").get(input.courseId)) throw new Error("Course not found.");
  if (input.lessonId !== undefined && (typeof input.lessonId !== "string" || !db.prepare("SELECT id FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId))) throw new Error("Lesson not found in this course.");
}

function uploadDirectory(storageRoot: string | undefined, uploadId: string): string {
  return join(storageRoot ?? "data/documents", ".uploads", uploadId);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > MAX_REQUEST_BYTES) throw Object.assign(new Error("Request exceeds the 70 MB limit."), { statusCode: 413 });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_REQUEST_BYTES) throw Object.assign(new Error("Request exceeds the 70 MB limit."), { statusCode: 413 });
    chunks.push(bytes);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON request body must be an object.");
  return value;
}

function send(response: ServerResponse, status: number, value: unknown): boolean {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": getStudyAIConfig().webOrigin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
  response.end(JSON.stringify(value));
  return true;
}

function sendError(response: ServerResponse, error: unknown): boolean {
  const status = Number((error as { statusCode?: number }).statusCode) || 400;
  return send(response, status, { error: error instanceof Error ? error.message : "Document operation failed." });
}

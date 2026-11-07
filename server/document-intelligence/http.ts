import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { getDocumentLocation, importDocuments, MAX_BATCH_BYTES, MAX_BATCH_FILES, searchDocuments } from "./service.js";
import type { ImportFile } from "./types.js";

const MAX_REQUEST_BYTES = 70 * 1024 * 1024;
type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

export function createDocumentIntelligenceHandler(db: Database.Database, storageRoot?: string): Handler {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/document-intelligence/") && request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
      response.end();
      return true;
    }
    if (url.pathname === "/api/document-intelligence/import" && request.method === "POST") {
      try {
        const input = await readJson(request);
        if (typeof input.courseId !== "string" || !Array.isArray(input.files)) return send(response, 400, { error: "courseId and files are required." });
        if (input.files.length > MAX_BATCH_FILES) return send(response, 413, { error: `A batch can contain at most ${MAX_BATCH_FILES} files.` });
        const files: ImportFile[] = input.files.map((file: { name?: unknown; contentBase64?: unknown }) => {
          if (typeof file?.name !== "string" || typeof file.contentBase64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) throw new Error("Each file needs a name and valid base64 content.");
          return { name: file.name, bytes: Buffer.from(file.contentBase64, "base64") };
        });
        if (files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > MAX_BATCH_BYTES) return send(response, 413, { error: "Batch exceeds the 50 MB total limit." });
        return send(response, 201, { documents: await importDocuments(db, input.courseId, files, storageRoot) });
      } catch (error) { return sendError(response, error); }
    }
    if (url.pathname === "/api/document-intelligence/search" && request.method === "GET") {
      const course = url.searchParams.get("course") ?? "";
      const query = url.searchParams.get("q") ?? "";
      if (!course || query.length > 500) return send(response, 400, { error: "A course and query of at most 500 characters are required." });
      try { return send(response, 200, { results: searchDocuments(db, course, query) }); } catch (error) { return sendError(response, error); }
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

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
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
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
  response.end(JSON.stringify(value));
  return true;
}

function sendError(response: ServerResponse, error: unknown): boolean {
  const status = Number((error as { statusCode?: number }).statusCode) || 400;
  return send(response, status, { error: error instanceof Error ? error.message : "Document operation failed." });
}

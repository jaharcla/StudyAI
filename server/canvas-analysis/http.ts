import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { CanvasAnalysisValidationError } from "./contract.js";
import { validateCanvasAnalysisAtReceiver } from "./receiver.js";

export function createCanvasAnalysisHandler(database: Database.Database, origin: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    if (request.method !== "POST") return false;
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/api\/canvases\/([^/]+)\/analysis\/validate$/.exec(url.pathname);
    if (!match) return false;
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
      response.end(JSON.stringify(data));
    };
    let boardId: string;
    try { boardId = decodeURIComponent(match[1]); }
    catch { send(400, { error: "Invalid board ID." }); return true; }
    const courseId = url.searchParams.get("course") ?? "";
    const lessonId = url.searchParams.get("lesson") ?? "";
    if (!courseId || !lessonId) { send(400, { error: "course and lesson are required." }); return true; }
    if (!database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(courseId, lessonId)) { send(404, { error: "Lesson not found in this course." }); return true; }
    try {
      const input = JSON.parse(await readBody(request));
      const analysis = validateCanvasAnalysisAtReceiver(database, input, { boardId, courseId, lessonId });
      send(200, { valid: true, analysis });
    } catch (error) {
      const code = error instanceof CanvasAnalysisValidationError ? error.code : "invalid_result";
      const status = code === "scope_mismatch" || code === "stale_revision" ? 409 : 400;
      send(status, { error: error instanceof Error ? error.message : "Invalid canvas analysis.", code });
    }
    return true;
  };
}

function readBody(request: IncomingMessage, limit = 20_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      value += chunk;
      if (value.length > limit) reject(new Error("Canvas analysis payload is too large."));
    });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

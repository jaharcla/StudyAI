import type Database from "better-sqlite3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initializeCanvasRecognitionFeedbackSchema, parseRecognitionFeedbackInput, saveCanvasRecognitionFeedback } from "./feedback.js";
import { teachCanvasRecognitionFromStrokes, persistedStrokePoints } from "./teach.js";

function json(res: ServerResponse, status: number, data: unknown, origin: string) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
  res.end(JSON.stringify(data));
  return true as const;
}

async function body(request: IncomingMessage, limit = 100_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { value += chunk; if (value.length > limit) reject(new Error("payload too large")); });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

type BoardRow = { boardId: string; courseId: string; lessonId: string; document: string };

function loadBoard(database: Database.Database, boardId: string, courseId: string, lessonId: string): BoardRow | undefined {
  return database.prepare("SELECT id AS boardId,course_id AS courseId,lesson_id AS lessonId,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(boardId, courseId, lessonId) as BoardRow | undefined;
}

export function createCanvasRecognitionHandler(database: Database.Database, origin: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    if (request.method !== "POST") return false;
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/api\/canvases\/([^/]+)\/recognition\/(teach|feedback)$/);
    if (!match) return false;
    const boardId = decodeURIComponent(match[1]);
    const mode = match[2];
    try {
      const input = JSON.parse(await body(request)) as Record<string, unknown>;
      const courseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
      const lessonId = typeof input.lessonId === "string" ? input.lessonId.trim() : "";
      if (!courseId || !lessonId) return json(response, 400, { error: "courseId and lessonId are required.", code: "invalid_request" }, origin);
      const board = loadBoard(database, boardId, courseId, lessonId);
      if (!board) return json(response, 404, { error: "No canvas exists for this board, course, and lesson.", code: "scope_mismatch" }, origin);
      if (mode === "teach") {
        const strokeIds = Array.isArray(input.strokeIds) ? input.strokeIds.filter((id): id is string => typeof id === "string") : [];
        const result = await teachCanvasRecognitionFromStrokes({ db: database, board, strokeIds, label: input.label });
        return json(response, 201, result, origin);
      }

      const feedback = parseRecognitionFeedbackInput({ ...input, courseId, boardId });
      persistedStrokePoints(board, feedback.strokeIds);
      const warnings: string[] = [];
      let prototype: "updated" | "skipped" = "skipped";
      if (feedback.label) {
        try {
          await teachCanvasRecognitionFromStrokes({ db: database, board, strokeIds: feedback.strokeIds, label: feedback.label });
          prototype = "updated";
        } catch (error) {
          warnings.push(`The decision was saved, but the recognition example was not: ${error instanceof Error ? error.message : "teach failed"}.`);
        }
      }
      initializeCanvasRecognitionFeedbackSchema(database);
      const saved = saveCanvasRecognitionFeedback(database, feedback);
      return json(response, 200, { status: "saved", decision: saved.decision, groupKey: saved.groupKey, prototype, warnings }, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid recognition request.";
      const unavailable = /clip|embedding|model/i.test(message);
      return json(response, unavailable ? 503 : 400, { error: message, code: "invalid_request" }, origin);
    }
  };
}

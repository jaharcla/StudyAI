import type Database from "better-sqlite3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CanvasSceneError, buildCanvasScene, queryCanvasScene, queryCourseCanvasScene } from "./service.js";
import { readCanvasInk } from "./ink-service.js";

function json(res: ServerResponse, status: number, data: unknown, origin: string) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
  res.end(JSON.stringify(data));
}

async function body(request: IncomingMessage, limit = 2_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { value += chunk; if (value.length > limit) reject(new Error("payload too large")); });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

export function createCanvasSceneHandler(database: Database.Database, origin: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    if (request.method !== "POST") return false;
    const url = new URL(request.url ?? "/", "http://localhost");
    const courseMatch = url.pathname.match(/^\/api\/courses\/([^/]+)\/canvas-scene\/query$/);
    if (courseMatch) {
      try {
        const result = queryCourseCanvasScene(database, decodeURIComponent(courseMatch[1]), JSON.parse(await body(request)));
        json(response, 200, result, origin);
      } catch (error) {
        if (error instanceof CanvasSceneError) json(response, error.status, { error: error.message, code: error.code }, origin);
        else if (error instanceof SyntaxError) json(response, 400, { error: "Invalid JSON.", code: "invalid_request" }, origin);
        else json(response, 400, { error: error instanceof Error ? error.message : "Invalid scene request.", code: "invalid_request" }, origin);
      }
      return true;
    }
    const match = url.pathname.match(/^\/api\/canvases\/([^/]+)\/scene(?:\/query)?$/);
    const inkMatch = url.pathname.match(/^\/api\/canvases\/([^/]+)\/ink$/);
    if (inkMatch) {
      const boardId = decodeURIComponent(inkMatch[1]);
      try {
        const result = await readCanvasInk(database, boardId, JSON.parse(await body(request)));
        json(response, 200, result, origin);
      } catch (error) {
        if (error instanceof CanvasSceneError) json(response, error.status, { error: error.message, code: error.code }, origin);
        else if (error instanceof SyntaxError) json(response, 400, { error: "Invalid JSON.", code: "invalid_request" }, origin);
        else json(response, 400, { error: error instanceof Error ? error.message : "Invalid ink request.", code: "invalid_request" }, origin);
      }
      return true;
    }
    if (!match) return false;
    const boardId = decodeURIComponent(match[1]);
    const isQuery = url.pathname.endsWith("/query");
    try {
      const input: unknown = JSON.parse(await body(request));
      if (isQuery) {
        const result = queryCanvasScene(database, boardId, input);
        json(response, 200, result, origin);
      } else {
        const result = await buildCanvasScene(database, boardId, input);
        json(response, 200, result, origin);
      }
    } catch (error) {
      if (error instanceof CanvasSceneError) json(response, error.status, { error: error.message, code: error.code }, origin);
      else if (error instanceof SyntaxError) json(response, 400, { error: "Invalid JSON.", code: "invalid_request" }, origin);
      else json(response, 400, { error: error instanceof Error ? error.message : "Invalid scene request.", code: "invalid_request" }, origin);
    }
    return true;
  };
}

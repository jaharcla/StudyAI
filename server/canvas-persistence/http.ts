import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { CanvasPersistenceInputError, saveCanvasDocument } from "./service.js";

export function createCanvasPersistenceHandler(database: Database.Database, origin: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    if (request.method !== "POST" || new URL(request.url ?? "/", "http://localhost").pathname !== "/api/canvases") return false;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" });
      response.end(JSON.stringify(value));
    };
    try {
      const result = saveCanvasDocument(database, JSON.parse(await readBody(request)));
      send(result.status, result.body);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) send(413, { error: error.message });
      else if (error instanceof CanvasPersistenceInputError || error instanceof SyntaxError) send(400, { error: error.message });
      else send(500, { error: "Canvas save failed." });
    }
    return true;
  };
}

class PayloadTooLargeError extends Error {}

function readBody(request: IncomingMessage, limit = 20_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      value += chunk;
      if (value.length > limit) reject(new PayloadTooLargeError("Canvas payload is too large."));
    });
    request.on("end", () => resolve(value));
    request.on("error", reject);
  });
}

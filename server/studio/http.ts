import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { ZodError } from "zod";
import { StudioKindSchema } from "./contracts.js";
import { generateStudioArtifact, getStudioArtifact, importStudioArtifact, listStudioArtifacts } from "./service.js";
import type { LearningService } from "../learning/service.js";

export function createStudioHandler(db: Database.Database, learning: LearningService, origin = "http://127.0.0.1:5173") {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/studio/")) return false;
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
      res.end(JSON.stringify(value));
    };
    if (req.method === "OPTIONS") { send(204, {}); return true; }
    try {
      if (req.method === "POST" && url.pathname === "/api/studio/generate") {
        send(201, await generateStudioArtifact(db, JSON.parse(await readBody(req))));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/studio/artifacts") {
        const course = url.searchParams.get("course") ?? "";
        if (!course) { send(400, { error: "course is required." }); return true; }
        const lesson = url.searchParams.get("lesson") ?? undefined;
        const rawKind = url.searchParams.get("kind") ?? "";
        const kind = rawKind ? StudioKindSchema.parse(rawKind) : undefined;
        send(200, listStudioArtifacts(db, course, lesson, kind));
        return true;
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/studio/artifact/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/studio/artifact/".length));
        const course = url.searchParams.get("course") ?? "";
        const artifact = getStudioArtifact(db, id, course);
        send(artifact ? 200 : 404, artifact ?? { error: "Studio artifact not found." });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/studio/import") {
        send(200, importStudioArtifact(db, learning, JSON.parse(await readBody(req))));
        return true;
      }
      return false;
    } catch (error) {
      const status = error instanceof ZodError ? 400 : error instanceof Error && /No course sources|No grounded|requires|not found|Only practice/.test(error.message) ? 422 : 502;
      send(status, { error: error instanceof Error ? error.message : "Studio request failed." });
      return true;
    }
  };
}

function readBody(req: IncomingMessage, limit = 20_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; if (body.length > limit) reject(new Error("Payload too large.")); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

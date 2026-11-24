import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { z, ZodError } from "zod";
import { StudioKindSchema } from "./contracts.js";
import {
  generateStudioArtifact, getStudioArtifact, importStudioArtifact, listStudioArtifacts,
  saveStudioArtifact, setStudioArtifactAcceptance, StudioGenerationUnavailable,
} from "./service.js";
import type { LearningService } from "../learning/service.js";
import { parseArtifactPackage } from "../../src/artifacts/package.js";
import { compilePackage } from "../artifact-intelligence/service.js";
import { DEFAULT_VIEWPORT } from "../../src/canvas/ai/teaching-scene.js";

const AcceptSchema = z.object({ id: z.string().min(1), decision: z.enum(["accept", "correct", "decline"]) }).strict();
const PackageRequestSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
  package: z.unknown(),
  evidence: z.array(z.object({ ref: z.string().min(1), text: z.string() }).strict()).min(1).max(20),
}).strict();

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
        const body = JSON.parse(await readBody(req)) as { kind?: string };
        // Infographics come from the shared artifact package compiler, never a new provider.
        if (body.kind === "infographic") {
          send(422, { error: "Infographics are compiled from an artifact package at /api/studio/package." });
          return true;
        }
        send(201, await generateStudioArtifact(db, body));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/studio/package") {
        const input = PackageRequestSchema.parse(JSON.parse(await readBody(req)));
        const refs = input.evidence.map((chunk) => chunk.ref);
        const pkg = parseArtifactPackage(input.package, refs, input.evidence);
        const result = compilePackage(pkg, {
          courseId: input.courseId, lessonId: input.lessonId, boardId: "",
          occupancy: [], viewport: DEFAULT_VIEWPORT, anchors: new Map(),
          retrievedRefs: refs, retrievedChunks: input.evidence,
        });
        if (!result.report.ok) { send(422, { error: "Package validation failed.", report: result.report }); return true; }
        if (!result.studio) { send(422, { error: "This package has no first-class studio artifact." }); return true; }
        saveStudioArtifact(db, result.studio);
        send(201, result.studio);
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
      if (req.method === "POST" && url.pathname === "/api/studio/accept") {
        const input = AcceptSchema.parse(JSON.parse(await readBody(req)));
        const artifact = setStudioArtifactAcceptance(db, input.id, input.decision);
        send(artifact ? 200 : 404, artifact ?? { error: "Studio artifact not found." });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/studio/import") {
        send(200, importStudioArtifact(db, learning, JSON.parse(await readBody(req))));
        return true;
      }
      return false;
    } catch (error) {
      const status = error instanceof ZodError ? 400
        : error instanceof StudioGenerationUnavailable ? 422
          : error instanceof Error && /No course sources|No grounded|requires|not found|Only practice|Package validation|no first-class|Infographics are compiled/.test(error.message) ? 422
            : 502;
      send(status, { error: error instanceof Error ? error.message : "Studio request failed." });
      return true;
    }
  };
}

function readBody(req: IncomingMessage, limit = 100_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; if (body.length > limit) reject(new Error("Payload too large.")); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

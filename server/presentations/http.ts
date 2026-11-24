import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import { DECK_DOWNLOAD_NOTICE, generateSlideDeck, getSlideDeck, listSlideDecks, type SlideDeckDeps } from "./service";

const UpdateSchema = z.object({
  id: z.string().min(1).max(200),
  courseId: z.string().min(1).max(512),
  title: z.string().trim().min(1).max(200).optional(),
  collection: z.string().trim().max(120).optional(),
}).strict();

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function downloadName(title: string, id: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `attachment; filename="${slug || "study-deck"}-${SAFE_ID.test(id) ? id : "deck"}.pptx"`;
}

/** Course-scoped HTTP surface for slide deck artifacts. */
export function createSlideDeckHandler(
  db: Database.Database,
  deps: SlideDeckDeps,
  origin: string | ((req: IncomingMessage) => string) = "http://127.0.0.1:5173",
  dataDir = path.join(process.cwd(), "data", "artifacts"),
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const requestOrigin = typeof origin === "function" ? origin(req) : origin;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/slide-decks")) return false;
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": requestOrigin,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    };
    const send = (status: number, value: unknown) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(value));
    };
    if (req.method === "OPTIONS") { send(204, {}); return true; }

    const idParam = url.searchParams.get("id") ?? "";
    const course = url.searchParams.get("course") ?? "";
    const safeId = SAFE_ID.test(idParam);

    try {
      if (req.method === "POST" && url.pathname === "/api/slide-decks/generate") {
        send(201, await generateSlideDeck(db, JSON.parse(await readBody(req)), deps));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/slide-decks") {
        if (!course) { send(400, { error: "course is required." }); return true; }
        send(200, listSlideDecks(db, course));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/slide-decks/artifact") {
        if (!safeId || !course) { send(400, { error: "unsafe id or missing course." }); return true; }
        const artifact = getSlideDeck(db, idParam, course);
        send(artifact ? 200 : 404, artifact ?? { error: "Slide deck not found." });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/slide-decks/download") {
        if (!safeId || !course || idParam.includes("..")) { send(400, { error: "unsafe id." }); return true; }
        const artifact = getSlideDeck(db, idParam, course);
        if (!artifact) { send(404, { error: "Slide deck not found." }); return true; }
        if (!artifact.filePath) { send(422, { error: DECK_DOWNLOAD_NOTICE }); return true; }
        const root = path.resolve(dataDir);
        const target = path.resolve(root, artifact.filePath);
        if (!target.startsWith(root + path.sep)) { send(400, { error: "unsafe file path." }); return true; }
        const bytes = await readFile(target);
        res.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "content-disposition": downloadName(artifact.title, idParam),
          "access-control-allow-origin": requestOrigin,
        });
        res.end(bytes);
        return true;
      }
      if (req.method === "PATCH" && url.pathname === "/api/slide-decks/artifact") {
        const input = UpdateSchema.parse(JSON.parse(await readBody(req)));
        const artifact = getSlideDeck(db, input.id, input.courseId);
        if (!artifact) { send(404, { error: "Slide deck not found." }); return true; }
        db.prepare("UPDATE studio_artifacts SET title = ?, collection = ? WHERE id = ? AND course_id = ? AND kind = 'slide_deck'")
          .run(input.title ?? artifact.title, input.collection ?? artifact.collection, input.id, input.courseId);
        send(200, getSlideDeck(db, input.id, input.courseId));
        return true;
      }
      if (req.method === "DELETE" && url.pathname === "/api/slide-decks/artifact") {
        if (!safeId || !course) { send(400, { error: "unsafe id or missing course." }); return true; }
        const artifact = getSlideDeck(db, idParam, course);
        if (!artifact) { send(404, { error: "Slide deck not found." }); return true; }
        const root = path.resolve(dataDir);
        const target = path.resolve(root, artifact.filePath);
        if (target.startsWith(root + path.sep)) await unlink(target).catch(() => undefined);
        db.prepare("DELETE FROM studio_artifacts WHERE id = ? AND course_id = ? AND kind = 'slide_deck'").run(idParam, course);
        send(200, { deleted: true });
        return true;
      }
      return false;
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error instanceof Error && /unsafe|No course sources|validation failed/.test(error.message) ? 400 : 502;
      send(status, { error: error instanceof Error ? error.message : "Slide deck request failed." });
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

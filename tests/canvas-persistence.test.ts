import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { createObject, emptyCanvasDocument } from "../src/canvas/model";
import { createCanvasPersistenceHandler } from "../server/canvas-persistence/http";
import { saveCanvasDocument } from "../server/canvas-persistence/service";

function createDatabase() {
  const database = new Database(":memory:");
  database.exec("CREATE TABLE lessons(id TEXT NOT NULL,course_id TEXT NOT NULL,title TEXT NOT NULL,PRIMARY KEY(course_id,id)); CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,lesson_id TEXT NOT NULL,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  database.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run("lesson-a", "course-a", "Lesson A");
  return database;
}

function input(expectedRevision: number, document = emptyCanvasDocument()) {
  return { id: "board-a", courseId: "course-a", lessonId: "lesson-a", name: "Board A", document, expectedRevision };
}

describe("canvas persistence compare-and-swap", () => {
  it("returns revision and stale conflicts through the HTTP handler", async () => {
    const database = createDatabase();
    const handler = createCanvasPersistenceHandler(database, "http://localhost");
    const call = async (expectedRevision: number) => {
      const request = Object.assign(Readable.from([JSON.stringify(input(expectedRevision))]), { method: "POST", url: "/api/canvases" }) as IncomingMessage;
      const responseState: { status?: number; body?: string } = {};
      const response = {
        writeHead(status: number) { responseState.status = status; return this; },
        end(body: string) { responseState.body = body; },
      } as unknown as ServerResponse;
      expect(await handler(request, response)).toBe(true);
      return { status: responseState.status, body: JSON.parse(responseState.body!) };
    };
    expect(await call(0)).toMatchObject({ status: 200, body: { id: "board-a", revision: 1 } });
    expect(await call(0)).toMatchObject({ status: 409, body: { code: "stale_revision", currentRevision: 1 } });
    database.close();
  });

  it("creates at revision zero and returns a conflict for a stale revision", () => {
    const database = createDatabase();
    const created = saveCanvasDocument(database, input(0));
    const stale = saveCanvasDocument(database, input(0));
    expect(created).toMatchObject({ status: 200, body: { id: "board-a", revision: 1 } });
    expect(stale).toMatchObject({ status: 409, body: { code: "stale_revision", currentRevision: 1 } });
    database.close();
  });

  it("allows only one of two simultaneous saves against the same revision", async () => {
    const database = createDatabase();
    saveCanvasDocument(database, input(0));
    const first = emptyCanvasDocument();
    const second = { ...emptyCanvasDocument(), objects: [createObject("concept", 1, 2)] };
    const results = await Promise.all([
      Promise.resolve().then(() => saveCanvasDocument(database, input(1, first))),
      Promise.resolve().then(() => saveCanvasDocument(database, input(1, second))),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect(database.prepare("SELECT revision FROM canvases WHERE id=?").get("board-a")).toEqual({ revision: 2 });
    const stored = JSON.parse((database.prepare("SELECT document FROM canvases WHERE id=?").get("board-a") as { document: string }).document);
    expect([first.objects, second.objects]).toContainEqual(stored.objects);
    database.close();
  });

  it("rejects nonzero revisions for a new board and mismatched scopes", () => {
    const database = createDatabase();
    expect(saveCanvasDocument(database, input(1))).toMatchObject({ status: 409, body: { code: "stale_revision", currentRevision: 0 } });
    saveCanvasDocument(database, input(0));
    expect(saveCanvasDocument(database, { ...input(1), courseId: "other-course" })).toMatchObject({ status: 409, body: { code: "scope_mismatch" } });
    expect(saveCanvasDocument(database, { ...input(0), id: "missing-lesson-board", lessonId: "missing" })).toMatchObject({ status: 400, body: { code: "lesson_not_found" } });
    database.close();
  });
});

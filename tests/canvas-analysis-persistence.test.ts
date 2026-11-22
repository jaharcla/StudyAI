import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initializeCanvasAnalysisStorage, loadCanvasAnalysis, saveCanvasAnalysis } from "../server/canvas-analysis/storage.js";
import { createCanvasAnalysisHandler } from "../server/canvas-analysis/http.js";

function db() {
  const database = new Database(":memory:");
  initializeCanvasAnalysisStorage(database);
  return database;
}

const analysis = { schemaVersion: 1, boardId: "b", courseId: "c", lessonId: "l", revision: 3, analysisStatus: "complete" };

describe("canvas analysis persistence", () => {
  it("stores and loads analysis only for the matching scope and revision", () => {
    const database = db();
    saveCanvasAnalysis(database, "b", "c", "l", 3, analysis);
    expect(loadCanvasAnalysis(database, "b", "c", "l", 3)).toEqual(analysis);
    expect(loadCanvasAnalysis(database, "b", "c", "l", 4)).toBeNull();
    expect(loadCanvasAnalysis(database, "b", "c", "other", 3)).toBeNull();
    database.close();
  });

  it("does not serve an unvalidatable or stale stored analysis through HTTP", async () => {
    const database = db();
    database.exec(`CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
      CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,name TEXT,revision INTEGER,document TEXT);`);
    database.prepare("INSERT INTO lessons VALUES('l','c','Lesson')").run();
    database.prepare("INSERT INTO canvases VALUES('b','c','l','Board',3,'{}')").run();
    saveCanvasAnalysis(database, "b", "c", "l", 3, analysis);
    const handler = createCanvasAnalysisHandler(database, "http://127.0.0.1:5183");
    const call = (url: string) => new Promise<{ status: number; body: { analysis?: unknown } }>((resolve, reject) => {
      const request = { method: "GET", url, headers: { host: "127.0.0.1:5183" } } as import("node:http").IncomingMessage;
      const response = {
        writeHead(status: number) { (this as { status?: number }).status = status; return this; },
        end(payload: string) { resolve({ status: (this as { status?: number }).status ?? 0, body: JSON.parse(payload) as { analysis?: unknown } }); },
      } as unknown as import("node:http").ServerResponse;
      handler(request, response).then((handled) => { if (!handled) reject(new Error("not handled")); }).catch(reject);
    });
    const fresh = await call("/api/canvases/b/analysis?course=c&lesson=l");
    expect(fresh.status).toBe(200);
    expect(fresh.body.analysis).toBeNull();
    database.prepare("UPDATE canvases SET revision=4 WHERE id='b'").run();
    const stale = await call("/api/canvases/b/analysis?course=c&lesson=l");
    expect(stale.body.analysis).toBeNull();
    database.close();
  });

  it("returns null for malformed stored JSON instead of throwing", () => {
    const database = db();
    saveCanvasAnalysis(database, "b", "c", "l", 3, analysis);
    database.prepare("UPDATE canvas_analyses SET result_json=? WHERE board_id=?").run("{not json", "b");
    expect(loadCanvasAnalysis(database, "b", "c", "l", 3)).toBeNull();
    database.close();
  });
});

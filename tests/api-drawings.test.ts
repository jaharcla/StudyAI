import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const folder = mkdtempSync(join(tmpdir(), "studyai-drawings-api-"));
const dbPath = join(folder, "drawings.sqlite");
let api: ChildProcess;
let origin: string;
let db: Database.Database;
let output = "";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = address && typeof address !== "string" ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function postDrawing(body: unknown): Promise<Response> {
  return fetch(`${origin}/api/drawings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeAll(async () => {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ["--import", "tsx", "server/api.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, STUDYAI_DB: dbPath, DATA_PORT: String(port), CANVAS_CLIP_WARMUP: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  api.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    if (api.exitCode !== null) throw new Error(`Data API exited before ready:\n${output}`);
    try { ready = (await fetch(`${origin}/api/courses`)).ok; } catch { /* not listening yet */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Data API did not start:\n${output}`);

  db = new Database(dbPath);
  db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run("course-1", "Course One", "C1", "#ef805c");
  db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run("course-2", "Course Two", "C2", "#7a9b7b");
  db.prepare("INSERT INTO drawings(id,course_id,snapshot,revision) VALUES(?,?,?,1)").run("drawing-1", "course-1", JSON.stringify({ atom1: { type: "circle" } }));
});

afterAll(async () => {
  db?.close();
  if (api && api.exitCode === null) {
    const exited = new Promise<void>((resolve) => api.once("exit", () => resolve()));
    api.kill();
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  }
  rmSync(folder, { recursive: true, force: true });
});

describe("POST /api/drawings ownership", () => {
  it("rejects a drawing ID posted under another course without changing the stored snapshot", async () => {
    const response = await postDrawing({ id: "drawing-1", courseId: "course-2", snapshot: { atom2: { type: "rect" } } });
    expect(response.status).toBe(409);
    expect(db.prepare("SELECT course_id,snapshot,revision FROM drawings WHERE id=?").get("drawing-1")).toMatchObject({
      course_id: "course-1",
      snapshot: JSON.stringify({ atom1: { type: "circle" } }),
      revision: 1,
    });
  });

  it("updates a drawing owned by the same course", async () => {
    const response = await postDrawing({ id: "drawing-1", courseId: "course-1", snapshot: { atom1: { type: "square" } } });
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT course_id,snapshot,revision FROM drawings WHERE id=?").get("drawing-1")).toMatchObject({
      course_id: "course-1",
      snapshot: JSON.stringify({ atom1: { type: "square" } }),
      revision: 2,
    });
  });

  it("inserts a new drawing scoped to the validated course", async () => {
    const response = await postDrawing({ id: "drawing-2", courseId: "course-2", snapshot: { atom3: { type: "triangle" } } });
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT course_id,snapshot,revision FROM drawings WHERE id=?").get("drawing-2")).toMatchObject({
      course_id: "course-2",
      snapshot: JSON.stringify({ atom3: { type: "triangle" } }),
      revision: 1,
    });
  });
});

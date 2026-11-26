import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const folder = mkdtempSync(join(tmpdir(), "studyai-api-errors-"));
const dbPath = join(folder, "api.sqlite");
const webOrigin = "http://127.0.0.1:5183";
const tunnelOrigin = "https://tunnel.example.test";
let api: ChildProcess;
let origin: string;
let db: Database.Database;
let slowServer: Server;
let output = "";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = address && typeof address !== "string" ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function post(path: string, payload: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: payload });
}

beforeAll(async () => {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  slowServer = createHttpServer((_req, res) => {
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ models: [] })); }, 400);
  });
  await new Promise<void>((resolve) => slowServer.listen(0, "127.0.0.1", resolve));
  const slowAddress = slowServer.address();
  const slowPort = slowAddress && typeof slowAddress !== "string" ? slowAddress.port : 0;
  api = spawn(process.execPath, ["--import", "tsx", "server/api.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, STUDYAI_DB: dbPath, STUDYAI_DOCUMENTS: join(folder, "documents"), DATA_PORT: String(port), KIMAKI_TUNNEL_URL: tunnelOrigin, OLLAMA_BASE_URL: `http://127.0.0.1:${slowPort}`, CANVAS_CLIP_WARMUP: "0" },
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
}, 30_000);

afterAll(async () => {
  db?.close();
  if (api && api.exitCode === null) {
    const exited = new Promise<void>((resolve) => api.once("exit", () => resolve()));
    api.kill();
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  }
  slowServer?.close();
  rmSync(folder, { recursive: true, force: true });
});

describe("request-scoped API errors and CORS", () => {
  it("gives concurrent requests from two allowed origins their own CORS header", async () => {
    const [slow, fast] = await Promise.all([
      fetch(`${origin}/api/models`, { headers: { origin: webOrigin } }),
      fetch(`${origin}/api/courses`, { headers: { origin: tunnelOrigin } }),
    ]);
    expect(slow.headers.get("access-control-allow-origin")).toBe(webOrigin);
    expect(fast.headers.get("access-control-allow-origin")).toBe(tunnelOrigin);
  });

  it("returns 400 with a client-safe message for malformed JSON", async () => {
    const response = await post("/api/courses", "{");
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
    expect(body.error).not.toMatch(/unexpected end|position|json input/i);
  });

  it("returns 413 when the request body exceeds the configured limit", async () => {
    const response = await post("/api/courses", JSON.stringify({ title: "x".repeat(1_100_000) }));
    expect(response.status).toBe(413);
  });

  it("returns 500 without leaking internals when a database error is thrown", async () => {
    db.exec("DROP TABLE lessons");
    const response = await fetch(`${origin}/api/lessons?course=course-1`);
    expect(response.status).toBe(500);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("Internal server error.");
    expect(body.error).not.toMatch(/no such table|lessons|sqlite/i);
  });
});

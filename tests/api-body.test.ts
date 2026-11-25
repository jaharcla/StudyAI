import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const folder = mkdtempSync(join(tmpdir(), "studyai-api-body-"));
const dbPath = join(folder, "body.sqlite");
const limit = 1_000_000;
let api: ChildProcess;
let origin: string;
let output = "";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = address && typeof address !== "string" ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function post(payload: string): Promise<Response> {
  return fetch(`${origin}/api/courses`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
}

function exactLimitPayload(): string {
  const empty = JSON.stringify({ title: "", code: "", color: "#ef805c" });
  return JSON.stringify({ title: "x".repeat(limit - empty.length), code: "", color: "#ef805c" });
}

function abortMidBody(): Promise<void> {
  return new Promise((resolve) => {
    const req = httpRequest(`${origin}/api/courses`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(limit) },
    });
    req.on("error", () => undefined);
    req.write('{"title":"');
    req.write("x".repeat(5_000));
    setTimeout(() => { req.destroy(); resolve(); }, 50);
  });
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
});

afterAll(async () => {
  if (api && api.exitCode === null) {
    const exited = new Promise<void>((resolve) => api.once("exit", () => resolve()));
    api.kill();
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  }
  rmSync(folder, { recursive: true, force: true });
});

describe("bounded body parsing", () => {
  it("accepts a body exactly at the configured limit", async () => {
    const payload = exactLimitPayload();
    expect(payload.length).toBe(limit);
    expect((await post(payload)).status).toBe(201);
  });

  it("returns 413 once for a body over the limit", async () => {
    const response = await post(`${exactLimitPayload()}x`);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "Payload too large." });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(output).not.toMatch(/ERR_HTTP_HEADERS_SENT|write after end|Cannot set headers/i);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await post("{");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid JSON body." });
  });

  it("survives a client abort without a second write or an unhandled failure", async () => {
    await abortMidBody();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(output).not.toMatch(/ERR_HTTP_HEADERS_SENT|write after end|Cannot set headers|unhandledRejection|UnhandledPromiseRejection/i);
    expect(output).not.toMatch(/StudyAI API request failed/i);
    expect((await fetch(`${origin}/api/courses`)).status).toBe(200);
  });
});

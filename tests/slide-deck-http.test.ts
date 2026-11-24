import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSlideDeckHandler } from "../server/presentations/http";
import { initializeStudioSchema } from "../server/studio/schema";
import type { Grounding } from "../server/studio/contracts";

const REF = "studyai://document/module-1/text/4?chunk=0";
const grounding: Grounding = {
  focus: "friction",
  sources: [{ ref: REF, documentId: "module-1", title: "Notes", location: "text 4", excerpt: "Friction opposes motion.", sourcePage: null }],
  concepts: [], canvas: [], packet: "Friction opposes motion.",
};

let server: Server;
let base: string;
let db: Database.Database;
let dataDir: string;

beforeAll(async () => {
  db = new Database(":memory:");
  initializeStudioSchema(db);
  dataDir = mkdtempSync(path.join(tmpdir(), "studyai-slide-decks-"));
  const handler = createSlideDeckHandler(db, {
    renderer: async () => ({ presentationId: "p1", pptxPath: "p1/final.pptx", editPath: "/e" }),
    readDeckText: async () => `# Friction\n# Friction opposes motion\nFriction opposes motion.\n> Source: text 4`,
    ground: () => grounding,
  }, "http://127.0.0.1", dataDir);
  server = createServer((req, res) => { void handler(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});

async function generate() {
  const response = await fetch(`${base}/api/slide-decks/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId: "chem-120", lessonId: "lesson-03", focus: "friction" }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; filePath: string }>;
}

describe("slide deck HTTP routes", () => {
  it("generates, lists and fetches a course-scoped artifact", async () => {
    const created = await generate();
    const list = await (await fetch(`${base}/api/slide-decks?course=chem-120`)).json() as Array<{ id: string }>;
    expect(list.map((item) => item.id)).toContain(created.id);
    const other = await fetch(`${base}/api/slide-decks/artifact?id=${created.id}&course=other`);
    expect(other.status).toBe(404);
  });

  it("downloads a stored file but rejects traversal ids", async () => {
    const created = await generate();
    const target = path.join(dataDir, created.filePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "pptx-bytes");
    const download = await fetch(`${base}/api/slide-decks/download?id=${created.id}&course=chem-120`);
    expect(download.status).toBe(200);
    expect(await download.text()).toBe("pptx-bytes");
    const traversal = await fetch(`${base}/api/slide-decks/download?id=${encodeURIComponent("../../secret")}&course=chem-120`);
    expect(traversal.status).toBe(400);
    expect(await traversal.text()).toMatch(/unsafe/);
  });

  it("renames and deletes an artifact", async () => {
    const created = await generate();
    const patched = await fetch(`${base}/api/slide-decks/artifact`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.id, courseId: "chem-120", title: "Renamed deck", collection: "Revision" }),
    });
    expect(patched.status).toBe(200);
    const after = await (await fetch(`${base}/api/slide-decks/artifact?id=${created.id}&course=chem-120`)).json() as { title: string };
    expect(after.title).toBe("Renamed deck");
    const removed = await fetch(`${base}/api/slide-decks/artifact?id=${created.id}&course=chem-120`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(existsSync(path.join(dataDir, created.filePath))).toBe(false);
  });
});

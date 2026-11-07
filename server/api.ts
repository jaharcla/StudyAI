import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, basename, resolve } from "node:path";
import { db } from "./db.js";

const port = 8201;
const json = (res: import("node:http").ServerResponse, status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/api/models") {
    try {
      const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"}/api/tags`);
      if (!response.ok) return json(res, 502, { error: `Ollama returned ${response.status}` });
      const data = await response.json() as { models?: Array<{ name: string; size: number }> };
      return json(res, 200, { models: data.models ?? [], configuredModel: process.env.OLLAMA_MODEL ?? "" });
    } catch {
      return json(res, 503, { error: "Ollama is unavailable" });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/courses") return json(res, 200, db.prepare("SELECT * FROM courses").all());
  if (req.method === "GET" && url.pathname === "/api/notes") return json(res, 200, db.prepare("SELECT * FROM notes WHERE course_id=? ORDER BY updated_at DESC").all(url.searchParams.get("course") ?? "chem-120"));
  if (req.method === "POST" && url.pathname === "/api/notes") {
    const input = JSON.parse(await body(req));
    const id = input.id ?? randomUUID();
    db.prepare("INSERT INTO notes(id,course_id,title,body,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,updated_at=CURRENT_TIMESTAMP").run(id, input.courseId, String(input.title).slice(0, 160), String(input.body).slice(0, 50000));
    return json(res, 200, { id });
  }
  if (req.method === "POST" && url.pathname === "/api/drawings") {
    const input = JSON.parse(await body(req));
    const id = input.id ?? randomUUID();
    db.prepare("INSERT INTO drawings(id,course_id,snapshot,revision) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,revision=drawings.revision+1,updated_at=CURRENT_TIMESTAMP").run(id, input.courseId, JSON.stringify(input.snapshot));
    return json(res, 200, { id });
  }
  if (req.method === "GET" && url.pathname === "/api/drawings") return json(res, 200, db.prepare("SELECT * FROM drawings WHERE course_id=? ORDER BY updated_at DESC LIMIT 1").get(url.searchParams.get("course") ?? "chem-120") ?? null);
  if (req.method === "POST" && url.pathname === "/api/documents") {
    const input = JSON.parse(await body(req));
    if (!input.name || typeof input.content !== "string" || extname(input.name).toLowerCase() !== ".txt") return json(res, 400, { error: "Only UTF-8 .txt import is currently enabled." });
    const id = randomUUID();
    const path = resolve("data/documents", `${id}-${basename(input.name)}`);
    await mkdir("data/documents", { recursive: true }); await writeFile(path, input.content, "utf8");
    const content = await readFile(path, "utf8");
    db.prepare("INSERT INTO documents(id,course_id,title,path) VALUES(?,?,?,?)").run(id, input.courseId, basename(input.name), path);
    const insert = db.prepare("INSERT INTO document_chunks(document_id,course_id,page,content) VALUES(?,?,NULL,?)").run(id, input.courseId, content);
    db.prepare("INSERT INTO chunk_search(rowid,content) VALUES(?,?)").run(insert.lastInsertRowid, content);
    return json(res, 201, { id, status: "indexed", pages: null });
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const query = url.searchParams.get("q") ?? "";
    const course = url.searchParams.get("course") ?? "chem-120";
    const terms = query.replace(/["*]/g, " ").trim().split(/\s+/).filter(Boolean).map((part) => `"${part}"`).join(" OR ");
    if (!terms) return json(res, 200, []);
    const rows = db.prepare("SELECT document_chunks.document_id, documents.title, document_chunks.page, snippet(chunk_search,0,'','', '…',24) AS excerpt, bm25(chunk_search) AS score FROM chunk_search JOIN document_chunks ON document_chunks.id=chunk_search.rowid JOIN documents ON documents.id=document_chunks.document_id WHERE chunk_search MATCH ? AND document_chunks.course_id=? ORDER BY score LIMIT 8").all(terms, course);
    return json(res, 200, rows);
  }
  return json(res, 404, { error: "not found" });
});
server.listen(port, "127.0.0.1", () => console.log(`StudyAI local data API on http://127.0.0.1:${port}`));
function body(req: import("node:http").IncomingMessage) { return new Promise<string>((resolveBody, reject) => { let value = ""; req.setEncoding("utf8"); req.on("data", (chunk) => { value += chunk; if (value.length > 1_000_000) reject(new Error("payload too large")); }); req.on("end", () => resolveBody(value)); req.on("error", reject); }); }

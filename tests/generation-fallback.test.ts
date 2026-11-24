import { createServer, type Server } from "node:http";
import Database from "better-sqlite3";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { renderPresentonDeck, type RendererDeps } from "../server/presentations/renderer";
import { generateSlideDeck } from "../server/presentations/service";
import { createSlideDeckHandler } from "../server/presentations/http";
import { generateStudioArtifact } from "../server/studio/service";
import { initializeStudioSchema } from "../server/studio/schema";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema";
import type { Grounding } from "../server/studio/contracts";
import type { StudioGenerator } from "../server/studio/service";

const COURSE = "course-1";
const LESSON = "lesson-1";
const REF = "studyai://document/doc-1/page/1?chunk=0";
const EXCERPT = "At equilibrium the vector sum of all forces is zero, so horizontal components cancel.";

const grounding: Grounding = {
  focus: "equilibrium",
  sources: [{ ref: REF, documentId: "doc-1", title: "Equilibrium", location: "page 1", excerpt: EXCERPT, sourcePage: 1 }],
  concepts: ["equilibrium"],
  canvas: [],
  packet: EXCERPT,
};

function deckDb(): Database.Database {
  const db = new Database(":memory:");
  initializeStudioSchema(db);
  return db;
}

function studioDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, code TEXT NOT NULL, color TEXT NOT NULL);
    CREATE TABLE lessons (id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY(course_id,id));
    CREATE TABLE learning_concepts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, name TEXT NOT NULL);
  `);
  db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run(COURSE, "Physics", "PHYS", "#abc");
  db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run("empty", "Empty", "EMPTY", "#abc");
  db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run(LESSON, COURSE, "Forces");
  db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run("empty", "empty", "No sources");
  db.prepare("INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES(?,?,?,?)").run("c1", "empty", "empty", "equilibrium");
  initializeDocumentIntelligenceSchema(db);
  db.prepare("INSERT INTO di_documents(id,course_id,title,filename,mime_type,storage_path,content_hash,lesson_id) VALUES(?,?,?,?,?,?,?,?)")
    .run("doc-1", COURSE, "notes.pdf", "notes.pdf", "application/pdf", "notes.pdf", "hash-1", LESSON);
  db.prepare("INSERT INTO di_units(document_id,unit_type,unit_number,title,content) VALUES(?,?,?,?,?)")
    .run("doc-1", "page", 1, "Equilibrium", EXCERPT);
  db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)")
    .run("doc-1", COURSE, "page", 1, 0, EXCERPT);
  initializeStudioSchema(db);
  return db;
}

describe("missing presentation renderer", () => {
  it("names the missing local service instead of throwing a raw fetch error", async () => {
    const deps: RendererDeps = {
      fetch: (async () => { throw new Error("fetch failed"); }) as unknown as typeof fetch,
      baseUrl: "http://127.0.0.1:5001",
      apiKey: "",
    };
    await expect(renderPresentonDeck({
      content: "", slides_markdown: ["# Friction"], n_slides: 1, template: "general",
      language: "English", export_as: "pptx", include_title_slide: false,
    }, deps)).rejects.toThrow(/presentation service \(Presenton\) is not available/i);
  });

  it("keeps the grounded slide deck usable when the renderer is absent", async () => {
    const db = deckDb();
    const artifact = await generateSlideDeck(db, { courseId: COURSE, lessonId: LESSON, focus: "equilibrium" }, {
      renderer: (async () => { throw new Error("fetch failed"); }),
      readDeckText: async () => "",
      ground: () => grounding,
    });
    expect(artifact.filePath).toBe("");
    expect(artifact.content.slides.length).toBeGreaterThan(1);
    expect(artifact.sourceRefs).toEqual([REF]);
    expect(artifact.notice).toMatch(/slides and citations are ready/i);
    expect(artifact.notice).toMatch(/Presenton/);
  });
});

describe("slide deck download of a deck without a rendered file", () => {
  let server: Server;
  let base: string;
  let db: Database.Database;

  beforeEach(async () => {
    db = deckDb();
    const handler = createSlideDeckHandler(db, {
      renderer: (async () => { throw new Error("fetch failed"); }),
      readDeckText: async () => "",
      ground: () => grounding,
    }, "http://127.0.0.1");
    server = createServer((req, res) => { void handler(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } }); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns a precise 422 instead of a 502 or a dead link", async () => {
    const created = await (await fetch(`${base}/api/slide-decks/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId: COURSE, lessonId: LESSON, focus: "equilibrium" }),
    })).json() as { id: string };
    const response = await fetch(`${base}/api/slide-decks/download?id=${created.id}&course=${COURSE}`);
    expect(response.status).toBe(422);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/presentation service/i);
    expect(body.error).not.toMatch(/busy/i);
  });
});

describe("studio generation with a reasoning model that returns no JSON", () => {
  let db: Database.Database;
  beforeEach(() => { db = studioDb(); });

  const input = { courseId: COURSE, lessonId: LESSON, kind: "study-guide" as const, focus: "equilibrium" };

  it("repairs a first response that was not JSON", async () => {
    const generator: StudioGenerator = (() => {
      let calls = 0;
      return async () => {
        calls += 1;
        if (calls === 1) return "Let me think about this.";
        return { sections: [
          { heading: "Equilibrium", body: EXCERPT, sourceRefs: [REF] },
          { heading: "Forces", body: EXCERPT, sourceRefs: [REF] },
        ] };
      };
    })();
    const artifact = await generateStudioArtifact(db, input, generator);
    expect((artifact.content as { sections: unknown[] }).sections).toHaveLength(2);
    expect(artifact.sourceRefs).toEqual([REF]);
  });

  it("falls back to cited course excerpts after one bounded repair", async () => {
    const generator: StudioGenerator = async () => "I cannot produce a JSON object right now.";
    const artifact = await generateStudioArtifact(db, input, generator);
    const content = artifact.content as { sections: Array<{ heading: string; body: string; sourceRefs: string[] }> };
    expect(content.sections[0].body).toContain("vector sum");
    expect(content.sections[0].sourceRefs).toEqual([REF]);
    expect(artifact.sourceRefs).toEqual([REF]);
    expect(artifact.notice).toMatch(/course material directly/i);
    expect(artifact.notice).not.toMatch(/did not return a JSON object/i);
  });

  it("exposes a plain reason when no grounded content can be built", async () => {
    const generator: StudioGenerator = async () => "no json";
    await expect(generateStudioArtifact(db, { courseId: "empty", lessonId: "empty", kind: "study-guide", focus: "equilibrium" }, generator))
      .rejects.toThrow(/couldn't turn this lesson/i);
  });
});

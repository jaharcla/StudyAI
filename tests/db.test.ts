import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const folder = mkdtempSync(join(tmpdir(), "studyai-db-test-"));
process.env.STUDYAI_DB = join(folder, "test.sqlite");
const { db } = await import("../server/db");

describe("local database", () => {
  it("starts with no sample courses and persists user course, lesson, note, drawing, and canvas data", () => {
    expect(db.prepare("SELECT count(*) AS total FROM courses").get()).toMatchObject({ total: 0 });
    db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run("course-1", "Course", "C1", "#ef805c");
    db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run("lesson-1", "course-1", "Lesson");
    db.prepare("INSERT INTO notes(id,course_id,lesson_id,title,body) VALUES(?,?,?,?,?)").run("note-1", "course-1", "lesson-1", "Notes", "Valence electrons");
    db.prepare("INSERT INTO drawings(id,course_id,snapshot) VALUES(?,?,?)").run("drawing-1", "course-1", JSON.stringify({ atom1: { type: "circle" } }));
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,document) VALUES(?,?,?,?,?)").run("canvas-1", "course-1", "lesson-1", "Board 1", JSON.stringify({ objects: [] }));
    expect(db.prepare("SELECT body FROM notes WHERE id=?").get("note-1")).toMatchObject({ body: "Valence electrons" });
    expect(db.prepare("SELECT snapshot FROM drawings WHERE id=?").get("drawing-1")).toMatchObject({ snapshot: '{"atom1":{"type":"circle"}}' });
    expect(db.prepare("SELECT name,document FROM canvases WHERE id=?").get("canvas-1")).toMatchObject({ name: "Board 1", document: '{"objects":[]}' });
  });
  it("initializes document schema repeatedly without changing legacy or canvas data", async () => {
    const { initializeDocumentIntelligenceSchema } = await import("../server/document-intelligence/schema");
    initializeDocumentIntelligenceSchema(db);
    initializeDocumentIntelligenceSchema(db);
    expect(db.prepare("SELECT count(*) AS total FROM lessons").get()).toMatchObject({ total: 1 });
    expect(db.prepare("SELECT name FROM canvases WHERE id='canvas-1'").get()).toMatchObject({ name: "Board 1" });
    expect((db.pragma("table_info(di_documents)") as Array<{ name: string }>).map((column) => column.name)).toContain("lesson_id");
    expect(db.prepare("SELECT body FROM notes WHERE id='note-1'").get()).toMatchObject({ body: "Valence electrons" });
  });

  it("backfills legacy canvas lesson scopes without inventing course-specific lesson content", async () => {
    const legacy = new Database(":memory:");
    legacy.exec("CREATE TABLE courses(id TEXT PRIMARY KEY); CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id)); CREATE TABLE canvases(id TEXT,course_id TEXT,lesson_id TEXT,name TEXT,document TEXT)");
    legacy.prepare("INSERT INTO courses(id) VALUES(?)").run("course-old");
    legacy.prepare("INSERT INTO canvases VALUES(?,?,?,?,?)").run("canvas-old", "course-old", "lesson-03", "Board 1", "{}");
    const { migrateCanvasLessons } = await import("../server/db");
    migrateCanvasLessons(legacy);
    expect(legacy.prepare("SELECT id,title FROM lessons WHERE course_id=?").get("course-old")).toEqual({ id: "lesson-03", title: "Lesson 03" });
    legacy.close();
  });
});

afterAll(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });

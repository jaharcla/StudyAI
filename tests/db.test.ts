import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const folder = mkdtempSync(join(tmpdir(), "studyai-db-test-"));
process.env.STUDYAI_DB = join(folder, "test.sqlite");
const { db } = await import("../server/db");

describe("local database", () => {
  it("seeds courses and persists notes and drawings", () => {
    expect(db.prepare("SELECT count(*) AS total FROM courses").get()).toMatchObject({ total: 3 });
    db.prepare("INSERT INTO notes(id,course_id,title,body) VALUES(?,?,?,?)").run("note-1", "chem-120", "Atomic structure", "Valence electrons");
    db.prepare("INSERT INTO drawings(id,course_id,snapshot) VALUES(?,?,?)").run("drawing-1", "chem-120", JSON.stringify({ atom1: { type: "circle" } }));
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,document) VALUES(?,?,?,?,?)").run("canvas-1", "chem-120", "lesson-03", "Board 1", JSON.stringify({ objects: [] }));
    expect(db.prepare("SELECT body FROM notes WHERE id=?").get("note-1")).toMatchObject({ body: "Valence electrons" });
    expect(db.prepare("SELECT snapshot FROM drawings WHERE id=?").get("drawing-1")).toMatchObject({ snapshot: '{"atom1":{"type":"circle"}}' });
    expect(db.prepare("SELECT name,document FROM canvases WHERE id=?").get("canvas-1")).toMatchObject({ name: "Board 1", document: '{"objects":[]}' });
  });
});

afterAll(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });

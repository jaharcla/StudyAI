import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { initializeLearningSchema } from "../server/learning/schema.js";
import { buildConceptGraph } from "../server/concept-graph.js";

function canvasDocument(objects: unknown[]) {
  return JSON.stringify({ version: 1, snapshot: { document: { store: {} } }, objects });
}

function conceptObject(id: string, title: string, conceptId: string) {
  return { id, kind: "concept", x: 0, y: 0, width: 160, height: 70, title, definition: "From the course", conceptId };
}

function relationObject(id: string, fromId: string, toId: string) {
  return { id, kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId, toId, label: "prerequisite of" };
}

function seededDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,name TEXT,document TEXT,revision INTEGER);
    CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT);`);
  initializeLearningSchema(db);
  db.exec(`INSERT INTO courses VALUES('c','Course','','#000');
    INSERT INTO lessons VALUES('l1','c','One');
    INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES('k1','c','l1','Cell biology'),('k2','c','l1','Genetics');`);
  return db;
}

describe("concept graph hot paths", () => {
  it("reuses prepared statements across requests on the same database", () => {
    const db = seededDb();
    const prepare = vi.spyOn(db, "prepare");
    buildConceptGraph(db, "c");
    const first = prepare.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    buildConceptGraph(db, "c");
    expect(prepare.mock.calls.length).toBe(first);
    prepare.mockRestore();
    db.close();
  });

  it("parses an unchanged saved board only once", () => {
    const db = seededDb();
    const document = canvasDocument([conceptObject("co1", "Cell biology", "k1"), conceptObject("co2", "Genetics", "k2"), relationObject("r1", "co1", "co2")]);
    db.prepare("INSERT INTO canvases VALUES('b1','c','l1','Board',?,1)").run(document);
    const parse = vi.spyOn(JSON, "parse");
    buildConceptGraph(db, "c");
    const first = parse.mock.calls.filter(([text]) => text === document).length;
    expect(first).toBe(1);
    buildConceptGraph(db, "c");
    expect(parse.mock.calls.filter(([text]) => text === document).length).toBe(first);
    parse.mockRestore();
    db.close();
  });

  it("reflects an edited saved board after the parse result was cached", () => {
    const db = seededDb();
    const before = canvasDocument([conceptObject("co1", "Cell biology", "k1"), conceptObject("co2", "Genetics", "k2")]);
    const after = canvasDocument([conceptObject("co1", "Cell biology", "k1"), conceptObject("co2", "Genetics", "k2"), relationObject("r1", "co1", "co2")]);
    db.prepare("INSERT INTO canvases VALUES('b1','c','l1','Board',?,1)").run(before);
    expect(buildConceptGraph(db, "c").edges).toEqual([]);
    db.prepare("UPDATE canvases SET document=?, revision=2 WHERE id='b1'").run(after);
    expect(buildConceptGraph(db, "c").edges).toEqual([{ source: "k1", target: "k2", label: "prerequisite of" }]);
    db.close();
  });
});

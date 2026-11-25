import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initializeLearningSchema } from "../server/learning/schema.js";
import { buildConceptGraph } from "../server/concept-graph.js";

function canvasDocument(objects: unknown[]) {
  return JSON.stringify({ version: 1, snapshot: { document: { store: {} } }, objects });
}

function conceptObject(id: string, title: string, conceptId?: string) {
  return { id, kind: "concept", x: 0, y: 0, width: 160, height: 70, title, definition: "From the course", ...(conceptId ? { conceptId } : {}) };
}

function seededDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,filename TEXT);
    CREATE TABLE di_units(id INTEGER PRIMARY KEY,document_id TEXT,unit_type TEXT,unit_number INTEGER,title TEXT,content TEXT);
    CREATE TABLE di_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,unit_type TEXT,unit_number INTEGER,chunk_index INTEGER,content TEXT);
    CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,name TEXT,document TEXT,revision INTEGER);
    INSERT INTO courses VALUES('c','Course','','#000'),('other','Other','','#111');
    INSERT INTO lessons VALUES('l1','c','One'),('l2','c','Two'),('lo','other','Elsewhere');
    INSERT INTO di_documents VALUES('d1','c','Cell notes','cell.txt');
    INSERT INTO di_units VALUES(1,'d1','page',1,'Page 1','DNA is in the nucleus.');
    INSERT INTO di_chunks VALUES(1,'d1','c','page',1,0,'DNA is in the nucleus.');`);
  initializeLearningSchema(db);
  db.exec(`INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES
      ('k1','c','l1','Cell biology'),('k2','c','l2','Genetics'),('k3','c','l2','Unused'),('ko','other','lo','Other concept');
    INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at)
      VALUES('q1','c','l1','k1',1,'Q?','[{"id":"a"}]','a','why','d1','Cell notes',1,'DNA is in the nucleus.','2026-01-01');
    INSERT INTO question_presentations(id,question_id,question_version,course_id,lesson_id) VALUES('p1','q1',1,'c','l1');
    INSERT INTO learning_attempts(id,idempotency_key,presentation_id,selected_choice,is_correct) VALUES('a1','k1','p1','b',0);
    INSERT INTO grading_evidence(id,attempt_id,question_id,question_version,source_document_id,source_title,source_page,source_excerpt,explanation,accepted)
      VALUES('e1','a1','q1',1,'d1','Cell notes',1,'DNA is in the nucleus.','why',1);
    INSERT INTO mastery_updates(id,attempt_id,concept_id,previous_mastery,mastery,evidence_id) VALUES('m1','a1','k1',0.1,0.2,'e1');
    INSERT INTO learning_events(id,schema_version,course_id,lesson_id,activity_attempt_id,activity_id,activity_version,objective_id,concept_id,task_id,source_refs_json,canvas_id,canvas_revision,canvas_document_json,checker_id,checker_version,outcome_status,response_json,details_json,previous_mastery,mastery_after,occurred_at)
      VALUES('ev1',1,'c','l2','at1','act1',1,'obj1','k2','task1','[]','board1',1,'{}','force',1,'correct','{}',NULL,0.1,0.8,'2026-01-02T00:00:00.000Z');`);
  db.prepare("INSERT INTO canvases VALUES('board1','c','l1','Relations',?,1)").run(canvasDocument([
    conceptObject("co1", "Cell biology", "k1"),
    conceptObject("co2", "Genetics", "k2"),
    conceptObject("co3", "No concept id", undefined),
    { id: "r1", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "co1", toId: "co2", label: "prerequisite of" },
    { id: "r2", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "co2", toId: "missing", label: "guessed" },
    { id: "r3", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "co1", toId: "co3", label: "title mismatch" },
  ]));
  db.prepare("INSERT INTO canvases VALUES('board2','other','lo','Other',?,1)").run(canvasDocument([
    conceptObject("xo1", "Other concept", "ko"),
    { id: "xr1", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "xo1", toId: "k1", label: "cross course" },
  ]));
  return db;
}

describe("concept graph assembly", () => {
  it("uses real concepts with truthful mastery and practice availability", () => {
    const db = seededDb();
    const graph = buildConceptGraph(db, "c", "Course");
    expect(graph.nodes).toHaveLength(3);
    const weak = graph.nodes.find((node) => node.id === "k1")!;
    expect(weak.label).toBe("Cell biology");
    expect(weak.lessonTitle).toBe("One");
    expect(weak.mastery).toBeCloseTo(0.2, 6);
    expect(weak.canPractice).toBe(true);
    expect(weak.sourceRef).toBe("studyai://document/d1/page/1?chunk=0");
    expect(graph.nodes.find((node) => node.id === "k2")).toMatchObject({ mastery: 0.8, canPractice: false });
    expect(graph.nodes.find((node) => node.id === "k3")).toMatchObject({ mastery: 0.1, canPractice: false });
    db.close();
  });

  it("keeps only canvas relationships whose endpoints are course concepts", () => {
    const db = seededDb();
    const graph = buildConceptGraph(db, "c", "Course");
    expect(graph.edges).toEqual([{ source: "k1", target: "k2", label: "prerequisite of" }]);
    expect(graph.nodes.find((node) => node.id === "k2")!.parentId).toBe("k1");
    expect(graph.nodes.find((node) => node.id === "k1")!.parentId).toBeNull();
    db.close();
  });

  it("is scoped to the course and deterministic", () => {
    const db = seededDb();
    expect(buildConceptGraph(db, "c")).toEqual(buildConceptGraph(db, "c"));
    expect(buildConceptGraph(db, "other").nodes.map((node) => node.id)).toEqual(["ko"]);
    expect(buildConceptGraph(db, "unknown")).toEqual({ title: "Course · concept graph", nodes: [], edges: [] });
    db.close();
  });

  it("omits edges that would rely on an ambiguous concept name", () => {
    const db = seededDb();
    // Legacy data can predate the unique (course, lesson, name) constraint.
    db.pragma("foreign_keys = OFF");
    db.exec(`ALTER TABLE learning_concepts RENAME TO learning_concepts_scoped;
      CREATE TABLE learning_concepts(id TEXT PRIMARY KEY, course_id TEXT, lesson_id TEXT, name TEXT);
      INSERT INTO learning_concepts SELECT id,course_id,lesson_id,name FROM learning_concepts_scoped;
      DROP TABLE learning_concepts_scoped;
      INSERT INTO learning_concepts VALUES('k4','c','l2','Shared'),('k5','c','l2','Shared');`);
    db.pragma("foreign_keys = ON");
    db.prepare("INSERT INTO canvases VALUES('board3','c','l2','Ambiguous',?,1)").run(canvasDocument([
      conceptObject("sa", "Shared"),
      conceptObject("su", "Unused"),
      conceptObject("sexp", "Anything", "k2"),
      { id: "ra", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "su", toId: "sa", label: "guessed" },
      { id: "rb", kind: "relationship", x: 0, y: 0, width: 40, height: 20, fromId: "su", toId: "sexp", label: "kept" },
    ]));
    const graph = buildConceptGraph(db, "c", "Course");
    expect(graph.edges).toEqual([
      { source: "k1", target: "k2", label: "prerequisite of" },
      { source: "k3", target: "k2", label: "kept" },
    ]);
    expect(graph.nodes.filter((node) => node.label === "Shared").map((node) => node.parentId)).toEqual([null, null]);
    db.close();
  });

  it("omits a citation when the referenced chunk does not resolve", () => {
    const db = seededDb();
    db.exec(`INSERT INTO di_documents VALUES('d2','c','Missing chunk','missing.txt');
      INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at)
        VALUES('q2','c','l2','k3',1,'Q?','[{"id":"a"}]','a','why','d2','Missing chunk',1,'No such chunk.','2026-01-03');`);
    const graph = buildConceptGraph(db, "c", "Course");
    const node = graph.nodes.find((item) => item.id === "k3")!;
    expect(node.sourceRef).toBeUndefined();
    expect(node.sourceLabel).toBe("Missing chunk");
    expect(node.detail).toBe("Missing chunk");
    db.close();
  });
});

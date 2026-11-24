import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initializeLearningSchema } from "../server/learning/schema.js";
import { getRecommendations, type Recommendation } from "../server/recommendations.js";

function seededDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT);
    CREATE TABLE document_chunks(id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT,course_id TEXT,page INTEGER,content TEXT);`);
  initializeLearningSchema(db);
  db.exec(`INSERT INTO courses VALUES('c','Course','','#000');
    INSERT INTO lessons VALUES('l1','c','One'),('l2','c','Two'),('l3','c','Three');
    INSERT INTO documents VALUES('d1','c','Cell notes','p');
    INSERT INTO document_chunks(document_id,course_id,page,content) VALUES('d1','c',1,'DNA lives in the nucleus.');
    INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES
      ('k1','c','l1','Cell biology'),('k2','c','l2','Genetics');
    INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at)
      VALUES('q1','c','l1','k1',1,'Q?','[{"id":"a"}]','a','why','d1','Cell notes',1,'DNA lives in the nucleus.','2026-01-01');
    INSERT INTO question_presentations(id,question_id,question_version,course_id,lesson_id) VALUES('p1','q1',1,'c','l1');
    INSERT INTO learning_attempts(id,idempotency_key,presentation_id,selected_choice,is_correct) VALUES('a1','k1','p1','b',0);
    INSERT INTO grading_evidence(id,attempt_id,question_id,question_version,source_document_id,source_title,source_page,source_excerpt,explanation,accepted)
      VALUES('e1','a1','q1',1,'d1','Cell notes',1,'DNA lives in the nucleus.','why',1);
    INSERT INTO mastery_updates(id,attempt_id,concept_id,previous_mastery,mastery,evidence_id) VALUES('m1','a1','k1',0.1,0.2,'e1');
    INSERT INTO learning_cards(id,concept_id,fsrs_state) VALUES
      ('card1','k1','{"due":"2020-01-01T00:00:00.000Z"}'),
      ('card2','k2','{"due":"2099-01-01T00:00:00.000Z"}');
    INSERT INTO learning_events(id,schema_version,course_id,lesson_id,activity_attempt_id,activity_id,activity_version,objective_id,concept_id,task_id,source_refs_json,canvas_id,canvas_revision,canvas_document_json,checker_id,checker_version,outcome_status,response_json,details_json,previous_mastery,mastery_after,occurred_at)
      VALUES
        ('ev0',1,'c','l2','at0','act1',1,'obj1','k2','task1','[{"sourceRef":"doc:d1:p1:c0","title":"Cell notes","excerpt":"DNA lives in the nucleus."}]','board1',1,'{}','force',1,'correct','{}',NULL,0.1,0.9,'2026-01-01T00:00:00.000Z'),
        ('ev1',1,'c','l2','at1','act1',1,'obj1','k2','task1','[{"sourceRef":"doc:d1:p1:c0","title":"Cell notes","excerpt":"DNA lives in the nucleus."}]','board1',2,'{}','force',1,'incorrect','{}',NULL,0.9,0.8,'2026-01-02T00:00:00.000Z');`);
  return db;
}

function expectCitedStudy(item: Recommendation, concept: string) {
  expect(item.action.kind).toBe("study");
  expect(item.title).toContain(concept);
  expect(item.reason.length).toBeGreaterThan(20);
  expect(item.source).toMatchObject({ title: "Cell notes", excerpt: "DNA lives in the nucleus." });
}

describe("recommendations", () => {
  it("ranks a due, weak concept first with a citation and plain-language reason", () => {
    const db = seededDb();
    const items = getRecommendations(db, "c");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].kind).toBe("review");
    expectCitedStudy(items[0], "Cell biology");
    expect(items[0].lessonId).toBe("l1");
    db.close();
  });

  it("is deterministic, bounded and free of duplicate concepts", () => {
    const db = seededDb();
    const first = getRecommendations(db, "c");
    const second = getRecommendations(db, "c");
    expect(second).toEqual(first);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(new Set(first.map((item) => item.conceptId ?? item.lessonId)).size).toBe(first.length);
    db.close();
  });

  it("routes canvas mistakes to Canvas and a fresh lesson to Studio", () => {
    const db = seededDb();
    const items = getRecommendations(db, "c");
    const canvas = items.find((item) => item.kind === "canvas");
    expect(canvas).toBeDefined();
    expect(canvas!.action.kind).toBe("canvas");
    expect(canvas!.source?.title).toBe("Cell notes");
    const studio = items.find((item) => item.kind === "start");
    expect(studio).toBeDefined();
    expect(studio!.action.kind).toBe("studio");
    expect(studio!.source?.title).toBe("Cell notes");
    db.close();
  });

  it("honours lesson scope and never invents recommendations for an unknown course", () => {
    const db = seededDb();
    const scoped = getRecommendations(db, "c", "l1");
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((item) => item.lessonId === "l1")).toBe(true);
    expect(getRecommendations(db, "unknown")).toEqual([]);
    db.close();
  });
});

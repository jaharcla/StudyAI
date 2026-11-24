import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initializeLearningSchema } from "../server/learning/schema.js";
import { buildDailyPlan } from "../server/daily-plans.js";

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
      ('k1','c','l1','Cell biology'),('k2','c','l2','Genetics'),('k3','c','l1','Derived concept');
    INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at)
      VALUES('q1','c','l1','k1',1,'Q?','[{"id":"a"}]','a','why','d1','Cell notes',1,'DNA lives in the nucleus.','2026-01-01');
    INSERT INTO question_presentations(id,question_id,question_version,course_id,lesson_id) VALUES('p1','q1',1,'c','l1');
    INSERT INTO learning_attempts(id,idempotency_key,presentation_id,selected_choice,is_correct) VALUES('a1','k1','p1','b',0);
    INSERT INTO grading_evidence(id,attempt_id,question_id,question_version,source_document_id,source_title,source_page,source_excerpt,explanation,accepted)
      VALUES('e1','a1','q1',1,'d1','Cell notes',1,'DNA lives in the nucleus.','why',1);
    INSERT INTO mastery_updates(id,attempt_id,concept_id,previous_mastery,mastery,evidence_id) VALUES('m1','a1','k1',0.1,0.2,'e1');
    INSERT INTO learning_cards(id,concept_id,fsrs_state) VALUES
      ('card1','k1','{"due":"2020-01-01T00:00:00.000Z"}'),
      ('card2','k2','{"due":"2099-01-01T00:00:00.000Z"}'),
      ('card3','k3','{"due":"2020-01-01T00:00:00.000Z"}');
    INSERT INTO learning_events(id,schema_version,course_id,lesson_id,activity_attempt_id,activity_id,activity_version,objective_id,concept_id,task_id,source_refs_json,canvas_id,canvas_revision,canvas_document_json,checker_id,checker_version,outcome_status,response_json,details_json,previous_mastery,mastery_after,occurred_at)
      VALUES
        ('ev0',1,'c','l2','at0','act1',1,'obj1','k2','task1','[{"sourceRef":"doc:d1:p1:c0","title":"Cell notes","excerpt":"DNA lives in the nucleus."}]','board1',1,'{}','force',1,'correct','{}',NULL,0.1,0.9,'2026-01-01T00:00:00.000Z'),
        ('ev1',1,'c','l2','at1','act1',1,'obj1','k2','task1','[{"sourceRef":"doc:d1:p1:c0","title":"Cell notes","excerpt":"DNA lives in the nucleus."}]','board1',2,'{}','force',1,'incorrect','{}',NULL,0.9,0.8,'2026-01-02T00:00:00.000Z');`);
  return db;
}

describe("daily plans", () => {
  it("produces a dated sequence with citation or honest label", () => {
    const db = seededDb();
    const now = new Date("2026-11-24T12:00:00.000Z");
    const plan = buildDailyPlan(db, "c", now);
    expect(plan.date).toBe("2026-11-24");
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) {
      expect(item.day >= "2026-11-24" && item.day <= "2026-11-26").toBe(true);
      expect(item.grounding === "cited" ? item.source !== null : true).toBe(true);
      if (item.source !== null) expect(item.grounding).toBe("cited");
      else expect(item.grounding).toBe("derived");
    }
    // review first on day 0
    expect(plan.items[0].kind).toBe("review");
    expect(plan.items[0].day).toBe("2026-11-24");
    // canvas on later day
    const canvas = plan.items.find((i) => i.kind === "canvas");
    expect(canvas).toBeDefined();
    expect(canvas!.day > "2026-11-24").toBe(true);
    // start last
    const start = plan.items.find((i) => i.kind === "start");
    expect(start).toBeDefined();
    expect(plan.items[plan.items.length - 1].kind).toBe("start");
    db.close();
  });

  it("is deterministic, bounded and unique", () => {
    const db = seededDb();
    const now = new Date("2026-11-24T12:00:00.000Z");
    const first = buildDailyPlan(db, "c", now);
    const second = buildDailyPlan(db, "c", now);
    expect(second).toEqual(first);
    expect(first.items.length).toBeLessThanOrEqual(5);
    expect(new Set(first.items.map((i) => i.id)).size).toBe(first.items.length);
    db.close();
  });

  it("honours lesson scope and returns empty for unknown course", () => {
    const db = seededDb();
    const now = new Date("2026-11-24T12:00:00.000Z");
    const scoped = buildDailyPlan(db, "c", now, "l1");
    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every((item) => item.lessonId === "l1")).toBe(true);
    expect(buildDailyPlan(db, "unknown", now).items).toEqual([]);
    db.close();
  });

  it("labels derived items honestly", () => {
    const db = seededDb();
    const now = new Date("2026-11-24T12:00:00.000Z");
    const plan = buildDailyPlan(db, "c", now);
    const derived = plan.items.find((i) => i.grounding === "derived");
    expect(derived).toBeDefined();
    expect(derived!.source).toBeNull();
    expect(derived!.reason.length).toBeGreaterThan(0);
    db.close();
  });
});

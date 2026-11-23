import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initializeLearningSchema } from "../server/learning/schema.js";
import { getCourseProgress } from "../server/progress.js";

function seededDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));`);
  initializeLearningSchema(db);
  db.exec(`INSERT INTO courses VALUES('c','Course','','#000');
    INSERT INTO lessons VALUES('l1','c','One'),('l2','c','Two');
    INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES('k1','c','l1','Concept A');
    INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at)
      VALUES('q1','c','l1','k1',1,'Q?','[{"id":"a"}]','a','why','d','Doc',1,'excerpt','2026-01-01');
    INSERT INTO question_presentations(id,question_id,question_version,course_id,lesson_id) VALUES('p1','q1',1,'c','l1'),('p2','q1',1,'c','l1');
    INSERT INTO learning_attempts(id,idempotency_key,presentation_id,selected_choice,is_correct) VALUES('a1','k1','p1','a',1),('a2','k2','p2','b',0);
    INSERT INTO grading_evidence(id,attempt_id,question_id,question_version,source_document_id,source_title,source_page,source_excerpt,explanation,accepted)
      VALUES('e1','a1','q1',1,'d','Doc',1,'excerpt','why',1),('e2','a2','q1',1,'d','Doc',1,'excerpt','why',0);
    INSERT INTO mastery_updates(id,attempt_id,concept_id,previous_mastery,mastery,evidence_id) VALUES('m1','a1','k1',0.1,0.8,'e1');
    INSERT INTO learning_cards(id,concept_id,fsrs_state) VALUES('card1','k1','{"due":"2099-01-01T00:00:00.000Z"}');`);
  return db;
}

describe("course progress aggregation", () => {
  it("aggregates real attempts and mastery from local tables", () => {
    const db = seededDb();
    expect(getCourseProgress(db, "c")).toMatchObject({
      totalAttempts: 2,
      totalCorrect: 1,
      conceptsMastered: 1,
      dueReviews: 0,
      lessons: [
        { id: "l1", attempts: 2, correct: 1 },
        { id: "l2", attempts: 0, correct: 0 },
      ],
    });
    expect(getCourseProgress(db, "c")).not.toHaveProperty("streak");
    db.close();
  });

  it("returns zeros and no lessons for a course with no activity", () => {
    const db = seededDb();
    expect(getCourseProgress(db, "other")).toEqual({
      totalAttempts: 0, totalCorrect: 0, conceptsMastered: 0, dueReviews: 0, lessons: [],
    });
    db.close();
  });
});

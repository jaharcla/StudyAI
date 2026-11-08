import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningService } from "../server/learning/service.js";
import { updateMastery } from "../server/learning/bkt.js";

const folder = mkdtempSync(join(tmpdir(), "studyai-learning-"));
const path = join(folder, "learning.sqlite");
let database: Database.Database;
const time = new Date("2026-11-08T17:00:00.000Z");
function setup() {
  database = new Database(path);
  database.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT);
    CREATE TABLE document_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,page INTEGER,content TEXT);`);
  database.prepare("INSERT INTO courses VALUES('c','Course','','#000000')").run();
  database.prepare("INSERT INTO lessons VALUES('l','c','Lesson')").run();
  database.prepare("INSERT INTO documents VALUES('d','c','Source','source.txt')").run();
  database.prepare("INSERT INTO document_chunks(document_id,course_id,page,content) VALUES('d','c',4,'Water is H2O, composed of hydrogen and oxygen.')").run();
  return new LearningService(database, () => new Date(time));
}
afterEach(() => { database?.close(); rmSync(folder, { recursive: true, force: true }); mkdirSync(folder, { recursive: true }); });

describe("adaptive learning subsystem", () => {
  it("adds its schema without changing existing course, document, note, attempt, or canvas records", () => {
    database = new Database(path);
    database.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
      CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
      CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT);
      CREATE TABLE document_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,page INTEGER,content TEXT);
      CREATE TABLE notes(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE attempts(id TEXT PRIMARY KEY,answer TEXT);
      CREATE TABLE canvases(id TEXT PRIMARY KEY,document TEXT);
      INSERT INTO courses VALUES('c','Course','','#000000'); INSERT INTO lessons VALUES('l','c','Lesson');
      INSERT INTO notes VALUES('n','keep note'); INSERT INTO attempts VALUES('a','keep attempt'); INSERT INTO canvases VALUES('b','keep canvas');`);
    new LearningService(database, () => new Date(time));
    expect(database.prepare("SELECT body FROM notes WHERE id='n'").get()).toEqual({ body: "keep note" });
    expect(database.prepare("SELECT answer FROM attempts WHERE id='a'").get()).toEqual({ answer: "keep attempt" });
    expect(database.prepare("SELECT document FROM canvases WHERE id='b'").get()).toEqual({ document: "keep canvas" });
  });

  it("updates BKT only after accepted evidence and uses source-backed deterministic grading", () => {
    const learning = setup();
    const q = learning.addReviewedQuestion({ courseId: "c", lessonId: "l", concept: "Water composition", prompt: "What is water's formula?", choices: [{ id: "a", text: "H2O" }, { id: "b", text: "CO2" }], correctChoice: "a", explanation: "Water has two hydrogen atoms and one oxygen atom.", sourceDocumentId: "d", sourcePage: 4, sourceExcerpt: "Water is H2O, composed of hydrogen and oxygen." });
    const presented = learning.ask("c", "l")!;
    expect(presented.choices).toHaveLength(2);
    expect((presented as object)).not.toHaveProperty("correctChoice");
    const graded = learning.submit({ presentationId: presented.presentationId, idempotencyKey: "attempt-1", choiceId: "a" });
    expect(graded).toMatchObject({ correct: true, source: { documentId: "d", page: 4 }, mastery: updateMastery(0.1, true) });
    expect(learning.submit({ presentationId: presented.presentationId, idempotencyKey: "attempt-1", choiceId: "a" })).toMatchObject({ duplicate: true });
    expect(database.prepare("SELECT count(*) total FROM mastery_updates").get()).toMatchObject({ total: 1 });
    expect(database.prepare("SELECT accepted,source_excerpt FROM grading_evidence").get()).toMatchObject({ accepted: 1, source_excerpt: "Water is H2O, composed of hydrogen and oxygen." });
    expect(q.version).toBe(1);
  });

  it("persists review state across a database reopen and stores exact deterministic FSRS due time", () => {
    let learning = setup();
    learning.addReviewedQuestion({ courseId: "c", lessonId: "l", concept: "Water composition", prompt: "What is water's formula?", choices: [{ id: "a", text: "H2O" }, { id: "b", text: "CO2" }], correctChoice: "a", explanation: "Water has two hydrogen atoms and one oxygen atom.", sourceDocumentId: "d", sourcePage: 4, sourceExcerpt: "Water is H2O, composed of hydrogen and oxygen." });
    const presented = learning.ask("c", "l")!;
    learning.submit({ presentationId: presented.presentationId, idempotencyKey: "attempt-2", choiceId: "b" });
    learning = new LearningService(database, () => new Date(time));
    expect(learning.resume("c", "l")).toMatchObject({ phase: "rate", result: { attempt_id: expect.any(String), source_excerpt: "Water is H2O, composed of hydrogen and oxygen." } });
    const cardId = database.prepare("SELECT id FROM learning_cards").get() as { id: string };
    const due = learning.rate({ cardId: cardId.id, idempotencyKey: "review-1", rating: "Again" });
    expect(due).toMatchObject({ dueAt: expect.any(String), rating: "Again" });
    expect(Date.parse(due.dueAt!)).toBeGreaterThan(time.getTime());
    expect((JSON.parse((database.prepare("SELECT fsrs_state FROM learning_cards WHERE id=?").get(cardId.id) as { fsrs_state: string }).fsrs_state) as { due: string }).due).toBe(due.dueAt);
    expect(learning.ask("c", "l")).toBeNull();
    database.close();
    database = new Database(path);
    learning = new LearningService(database, () => new Date(time));
    expect(learning.resume("c", "l")).toMatchObject({ phase: "ready", dueCard: { card_id: cardId.id } });
    expect(learning.rate({ cardId: cardId.id, idempotencyKey: "review-1", rating: "Again" })).toMatchObject({ duplicate: true });
    expect(database.prepare("SELECT count(*) total FROM review_logs").get()).toMatchObject({ total: 1 });
  });

  it("accepts all four FSRS ratings, applies mastery to incorrect evidence, and resumes the scheduled queue", () => {
    let learning = setup();
    const ratings = ["Again", "Hard", "Good", "Easy"] as const;
    for (const rating of ratings) learning.addReviewedQuestion({ courseId: "c", lessonId: "l", concept: `Rating ${rating}`, prompt: `Question for ${rating}`, choices: [{ id: "a", text: "Correct" }, { id: "b", text: "Incorrect" }], correctChoice: "a", explanation: "The cited source supports the correct choice.", sourceDocumentId: "d", sourcePage: 4, sourceExcerpt: "Water is H2O, composed of hydrogen and oxygen." });
    const encountered = new Set<string>();
    for (const [index, rating] of ratings.entries()) {
      const question = learning.ask("c", "l");
      expect(question).not.toBeNull();
      encountered.add(question!.conceptId);
      const grade = learning.submit({ presentationId: question!.presentationId, idempotencyKey: `rating-attempt-${rating}`, choiceId: index === 0 ? "b" : "a" });
      if (!("mastery" in grade)) throw new Error("Attempt unexpectedly deduplicated.");
      if (index === 0) { expect(grade.correct).toBe(false); expect(grade.mastery).toBeGreaterThan(0.1); }
      const card = database.prepare("SELECT id,fsrs_state FROM learning_cards WHERE concept_id=?").get(question!.conceptId) as { id: string; fsrs_state: string };
      const result = learning.rate({ cardId: card.id, idempotencyKey: `rating-log-${rating}`, rating });
      expect(result.rating).toBe(rating);
      expect(result.dueAt).toBe((JSON.parse((database.prepare("SELECT fsrs_state FROM learning_cards WHERE id=?").get(card.id) as { fsrs_state: string }).fsrs_state) as { due: string }).due);
      expect(Date.parse(result.dueAt!)).toBeGreaterThan(time.getTime());
    }
    expect(encountered.size).toBe(4);
    expect(database.prepare("SELECT rating FROM review_logs ORDER BY rowid").all()).toEqual(ratings.map((rating) => ({ rating })));
    expect(database.prepare("SELECT count(*) total FROM grading_evidence WHERE accepted=1").get()).toMatchObject({ total: 4 });
    expect(learning.ask("c", "l")).toBeNull();
    database.close();
    database = new Database(path);
    learning = new LearningService(database, () => new Date(time));
    expect(learning.resume("c", "l")).toMatchObject({ phase: "ready", dueCard: expect.any(Object) });
  });
});

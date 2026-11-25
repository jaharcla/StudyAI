import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningService } from "../server/learning/service.js";
import { updateMastery } from "../server/learning/bkt.js";
import { initializeStudioSchema } from "../server/studio/schema.js";

const folder = mkdtempSync(join(tmpdir(), "studyai-practice-"));
const path = join(folder, "practice.sqlite");
let database: Database.Database;
const time = new Date("2026-11-24T12:00:00.000Z");
const EXCERPT = "Water is H2O, composed of hydrogen and oxygen.";
const REF = "studyai://document/d/page/4?chunk=0";

function setup() {
  database = new Database(path);
  database.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT);
    CREATE TABLE document_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,page INTEGER,content TEXT);`);
  database.prepare("INSERT INTO courses VALUES('c','Course','','#000000')").run();
  database.prepare("INSERT INTO lessons VALUES('l','c','Lesson')").run();
  database.prepare("INSERT INTO documents VALUES('d','c','Source','source.txt')").run();
  database.prepare("INSERT INTO document_chunks(document_id,course_id,page,content) VALUES('d','c',4,?)").run(EXCERPT);
  initializeStudioSchema(database);
  const content = {
    cards: [],
    questions: [
      { concept: "Water composition", prompt: "What is water's formula?", choices: [{ id: "a", text: "H2O" }, { id: "b", text: "CO2" }], correctChoice: "a", explanation: "Two hydrogen atoms and one oxygen atom.", sourceRef: REF, sourceDocumentId: "d", sourcePage: 4, sourceExcerpt: EXCERPT },
      { concept: "Water composition", prompt: "Which elements make up water?", choices: [{ id: "a", text: "Hydrogen and oxygen" }, { id: "b", text: "Carbon and oxygen" }], correctChoice: "a", explanation: "The formula H2O names hydrogen and oxygen.", sourceRef: REF, sourceDocumentId: "d", sourcePage: 4, sourceExcerpt: EXCERPT },
    ],
  };
  database.prepare("INSERT INTO studio_artifacts(id,course_id,lesson_id,kind,title,content,source_refs,created_at) VALUES('art','c','l','practice','Practice test',?,?,?)")
    .run(JSON.stringify(content), JSON.stringify([REF]), time.toISOString());
  return new LearningService(database, () => new Date(time));
}
afterEach(() => { database?.close(); rmSync(folder, { recursive: true, force: true }); mkdirSync(folder, { recursive: true }); });

describe("grounded practice test", () => {
  it("grades a correct answer, records BKT mastery and schedules an FSRS review, with the answer key and citation", () => {
    const learning = setup();
    const result = learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "art", questionIndex: 0, choiceId: "a", idempotencyKey: "k-correct" });
    expect(result).toMatchObject({
      correct: true,
      correctChoiceId: "a",
      correctAnswerText: "H2O",
      source: { documentId: "d", title: "Source", page: 4, excerpt: EXCERPT, sourceRef: REF },
      mastery: updateMastery(0.1, true),
      duplicate: false,
    });
    expect(result.explanation).toContain("hydrogen");
    expect(Date.parse(result.dueAt)).toBeGreaterThan(time.getTime());
    expect(database.prepare("SELECT count(*) total FROM mastery_updates").get()).toMatchObject({ total: 1 });
    expect(database.prepare("SELECT rating FROM review_logs").get()).toMatchObject({ rating: "Good" });
  });

  it("records a miss as incorrect and schedules an earlier review", () => {
    const learning = setup();
    const result = learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "art", questionIndex: 0, choiceId: "b", idempotencyKey: "k-miss" });
    expect(result).toMatchObject({ correct: false, correctChoiceId: "a", correctAnswerText: "H2O", mastery: updateMastery(0.1, false), duplicate: false });
    expect(database.prepare("SELECT rating FROM review_logs").get()).toMatchObject({ rating: "Again" });
    expect(database.prepare("SELECT count(*) total FROM grading_evidence WHERE accepted=1").get()).toMatchObject({ total: 1 });
  });

  it("is idempotent and never accepts an answer that is not in the grounded question", () => {
    const learning = setup();
    const first = learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "art", questionIndex: 1, choiceId: "a", idempotencyKey: "k-same" });
    const again = learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "art", questionIndex: 1, choiceId: "a", idempotencyKey: "k-same" });
    expect(again).toMatchObject({ duplicate: true, correct: true, correctAnswerText: "Hydrogen and oxygen" });
    expect(database.prepare("SELECT count(*) total FROM mastery_updates").get()).toMatchObject({ total: 1 });
    expect(() => learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "art", questionIndex: 1, choiceId: "made-up", idempotencyKey: "k-bad" })).toThrow(/presented answers/);
    expect(() => learning.recordPracticeAnswer({ courseId: "c", lessonId: "l", artifactId: "missing", questionIndex: 0, choiceId: "a", idempotencyKey: "k-none" })).toThrow(/no longer available/i);
    expect(first.duplicate).toBe(false);
  });
});

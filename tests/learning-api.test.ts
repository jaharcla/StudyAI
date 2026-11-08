import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import Database from "better-sqlite3";
import { LearningService } from "../server/learning/service.js";
import { createLearningHandler } from "../server/learning/http.js";

const db = new Database(":memory:");
db.exec(`CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT);
CREATE TABLE document_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,page INTEGER,content TEXT);
CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT);
CREATE TABLE di_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,unit_type TEXT,unit_number INTEGER,content TEXT);
INSERT INTO courses VALUES('c','Course','','#000000'); INSERT INTO lessons VALUES('l','c','Lesson');
INSERT INTO documents VALUES('d','c','Source','source.txt');
INSERT INTO document_chunks(document_id,course_id,page,content) VALUES('d','c',2,'A cell contains DNA in its nucleus.');
INSERT INTO di_documents VALUES('di-d','c','Indexed source');
INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,content) VALUES('di-d','c','page',2,'A cell contains DNA in its nucleus.');`);
const service = new LearningService(db, () => new Date("2026-11-08T17:00:00.000Z"));
const server = createServer(async (req, res) => { if (!await createLearningHandler(service)(req, res)) { res.writeHead(404); res.end(); } });
let origin = "";
beforeAll(async () => { await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (address && typeof address !== "string") origin = `http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); });

describe("learning HTTP contract", () => {
  it("supports ask, deterministic submission, explicit rating, and durable resume", async () => {
    const create = await fetch(`${origin}/api/study/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: "c", lessonId: "l", concept: "Cell biology", prompt: "Where is DNA located?", choices: [{ id: "a", text: "Nucleus" }, { id: "b", text: "Ribosome" }], correctChoice: "a", explanation: "The source states DNA is in the nucleus.", sourceDocumentId: "di-d", sourcePage: 2, sourceExcerpt: "A cell contains DNA in its nucleus.", reviewed: true }) });
    expect(create.status).toBe(201);
    const ask = await fetch(`${origin}/api/study/ask?course=c&lesson=l`);
    const question = await ask.json() as { presentationId: string; choices: unknown[] };
    expect(question.choices).toHaveLength(2);
    const submit = () => fetch(`${origin}/api/study/attempts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentationId: question.presentationId, idempotencyKey: "api-attempt", choiceId: "a" }) });
    const result = await (await submit()).json() as { correct: boolean; evidenceId: string; mastery: number };
    expect(result).toMatchObject({ correct: true, mastery: expect.any(Number) });
    expect(await (await submit()).json()).toMatchObject({ duplicate: true });
    const card = db.prepare("SELECT id FROM learning_cards").get() as { id: string };
    const rated = await fetch(`${origin}/api/study/reviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: card.id, idempotencyKey: "api-review", rating: "Easy" }) });
    expect(rated.status).toBe(200);
    expect(await (await fetch(`${origin}/api/study/resume?course=c&lesson=l`)).json()).toMatchObject({ phase: "ready", dueCard: { card_id: card.id } });
    expect(db.prepare("SELECT count(*) total FROM grading_evidence WHERE accepted=1").get()).toMatchObject({ total: 1 });
  });
});

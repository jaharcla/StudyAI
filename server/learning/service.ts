import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import { updateMastery, DEFAULT_BKT, selectWeakest } from "./bkt.js";
import { RateCardSchema, SubmitAttemptSchema, type Rating as StudyRating } from "./contracts.js";
import { initializeLearningSchema } from "./schema.js";
import { LearningEventSchema, type LearningEvent } from "../../src/learning/activities/contracts.js";

type QuestionDraft = { courseId: string; lessonId: string; concept: string; prompt: string; choices: Array<{ id: string; text: string }>; correctChoice: string; explanation: string; sourceDocumentId: string; sourcePage?: number | null; sourceExcerpt: string };
type ReviewableQuestion = { id: string; version: number; concept_id: string; concept: string; prompt: string; choices: string; source_document_id: string; source_title: string; source_page: number | null; source_excerpt: string };

export class LearningService {
  private readonly scheduler = fsrs({ enable_fuzz: false });
  private lastMasteryTimestamp = 0;
  constructor(private readonly database: Database.Database, private readonly now: () => Date = () => new Date()) { initializeLearningSchema(database); }

  addReviewedQuestion(input: QuestionDraft) {
    const choices = input.choices;
    if (!this.database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) throw new Error("Lesson not found in this course.");
    if (!input.concept.trim() || !input.prompt.trim() || choices.length < 2 || new Set(choices.map((item) => item.id)).size !== choices.length || !choices.some((item) => item.id === input.correctChoice)) throw new Error("Question content is invalid.");
    const chunks = this.database.prepare("SELECT d.title,c.page,c.content FROM documents d JOIN document_chunks c ON c.document_id=d.id WHERE d.id=? AND d.course_id=?").all(input.sourceDocumentId, input.courseId) as Array<{ title: string; page: number | null; content: string }>;
    if (this.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='di_documents'").get()) {
      const documentIntelligenceChunks = this.database.prepare("SELECT d.title,CASE WHEN c.unit_type='page' THEN c.unit_number ELSE NULL END page,c.content FROM di_documents d JOIN di_chunks c ON c.document_id=d.id WHERE d.id=? AND d.course_id=?").all(input.sourceDocumentId, input.courseId) as Array<{ title: string; page: number | null; content: string }>;
      chunks.push(...documentIntelligenceChunks);
    }
    const source = chunks.find((chunk) => chunk.content.includes(input.sourceExcerpt) && (input.sourcePage == null || chunk.page === input.sourcePage));
    if (!source || !input.sourceExcerpt.trim()) throw new Error("Citation must match text and page in a document from this course.");
    const create = this.database.transaction(() => {
      const concept = this.database.prepare("SELECT id FROM learning_concepts WHERE course_id=? AND lesson_id=? AND name=?").get(input.courseId, input.lessonId, input.concept.trim()) as { id: string } | undefined;
      const conceptId = concept?.id ?? randomUUID();
      if (!concept) this.database.prepare("INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES(?,?,?,?)").run(conceptId, input.courseId, input.lessonId, input.concept.trim());
      const prior = this.database.prepare("SELECT id,MAX(version) AS version FROM reviewed_questions WHERE concept_id=? AND prompt=?").get(conceptId, input.prompt.trim()) as { id: string | null; version: number | null };
      const id = prior.id ?? randomUUID();
      const version = (prior.version ?? 0) + 1;
      this.database.prepare("INSERT INTO reviewed_questions(id,course_id,lesson_id,concept_id,version,prompt,choices,correct_choice,explanation,source_document_id,source_title,source_page,source_excerpt,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, input.courseId, input.lessonId, conceptId, version, input.prompt.trim(), JSON.stringify(choices), input.correctChoice, input.explanation.trim(), input.sourceDocumentId, source.title, input.sourcePage ?? null, input.sourceExcerpt, this.now().toISOString());
      this.ensureCard(conceptId);
      return { id, version, conceptId };
    });
    return create();
  }

  ask(courseId: string, lessonId: string) {
    const candidates = this.database.prepare(`SELECT q.id,q.version,q.concept_id,k.name concept,q.prompt,q.choices,q.source_document_id,q.source_title,q.source_page,q.source_excerpt,
      COALESCE((SELECT e.value FROM learning_mastery_evidence e WHERE e.concept_id=q.concept_id ORDER BY e.occurred_at DESC,e.sequence DESC LIMIT 1),0.1) mastery
      FROM reviewed_questions q JOIN learning_concepts k ON k.id=q.concept_id JOIN learning_cards c ON c.concept_id=k.id WHERE q.course_id=? AND q.lesson_id=? AND json_extract(c.fsrs_state,'$.due')<=? AND q.rowid=(SELECT MAX(q2.rowid) FROM reviewed_questions q2 WHERE q2.id=q.id)
      AND NOT EXISTS(SELECT 1 FROM question_presentations p JOIN reviewed_questions pq ON pq.id=p.question_id AND pq.version=p.question_version WHERE pq.concept_id=q.concept_id AND p.status='asked')`).all(courseId, lessonId, this.now().toISOString()) as Array<ReviewableQuestion & { mastery: number }>;
    const chosen = selectWeakest(candidates);
    if (!chosen) return null;
    const id = randomUUID();
    this.database.prepare("INSERT INTO question_presentations(id,question_id,question_version,course_id,lesson_id) VALUES(?,?,?,?,?)").run(id, chosen.id, chosen.version, courseId, lessonId);
    return this.publicQuestion(chosen, id);
  }

  resume(courseId: string, lessonId: string) {
    const pending = this.database.prepare(`SELECT p.id presentation_id,q.*,k.name concept FROM question_presentations p JOIN reviewed_questions q ON q.id=p.question_id AND q.version=p.question_version JOIN learning_concepts k ON k.id=q.concept_id WHERE p.course_id=? AND p.lesson_id=? AND p.status='asked' ORDER BY p.created_at DESC LIMIT 1`).get(courseId, lessonId) as (ReviewableQuestion & { presentation_id: string }) | undefined;
    if (pending) return { phase: "answer", question: this.publicQuestion(pending, pending.presentation_id) };
    const recent = this.database.prepare(`SELECT a.id attempt_id,a.is_correct,a.selected_choice,q.explanation,q.source_document_id,q.source_title,q.source_page,q.source_excerpt,c.id card_id,c.fsrs_state,m.mastery
      FROM learning_attempts a JOIN question_presentations p ON p.id=a.presentation_id JOIN reviewed_questions q ON q.id=p.question_id AND q.version=p.question_version
      JOIN learning_concepts k ON k.id=q.concept_id JOIN learning_cards c ON c.concept_id=k.id JOIN mastery_updates m ON m.attempt_id=a.id WHERE p.course_id=? AND p.lesson_id=? AND NOT EXISTS(SELECT 1 FROM review_logs r WHERE r.attempt_id=a.id) ORDER BY a.rowid DESC LIMIT 1`).get(courseId, lessonId) as Record<string, unknown> | undefined;
    if (recent) return { phase: "rate", result: recent };
    const due = this.database.prepare(`SELECT c.id card_id,c.fsrs_state,k.name concept,k.course_id,k.lesson_id FROM learning_cards c JOIN learning_concepts k ON k.id=c.concept_id WHERE k.course_id=? AND k.lesson_id=? ORDER BY json_extract(c.fsrs_state,'$.due') LIMIT 1`).get(courseId, lessonId) as Record<string, unknown> | undefined;
    return due ? { phase: "ready", dueCard: due } : { phase: "ready", dueCard: null };
  }

  submit(raw: unknown) {
    const input = SubmitAttemptSchema.parse(raw);
    const old = this.database.prepare(`SELECT a.*,e.id evidence_id,e.source_document_id,e.source_title,e.source_page,e.source_excerpt,e.explanation,m.mastery,m.previous_mastery FROM learning_attempts a
      JOIN grading_evidence e ON e.attempt_id=a.id JOIN mastery_updates m ON m.attempt_id=a.id WHERE a.idempotency_key=?`).get(input.idempotencyKey) as Record<string, unknown> | undefined;
    if (old) return { duplicate: true, ...old };
    const presentation = this.database.prepare("SELECT p.id AS presentation_id,p.course_id,p.lesson_id,p.status,q.* FROM question_presentations p JOIN reviewed_questions q ON q.id=p.question_id AND q.version=p.question_version WHERE p.id=?").get(input.presentationId) as ({ presentation_id: string; course_id: string; lesson_id: string; status: string; correct_choice: string; explanation: string } & ReviewableQuestion) | undefined;
    if (!presentation || presentation.status !== "asked") throw new Error("Question presentation is unavailable or already answered.");
    const choices = JSON.parse(presentation.choices) as Array<{ id: string }>;
    if (!choices.some((item) => item.id === input.choiceId)) throw new Error("Choose one of the presented answers.");
    const attemptId = randomUUID(), evidenceId = randomUUID(), updateId = randomUUID();
    const correct = input.choiceId === presentation.correct_choice;
    const result = this.database.transaction(() => {
      this.database.prepare("INSERT INTO learning_attempts(id,idempotency_key,presentation_id,selected_choice,is_correct) VALUES(?,?,?,?,?)").run(attemptId, input.idempotencyKey, presentation.presentation_id, input.choiceId, Number(correct));
      this.database.prepare("UPDATE question_presentations SET status='answered' WHERE id=?").run(presentation.presentation_id);
      this.database.prepare("INSERT INTO grading_evidence(id,attempt_id,question_id,question_version,source_document_id,source_title,source_page,source_excerpt,explanation,accepted) VALUES(?,?,?,?,?,?,?,?,?,1)").run(evidenceId, attemptId, presentation.id, presentation.version, presentation.source_document_id, presentation.source_title, presentation.source_page, presentation.source_excerpt, presentation.explanation);
      const prior = this.latestMastery(presentation.concept_id) ?? DEFAULT_BKT.pInit;
      const mastery = updateMastery(prior, correct);
      this.database.prepare("INSERT INTO mastery_updates(id,attempt_id,concept_id,previous_mastery,mastery,evidence_id,created_at) VALUES(?,?,?,?,?,?,?)").run(updateId, attemptId, presentation.concept_id, prior, mastery, evidenceId, this.nextMasteryTimestamp());
      this.ensureCard(presentation.concept_id);
      return { attemptId, evidenceId, correct, explanation: presentation.explanation, source: { documentId: presentation.source_document_id, title: presentation.source_title, page: presentation.source_page, excerpt: presentation.source_excerpt }, mastery, duplicate: false };
    });
    return result();
  }

  recordActivityEvidence(input: Omit<LearningEvent, "schemaVersion" | "id" | "conceptId" | "mastery" | "occurredAt"> & { concept: string }): LearningEvent {
    if (!this.database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) throw new Error("Lesson not found in this course.");
    const conceptName = input.concept.trim();
    if (!conceptName || conceptName.length > 160) throw new Error("Learning evidence needs a valid concept.");
    const run = this.database.transaction(() => {
      const existingConcept = this.database.prepare("SELECT id FROM learning_concepts WHERE course_id=? AND lesson_id=? AND name=?").get(input.courseId, input.lessonId, conceptName) as { id: string } | undefined;
      const conceptId = existingConcept?.id ?? randomUUID();
      if (!existingConcept) this.database.prepare("INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES(?,?,?,?)").run(conceptId, input.courseId, input.lessonId, conceptName);
      const previous = this.latestMastery(conceptId) ?? DEFAULT_BKT.pInit;
      const value = updateMastery(previous, input.outcome.status === "correct");
      const occurredAt = this.nextMasteryTimestamp();
      const { concept: _concept, ...eventInput } = input;
      const event = LearningEventSchema.parse({ ...eventInput, schemaVersion: 1, id: randomUUID(), conceptId, mastery: { previous, value }, occurredAt });
      this.database.prepare(`INSERT INTO learning_events(id,schema_version,course_id,lesson_id,activity_attempt_id,activity_id,activity_version,objective_id,concept_id,task_id,
        source_refs_json,canvas_id,canvas_revision,checker_id,checker_version,outcome_status,response_json,details_json,previous_mastery,mastery_after,occurred_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        event.id, event.schemaVersion, event.courseId, event.lessonId, event.activityAttemptId, event.activityId, event.activityVersion, event.objectiveId, event.conceptId, event.taskId,
        JSON.stringify(event.sourceRefs), event.canvas.id, event.canvas.revision, event.outcome.checkerId, event.outcome.checkerVersion, event.outcome.status,
        JSON.stringify(event.outcome.response), event.outcome.details ? JSON.stringify(event.outcome.details) : null, event.mastery.previous, event.mastery.value, event.occurredAt,
      );
      return event;
    });
    return run.immediate();
  }

  rate(raw: unknown) {
    const input = RateCardSchema.parse(raw);
    const existing = this.database.prepare("SELECT * FROM review_logs WHERE idempotency_key=?").get(input.idempotencyKey);
    if (existing) return { duplicate: true, ...existing as object };
    const card = this.database.prepare("SELECT * FROM learning_cards WHERE id=?").get(input.cardId) as { id: string; concept_id: string; fsrs_state: string } | undefined;
    const attempt = this.database.prepare("SELECT a.id FROM learning_attempts a JOIN question_presentations p ON p.id=a.presentation_id JOIN reviewed_questions q ON q.id=p.question_id JOIN learning_cards c ON c.concept_id=q.concept_id WHERE c.id=? AND NOT EXISTS(SELECT 1 FROM review_logs r WHERE r.attempt_id=a.id) ORDER BY a.rowid DESC LIMIT 1").get(input.cardId) as { id: string } | undefined;
    if (!card || !attempt) throw new Error("Card or unrated answer not found.");
    const now = this.now();
    const saved = JSON.parse(card.fsrs_state) as SerializedCard;
    const current = hydrateCard(saved);
    const fsrsRating = Rating[input.rating as StudyRating];
    const preview = this.scheduler.repeat(current, now);
    const item = preview[fsrsRating];
    const next = item.card;
    const dueAt = next.due.toISOString();
    const logId = randomUUID();
    const newState: SerializedCard = serializeCard(next);
    const save = this.database.transaction(() => {
      this.database.prepare("UPDATE learning_cards SET fsrs_state=?,updated_at=? WHERE id=?").run(JSON.stringify(newState), now.toISOString(), card.id);
      this.database.prepare("INSERT INTO review_logs(id,card_id,rating,reviewed_at,due_at,state,attempt_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?)").run(logId, card.id, input.rating, now.toISOString(), dueAt, State[next.state], attempt.id, input.idempotencyKey);
    });
    save();
    return { duplicate: false, cardId: card.id, rating: input.rating, reviewedAt: now.toISOString(), dueAt, state: State[next.state] };
  }

  private ensureCard(conceptId: string) {
    if (this.database.prepare("SELECT 1 FROM learning_cards WHERE concept_id=?").get(conceptId)) return;
    const card = createEmptyCard(this.now());
    this.database.prepare("INSERT INTO learning_cards(id,concept_id,fsrs_state) VALUES(?,?,?)").run(randomUUID(), conceptId, JSON.stringify(serializeCard(card)));
  }
  private latestMastery(conceptId: string): number | undefined {
    const row = this.database.prepare("SELECT value FROM learning_mastery_evidence WHERE concept_id=? ORDER BY occurred_at DESC,sequence DESC LIMIT 1").get(conceptId) as { value: number } | undefined;
    return row?.value;
  }
  private nextMasteryTimestamp(): string {
    const latest = this.database.prepare("SELECT MAX(occurred_at) AS occurred_at FROM learning_mastery_evidence").get() as { occurred_at: string | null };
    const prior = latest.occurred_at ? Date.parse(latest.occurred_at) : 0;
    const value = Math.max(this.now().getTime(), Number.isFinite(prior) ? prior + 1 : 0, this.lastMasteryTimestamp + 1);
    this.lastMasteryTimestamp = value;
    return new Date(value).toISOString();
  }
  private publicQuestion(question: ReviewableQuestion, presentationId: string) {
    return { presentationId, questionId: question.id, version: question.version, conceptId: question.concept_id, concept: question.concept, prompt: question.prompt, choices: JSON.parse(question.choices), source: { documentId: question.source_document_id, title: question.source_title, page: question.source_page, excerpt: question.source_excerpt } };
  }
}

type SerializedCard = Omit<Card, "due" | "last_review"> & { due: string; last_review?: string };
function serializeCard(card: Card): SerializedCard {
  const { due, last_review, ...rest } = card;
  return { ...rest, due: due.toISOString(), ...(last_review ? { last_review: last_review.toISOString() } : {}) };
}
function hydrateCard(card: SerializedCard): Card {
  const { due, last_review, ...rest } = card;
  return { ...rest, due: new Date(due), ...(last_review ? { last_review: new Date(last_review) } : {}) };
}

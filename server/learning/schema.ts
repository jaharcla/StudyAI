import type Database from "better-sqlite3";

export function initializeLearningSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_concepts (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id), lesson_id TEXT NOT NULL,
      name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(course_id, lesson_id, name), FOREIGN KEY(course_id, lesson_id) REFERENCES lessons(course_id, id)
    );
    CREATE TABLE IF NOT EXISTS reviewed_questions (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, concept_id TEXT NOT NULL REFERENCES learning_concepts(id),
      version INTEGER NOT NULL, prompt TEXT NOT NULL, choices TEXT NOT NULL, correct_choice TEXT NOT NULL,
      explanation TEXT NOT NULL, source_document_id TEXT NOT NULL, source_title TEXT NOT NULL, source_page INTEGER,
      source_excerpt TEXT NOT NULL, reviewed_at TEXT NOT NULL, UNIQUE(id, version)
    );
    CREATE TABLE IF NOT EXISTS question_presentations (
      id TEXT PRIMARY KEY, question_id TEXT NOT NULL, question_version INTEGER NOT NULL, course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'asked', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(question_id, question_version) REFERENCES reviewed_questions(id, version)
    );
    CREATE TABLE IF NOT EXISTS learning_attempts (
      id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, presentation_id TEXT NOT NULL UNIQUE REFERENCES question_presentations(id),
      selected_choice TEXT NOT NULL, is_correct INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS grading_evidence (
      id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES learning_attempts(id), question_id TEXT NOT NULL,
      question_version INTEGER NOT NULL, source_document_id TEXT NOT NULL, source_title TEXT NOT NULL,
      source_page INTEGER, source_excerpt TEXT NOT NULL, explanation TEXT NOT NULL, accepted INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mastery_updates (
      id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES learning_attempts(id), concept_id TEXT NOT NULL REFERENCES learning_concepts(id),
      previous_mastery REAL NOT NULL, mastery REAL NOT NULL, evidence_id TEXT NOT NULL REFERENCES grading_evidence(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL,
      activity_attempt_id TEXT NOT NULL, activity_id TEXT NOT NULL, activity_version INTEGER NOT NULL,
      objective_id TEXT NOT NULL, concept_id TEXT NOT NULL REFERENCES learning_concepts(id), task_id TEXT NOT NULL,
      source_refs_json TEXT NOT NULL, canvas_id TEXT NOT NULL, canvas_revision INTEGER NOT NULL, canvas_document_json TEXT NOT NULL,
      checker_id TEXT NOT NULL, checker_version INTEGER NOT NULL, outcome_status TEXT NOT NULL CHECK(outcome_status IN ('correct','incorrect')),
      response_json TEXT NOT NULL, details_json TEXT, previous_mastery REAL NOT NULL, mastery_after REAL NOT NULL,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY(course_id, lesson_id) REFERENCES lessons(course_id, id)
    );
    CREATE TABLE IF NOT EXISTS learning_cards (
      id TEXT PRIMARY KEY, concept_id TEXT NOT NULL UNIQUE REFERENCES learning_concepts(id),
      fsrs_state TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS review_logs (
      id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES learning_cards(id), rating TEXT NOT NULL CHECK(rating IN ('Again','Hard','Good','Easy')),
      reviewed_at TEXT NOT NULL, due_at TEXT NOT NULL, state TEXT NOT NULL, attempt_id TEXT NOT NULL REFERENCES learning_attempts(id),
      idempotency_key TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS learning_questions_scope_idx ON reviewed_questions(course_id, lesson_id, concept_id, reviewed_at);
    CREATE INDEX IF NOT EXISTS learning_presentations_resume_idx ON question_presentations(course_id, lesson_id, status, created_at);
    CREATE INDEX IF NOT EXISTS learning_cards_due_idx ON learning_cards(updated_at);
    CREATE INDEX IF NOT EXISTS learning_events_concept_idx ON learning_events(course_id, lesson_id, concept_id, occurred_at DESC);
    CREATE VIEW IF NOT EXISTS learning_mastery_evidence AS
      SELECT concept_id,mastery AS value,created_at AS occurred_at,rowid AS sequence FROM mastery_updates
      UNION ALL
      SELECT concept_id,mastery_after AS value,occurred_at,rowid AS sequence FROM learning_events;
  `);
  const eventColumns = database.prepare("PRAGMA table_info(learning_events)").all() as Array<{ name: string }>;
  if (!eventColumns.some((column) => column.name === "canvas_document_json")) database.exec("ALTER TABLE learning_events ADD COLUMN canvas_document_json TEXT NOT NULL DEFAULT 'null'");
}

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
  `);
}

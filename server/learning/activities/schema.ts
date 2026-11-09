import type Database from "better-sqlite3";

export function initializeActivitySchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_activity_specs (
      spec_key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(course_id, lesson_id, id, version),
      FOREIGN KEY(course_id, lesson_id) REFERENCES lessons(course_id, id)
    );
    CREATE INDEX IF NOT EXISTS learning_activity_specs_scope_idx ON learning_activity_specs(course_id, lesson_id, id, version DESC);
    CREATE TABLE IF NOT EXISTS learning_activity_attempts (
      id TEXT PRIMARY KEY,
      spec_key TEXT NOT NULL REFERENCES learning_activity_specs(spec_key),
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      canvas_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      artifact_bindings_json TEXT NOT NULL,
      initial_document_json TEXT NOT NULL,
      source_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(course_id, lesson_id) REFERENCES lessons(course_id, id)
    );
    CREATE INDEX IF NOT EXISTS learning_activity_attempts_scope_idx ON learning_activity_attempts(course_id, lesson_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS learning_activity_attempt_events (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES learning_activity_attempts(id),
      idempotency_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('submission','hint')),
      task_id TEXT NOT NULL,
      canvas_revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const columns = new Set((database.pragma("table_info(learning_activity_attempts)") as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("source_snapshot_json")) database.exec("ALTER TABLE learning_activity_attempts ADD COLUMN source_snapshot_json TEXT NOT NULL DEFAULT '{}'");
}

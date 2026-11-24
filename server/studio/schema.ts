import type Database from "better-sqlite3";

export function initializeStudioSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_artifacts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_refs TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      collection TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS studio_artifacts_scope_idx ON studio_artifacts(course_id, lesson_id, kind, created_at DESC);
  `);
  // Additive columns: older databases keep their rows and gain defaulted values.
  const columns = db.prepare("PRAGMA table_info(studio_artifacts)").all() as Array<{ name: string }>;
  const has = (name: string) => columns.some((column) => column.name === name);
  if (!has("collection")) db.exec("ALTER TABLE studio_artifacts ADD COLUMN collection TEXT NOT NULL DEFAULT ''");
  if (!has("file_path")) db.exec("ALTER TABLE studio_artifacts ADD COLUMN file_path TEXT NOT NULL DEFAULT ''");
  if (!has("acceptance")) db.exec("ALTER TABLE studio_artifacts ADD COLUMN acceptance TEXT NOT NULL DEFAULT 'pending'");
  db.exec("CREATE INDEX IF NOT EXISTS studio_artifacts_collection_idx ON studio_artifacts(course_id, collection, created_at DESC)");
}

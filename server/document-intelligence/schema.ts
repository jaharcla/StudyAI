import type Database from "better-sqlite3";

export function initializeDocumentIntelligenceSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS di_documents (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, filename TEXT NOT NULL,
      mime_type TEXT NOT NULL, storage_path TEXT NOT NULL, content_hash TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS di_documents_course_idx ON di_documents(course_id, imported_at);
    CREATE TABLE IF NOT EXISTS di_units (
      id INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES di_documents(id) ON DELETE CASCADE,
      unit_type TEXT NOT NULL CHECK(unit_type IN ('page','slide','text')), unit_number INTEGER NOT NULL,
      title TEXT, content TEXT NOT NULL, UNIQUE(document_id, unit_type, unit_number)
    );
    CREATE TABLE IF NOT EXISTS di_chunks (
      id INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES di_documents(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL, unit_type TEXT NOT NULL, unit_number INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL, content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS di_chunks_course_doc_idx ON di_chunks(course_id, document_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS di_chunk_search USING fts5(content, content='di_chunks', content_rowid='id', tokenize='unicode61');
    CREATE TRIGGER IF NOT EXISTS di_chunks_ai AFTER INSERT ON di_chunks BEGIN
      INSERT INTO di_chunk_search(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS di_chunks_ad AFTER DELETE ON di_chunks BEGIN
      INSERT INTO di_chunk_search(di_chunk_search, rowid, content) VALUES ('delete', old.id, old.content);
    END;
  `);
  const columns = db.pragma("table_info(di_documents)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "content_hash")) db.exec("ALTER TABLE di_documents ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS di_documents_course_hash_idx ON di_documents(course_id, content_hash) WHERE content_hash <> ''");
  db.pragma("foreign_keys = ON");
}

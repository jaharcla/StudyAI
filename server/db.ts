import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.env.STUDYAI_DB ?? "data/studyai.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, code TEXT NOT NULL, color TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS document_chunks (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, course_id TEXT NOT NULL, page INTEGER, content TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS chunk_search USING fts5(content, content='document_chunks', content_rowid='id');
  CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, concept TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL, correct INTEGER NOT NULL, confidence INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS drawings (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, snapshot TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS canvases (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, name TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')));
`);
db.prepare("INSERT OR IGNORE INTO courses VALUES (?, ?, ?, ?)").run("chem-120", "CHEM 120", "General chemistry", "#ef805c");
db.prepare("INSERT OR IGNORE INTO courses VALUES (?, ?, ?, ?)").run("biol-130", "BIOL 130", "Cell biology", "#7a9b7b");
db.prepare("INSERT OR IGNORE INTO courses VALUES (?, ?, ?, ?)").run("kin-120", "KIN 120", "Biomechanics", "#7d91c8");

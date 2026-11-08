import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.env.STUDYAI_DB ?? "data/studyai.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, code TEXT NOT NULL, color TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lessons (id TEXT NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id), title TEXT NOT NULL, PRIMARY KEY(course_id,id));
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS document_chunks (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, course_id TEXT NOT NULL, page INTEGER, content TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS chunk_search USING fts5(content, content='document_chunks', content_rowid='id');
  CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, concept TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL, correct INTEGER NOT NULL, confidence INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS drawings (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, snapshot TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS canvases (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, name TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')));
`);
const noteColumns = db.pragma("table_info(notes)") as Array<{ name: string }>;
if (!noteColumns.some((column) => column.name === "lesson_id")) db.exec("ALTER TABLE notes ADD COLUMN lesson_id TEXT");
export function migrateCanvasLessons(database: Database.Database): void {
  const scopes = database.prepare("SELECT DISTINCT course_id,lesson_id FROM canvases WHERE lesson_id IS NOT NULL AND lesson_id<>''").all() as Array<{ course_id: string; lesson_id: string }>;
  const courseExists = database.prepare("SELECT 1 FROM courses WHERE id=?");
  const lessonExists = database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?");
  const insertLesson = database.prepare("INSERT OR IGNORE INTO lessons(id,course_id,title) VALUES(?,?,?)");
  const migrate = database.transaction(() => {
    for (const { course_id, lesson_id } of scopes) {
      if (courseExists.get(course_id) && !lessonExists.get(course_id, lesson_id)) insertLesson.run(lesson_id, course_id, legacyLessonTitle(lesson_id));
    }
  });
  migrate();
}

function legacyLessonTitle(id: string): string {
  const number = id.match(/(?:^|[-_ ])(\d+)$/)?.[1];
  return number ? `Lesson ${number}` : `Lesson ${id}`;
}

migrateCanvasLessons(db);
db.exec("CREATE INDEX IF NOT EXISTS canvases_scope_idx ON canvases(course_id,lesson_id,updated_at)");

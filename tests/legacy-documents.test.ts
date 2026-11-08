import { afterAll, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacyDocuments } from "../server/document-intelligence/legacy";
import { deleteDocument, getDocument, searchDocuments } from "../server/document-intelligence/service";

const folder = mkdtempSync(join(tmpdir(), "studyai-legacy-"));
const db = new Database(":memory:");
db.exec("CREATE TABLE courses(id TEXT PRIMARY KEY); INSERT INTO courses VALUES('legacy-course'); CREATE TABLE documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,path TEXT,imported_at TEXT DEFAULT CURRENT_TIMESTAMP)");
const path = join(folder, "old-notes.txt");
writeFileSync(path, "Legacy marker LEGACY-934. Carbon has four valence electrons.");
db.prepare("INSERT INTO documents(id,course_id,title,path) VALUES(?,?,?,?)").run("legacy-document", "legacy-course", "Old notes.txt", path);

it("indexes existing documents without changing their IDs, files or legacy rows", async () => {
  expect(await migrateLegacyDocuments(db)).toEqual({ migrated: 1, failures: [] });
  expect(getDocument(db, "legacy-course", "legacy-document")?.filename).toBe("Old notes.txt");
  expect(searchDocuments(db, "legacy-course", "LEGACY-934")[0]).toMatchObject({ documentId: "legacy-document", unitType: "text" });
  expect(existsSync(path)).toBe(true);
  expect(db.prepare("SELECT id FROM documents").get()).toEqual({ id: "legacy-document" });
  expect(await migrateLegacyDocuments(db)).toEqual({ migrated: 0, failures: [] });
});

it("records missing-file failures without deleting existing metadata", async () => {
  db.prepare("INSERT INTO documents(id,course_id,title,path) VALUES(?,?,?,?)").run("missing", "legacy-course", "Missing.txt", join(folder, "missing.txt"));
  const result = await migrateLegacyDocuments(db);
  expect(result.failures[0].id).toBe("missing");
  expect(db.prepare("SELECT id FROM documents WHERE id='missing'").get()).toBeTruthy();
});

it("synchronizes deletion so migrated legacy documents cannot reappear on restart", async () => {
  db.exec("CREATE TABLE document_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,content TEXT); CREATE VIRTUAL TABLE chunk_search USING fts5(content,content='document_chunks',content_rowid='id')");
  db.prepare("INSERT INTO document_chunks VALUES(1,?,?,?)").run("legacy-document", "legacy-course", "LEGACY-934");
  db.prepare("INSERT INTO chunk_search(rowid,content) VALUES(1,?)").run("LEGACY-934");
  expect(await deleteDocument(db, "legacy-course", "legacy-document")).toBe(true);
  expect(existsSync(path)).toBe(false);
  expect(db.prepare("SELECT id FROM documents WHERE id='legacy-document'").get()).toBeUndefined();
  expect(db.prepare("SELECT rowid FROM chunk_search WHERE chunk_search MATCH 'LEGACY'").all()).toEqual([]);
  expect(searchDocuments(db, "legacy-course", "LEGACY-934")).toEqual([]);
  expect((await migrateLegacyDocuments(db)).migrated).toBe(0);
});

afterAll(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });

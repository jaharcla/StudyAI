import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile, unlink, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import type Database from "better-sqlite3";
import { chunkUnits } from "./chunk.js";
import { extractDocument } from "./extract.js";
import { initializeDocumentIntelligenceSchema } from "./schema.js";
import type { ImportFile, SourceReference } from "./types.js";

export const MAX_BATCH_FILES = 20;
export const MAX_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const OWNED_DOCUMENT_FILE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(pdf|docx|pptx|txt)$/i;
const UPLOAD_SESSION = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export type IndexedDocument = { id: string; courseId: string; lessonId: string | null; title: string; filename: string; mimeType: string; importedAt: string; unitCount: number; chunkCount: number };
export type DocumentSearchResult = { documentId: string; title: string; filename: string; unitType: string; unitNumber: number; chunkIndex: number; sourceRef: string; excerpt: string; score: number };
export type ImportFileResult =
  | { status: "imported"; fileName: string; document: { id: string; title: string; unitCount: number; chunkCount: number } }
  | { status: "duplicate"; fileName: string; document: { id: string; title: string } }
  | { status: "error"; fileName: string; error: string };
export type RetrievalResult =
  | { status: "evidence"; message: "Candidate excerpts found; verify each excerpt before using it as an answer."; courseId: string; results: DocumentSearchResult[] }
  | { status: "no_evidence"; message: "No matching excerpts were found in this course."; courseId: string; results: [] };

export function makeSourceReference(ref: SourceReference): string {
  return `studyai://document/${encodeURIComponent(ref.documentId)}/${ref.unitType}/${ref.unitNumber}?chunk=${ref.chunkIndex}`;
}

export function parseSourceReference(value: string): SourceReference {
  const match = value.match(/^studyai:\/\/document\/([^/]+)\/(page|slide|text)\/(\d+)\?chunk=(\d+)$/);
  if (!match) throw new Error("Invalid document source reference.");
  return { documentId: decodeURIComponent(match[1]), unitType: match[2] as SourceReference["unitType"], unitNumber: Number(match[3]), chunkIndex: Number(match[4]) };
}

export async function importDocuments(db: Database.Database, courseId: string, files: ImportFile[], storageRoot = "data/documents"): Promise<Array<{ id: string; title: string; unitCount: number; chunkCount: number }>> {
  if (!courseId || courseId.length > 120) throw new Error("A valid courseId is required.");
  if (!Array.isArray(files) || !files.length || files.length > MAX_BATCH_FILES) throw new Error(`Choose between 1 and ${MAX_BATCH_FILES} files.`);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > MAX_BATCH_BYTES) throw new Error("Batch exceeds the 50 MB total limit.");
  initializeDocumentIntelligenceSchema(db);
  const course = db.prepare("SELECT id FROM courses WHERE id=?").get(courseId);
  if (!course) throw new Error("Course not found.");
  const prepared = await Promise.all(files.map(async (file) => {
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    const filename = basename(file.name).replace(/[\u0000-\u001f]/g, "").slice(0, 240);
    if (!filename || filename === ".") throw new Error("Every file needs a valid filename.");
    if (file.bytes.byteLength > MAX_FILE_BYTES) throw new Error("File exceeds the 20 MB limit.");
    const contentHash = createHash("sha256").update(file.bytes).digest("hex");
    const duplicate = db.prepare("SELECT id,title FROM di_documents WHERE course_id=? AND content_hash=?").get(courseId, contentHash) as { id: string; title: string } | undefined;
    if (duplicate) throw Object.assign(new Error("Duplicate of " + duplicate.title + "."), { code: "DUPLICATE_DOCUMENT", existing: duplicate });
    const extracted = await extractDocument(filename, file.bytes);
    const chunks = chunkUnits(extracted.units);
    if (!chunks.length) throw new Error(`${filename} contains no indexable text.`);
    return { file, filename, extracted, chunks, contentHash, id: randomUUID() };
  }));
  const root = resolve(storageRoot);
  await mkdir(root, { recursive: true });
  const stored: string[] = [];
  try {
    for (const item of prepared) {
      const path = join(root, `${item.id}${extname(item.filename).toLowerCase()}`);
      await writeFile(path, item.file.bytes, { flag: "wx" });
      stored.push(path);
    }
  } catch (error) {
    await Promise.all(stored.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
  const insert = db.transaction(() => {
    for (const [index, item] of prepared.entries()) {
      const path = stored[index];
      // The uploaded filename is the reliable label: embedded PDF/Office title
      // metadata is often stale template text shared by many course decks.
      const title = item.filename;
      db.prepare("INSERT INTO di_documents(id,course_id,title,filename,mime_type,storage_path,content_hash) VALUES(?,?,?,?,?,?,?)").run(item.id, courseId, title, item.filename, mimeType(item.filename), path, item.contentHash);
      const insertUnit = db.prepare("INSERT INTO di_units(document_id,unit_type,unit_number,title,content) VALUES(?,?,?,?,?)");
      for (const unit of item.extracted.units) insertUnit.run(item.id, unit.type, unit.number, unit.title ?? null, unit.text);
      const insertChunk = db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)");
      for (const chunk of item.chunks) insertChunk.run(item.id, courseId, chunk.unitType, chunk.unitNumber, chunk.chunkIndex, chunk.content);
    }
  });
  try { insert(); } catch (error) {
    await Promise.all(stored.map((path) => unlink(path).catch(() => undefined)));
    const conflict = prepared.length === 1 ? db.prepare("SELECT id,title FROM di_documents WHERE course_id=? AND content_hash=?").get(courseId, prepared[0].contentHash) as { id: string; title: string } | undefined : undefined;
    if (conflict) throw Object.assign(new Error("Duplicate of " + conflict.title + "."), { code: "DUPLICATE_DOCUMENT", existing: conflict });
    throw error;
  }
  return prepared.map((item) => ({ id: item.id, title: item.filename, unitCount: item.extracted.units.length, chunkCount: item.chunks.length }));
}

export function searchDocuments(db: Database.Database, courseId: string, query: string, limit = 8): DocumentSearchResult[] {
  initializeDocumentIntelligenceSchema(db);
  const terms = query.replace(/["*:^(){}[\]]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 20).map((part) => `"${part.replace(/"/g, '""')}"`).join(" OR ");
  if (!terms || !courseId) return [];
  const rows = db.prepare(`SELECT c.document_id AS documentId, d.title, d.filename, c.unit_type AS unitType, c.unit_number AS unitNumber,
    c.chunk_index AS chunkIndex, snippet(di_chunk_search,0,'','','…',28) AS excerpt, bm25(di_chunk_search) AS score
    FROM di_chunk_search JOIN di_chunks c ON c.id=di_chunk_search.rowid JOIN di_documents d ON d.id=c.document_id
    WHERE di_chunk_search MATCH ? AND c.course_id=? ORDER BY score LIMIT ?`).all(terms, courseId, Math.max(1, Math.min(50, limit))) as Array<Omit<DocumentSearchResult, "sourceRef">>;
  return rows.map((row) => ({ ...row, sourceRef: makeSourceReference({ documentId: row.documentId, unitType: row.unitType as SourceReference["unitType"], unitNumber: row.unitNumber, chunkIndex: row.chunkIndex }) }));
}

export function getDocumentLocation(db: Database.Database, sourceRef: string, courseId: string): { documentId: string; title: string; filename: string; unitType: string; unitNumber: number; chunkIndex: number; content: string } | undefined {
  const ref = parseSourceReference(sourceRef);
  return db.prepare(`SELECT d.id AS documentId,d.title,d.filename,u.unit_type AS unitType,u.unit_number AS unitNumber,
    c.chunk_index AS chunkIndex,c.content FROM di_chunks c JOIN di_documents d ON d.id=c.document_id
    JOIN di_units u ON u.document_id=c.document_id AND u.unit_type=c.unit_type AND u.unit_number=c.unit_number
    WHERE c.document_id=? AND c.unit_type=? AND c.unit_number=? AND c.chunk_index=? AND c.course_id=?`).get(ref.documentId, ref.unitType, ref.unitNumber, ref.chunkIndex, courseId) as ReturnType<typeof getDocumentLocation>;
}

export async function importDocumentsIndividually(db: Database.Database, courseId: string, files: ImportFile[], storageRoot = "data/documents"): Promise<ImportFileResult[]> {
  initializeDocumentIntelligenceSchema(db);
  if (!courseId || courseId.length > 120) throw new Error("A valid courseId is required.");
  if (!Array.isArray(files) || !files.length || files.length > MAX_BATCH_FILES) throw new Error("Choose between 1 and " + MAX_BATCH_FILES + " files.");
  if (files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > MAX_BATCH_BYTES) throw new Error("Batch exceeds the 50 MB total limit.");
  if (!db.prepare("SELECT id FROM courses WHERE id=?").get(courseId)) throw new Error("Course not found.");
  const results: ImportFileResult[] = [];
  for (const file of files) {
    try {
      const [document] = await importDocuments(db, courseId, [file], storageRoot);
      results.push({ status: "imported", fileName: file.name, document });
    } catch (error) {
      const value = error as { code?: string; existing?: { id: string; title: string } };
      if (value.code === "DUPLICATE_DOCUMENT" && value.existing) results.push({ status: "duplicate", fileName: file.name, document: value.existing });
      else results.push({ status: "error", fileName: file.name, error: error instanceof Error ? error.message : "Import failed." });
    }
  }
  return results;
}

export function listDocuments(db: Database.Database, courseId: string, query = ""): { documents: IndexedDocument[]; results: ReturnType<typeof searchDocuments> } {
  initializeDocumentIntelligenceSchema(db);
  if (!courseId) return { documents: [], results: [] };
  const sql = "SELECT d.id,d.course_id AS courseId,d.lesson_id AS lessonId,d.title,d.filename,d.mime_type AS mimeType,d.imported_at AS importedAt," +
    "(SELECT count(*) FROM di_units u WHERE u.document_id=d.id) AS unitCount," +
    "(SELECT count(*) FROM di_chunks c WHERE c.document_id=d.id) AS chunkCount " +
    "FROM di_documents d WHERE d.course_id=? AND (?='' OR d.title LIKE ? ESCAPE '\\' OR d.filename LIKE ? ESCAPE '\\') ORDER BY d.imported_at DESC";
  const escaped = escapeLike(query.trim());
  const documents = db.prepare(sql).all(courseId, escaped, "%" + escaped + "%", "%" + escaped + "%") as IndexedDocument[];
  return { documents, results: query.trim() ? searchDocuments(db, courseId, query) : [] };
}

export function getDocument(db: Database.Database, courseId: string, documentId: string): (IndexedDocument & { units: Array<{ type: string; number: number; title?: string; text: string }> }) | undefined {
  initializeDocumentIntelligenceSchema(db);
  const sql = "SELECT d.id,d.course_id AS courseId,d.lesson_id AS lessonId,d.title,d.filename,d.mime_type AS mimeType,d.imported_at AS importedAt," +
    "(SELECT count(*) FROM di_units u WHERE u.document_id=d.id) AS unitCount," +
    "(SELECT count(*) FROM di_chunks c WHERE c.document_id=d.id) AS chunkCount FROM di_documents d WHERE d.id=? AND d.course_id=?";
  const document = db.prepare(sql).get(documentId, courseId) as IndexedDocument | undefined;
  if (!document) return undefined;
  const units = db.prepare("SELECT unit_type AS type,unit_number AS number,title,content AS text FROM di_units WHERE document_id=? ORDER BY unit_number").all(documentId) as Array<{ type: string; number: number; title?: string; text: string }>;
  return { ...document, units };
}

export async function deleteDocument(db: Database.Database, courseId: string, documentId: string): Promise<boolean> {
  initializeDocumentIntelligenceSchema(db);
  const document = db.prepare("SELECT storage_path FROM di_documents WHERE id=? AND course_id=?").get(documentId, courseId) as { storage_path: string } | undefined;
  if (!document) return false;
  db.transaction(() => {
    db.prepare("DELETE FROM di_documents WHERE id=? AND course_id=?").run(documentId, courseId);
    const hasTable = (name: string) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
    if (hasTable("documents") && db.prepare("SELECT id FROM documents WHERE id=? AND course_id=?").get(documentId, courseId)) {
      if (hasTable("document_chunks")) {
        const chunks = db.prepare("SELECT id,content FROM document_chunks WHERE document_id=? AND course_id=?").all(documentId, courseId) as Array<{ id: number; content: string }>;
        if (hasTable("chunk_search")) for (const chunk of chunks) db.prepare("INSERT INTO chunk_search(chunk_search,rowid,content) VALUES('delete',?,?)").run(chunk.id, chunk.content);
        db.prepare("DELETE FROM document_chunks WHERE document_id=? AND course_id=?").run(documentId, courseId);
      }
      db.prepare("DELETE FROM documents WHERE id=? AND course_id=?").run(documentId, courseId);
    }
  })();
  await unlink(document.storage_path).catch(() => undefined);
  return true;
}

// Windows paths compare case-insensitively; the separator keeps `files` from
// matching a sibling such as `files-archive`.
function pathKey(value: string): string {
  const resolved = resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function insideStorage(root: string, candidate: string): boolean {
  const rootKey = pathKey(root);
  return pathKey(candidate).startsWith(rootKey.endsWith(sep) ? rootKey : rootKey + sep);
}

/** Resolve symlinks/junctions so a configured alias and a stored physical path
 *  compare as the same file. A missing file falls back to its nearest existing parent. */
async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    try {
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
}

/** Reconciles interrupted imports and deletes after a restart. Files are matched
 *  by the UUID in their name, not the stored absolute path, so moving the storage
 *  root keeps its documents. Orphans are moved aside; when most rows would be
 *  dropped, reconciliation is skipped entirely so the app still starts and no
 *  files or rows are lost. */
export async function reconcileDocumentFiles(db: Database.Database, storageRoot = "data/documents", now = Date.now()): Promise<{ removedFiles: number; removedRows: number; removedUploads: number }> {
  initializeDocumentIntelligenceSchema(db);
  const root = resolve(storageRoot);
  await mkdir(root, { recursive: true });
  const rootKey = pathKey(await canonicalPath(root));
  const rows = db.prepare("SELECT id,storage_path FROM di_documents").all() as Array<{ id: string; storage_path: string }>;

  const ownedIds = new Set(rows.map((row) => row.id.toLowerCase()));
  const files = new Map<string, string>();
  const orphans: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !OWNED_DOCUMENT_FILE.test(entry.name)) continue;
    const path = await canonicalPath(resolve(root, entry.name));
    if (!insideStorage(rootKey, path)) continue;
    const id = entry.name.slice(0, 36).toLowerCase();
    if (!ownedIds.has(id) || files.has(id)) orphans.push(path);
    else files.set(id, path);
  }

  const dangling = rows.filter((row) => !files.has(row.id.toLowerCase()));
  if (rows.length > 1 && dangling.length > rows.length / 2) {
    console.warn(`Reconciliation skipped: ${dangling.length} of ${rows.length} documents have no file in ${root}. Check STUDYAI_DOCUMENTS; no files or rows were changed.`);
    return { removedFiles: 0, removedRows: 0, removedUploads: 0 };
  }

  let removedFiles = 0;
  if (orphans.length) {
    const trash = join(root, ".trash");
    await mkdir(trash, { recursive: true });
    for (const path of orphans) {
      const name = basename(path);
      const target = join(trash, existsSync(join(trash, name)) ? `${now}-${name}` : name);
      try { await rename(path, target); removedFiles++; } catch { /* retry on next startup */ }
    }
  }

  const moved = rows.flatMap((row) => {
    const path = files.get(row.id.toLowerCase());
    return path && !existsSync(row.storage_path) ? [{ id: row.id, path }] : [];
  });

  let removedRows = 0;
  if (dangling.length || moved.length) db.transaction(() => {
    for (const row of dangling) {
      db.prepare("DELETE FROM di_chunks WHERE document_id=?").run(row.id);
      db.prepare("DELETE FROM di_units WHERE document_id=?").run(row.id);
      db.prepare("DELETE FROM di_documents WHERE id=?").run(row.id);
      removedRows++;
    }
    for (const { id, path } of moved) db.prepare("UPDATE di_documents SET storage_path=? WHERE id=?").run(path, id);
  })();

  let removedUploads = 0;
  const uploadsRoot = join(root, ".uploads");
  if (existsSync(uploadsRoot)) for (const entry of await readdir(uploadsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !UPLOAD_SESSION.test(entry.name)) continue;
    const dir = resolve(uploadsRoot, entry.name);
    if (!insideStorage(root, dir)) continue;
    const parts = (await readdir(dir)).filter((name) => /^\d+\.part$/.test(name));
    if (!parts.length) continue;
    const times = await Promise.all(parts.map(async (name) => {
      try { return (await stat(join(dir, name))).mtimeMs; } catch { return now; }
    }));
    if (Math.max(...times) >= now - STALE_UPLOAD_MS) continue;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    removedUploads++;
  }

  return { removedFiles, removedRows, removedUploads };
}

export async function getDocumentFile(db: Database.Database, courseId: string, documentId: string): Promise<{ filename: string; mimeType: string; bytes: Buffer } | undefined> {
  initializeDocumentIntelligenceSchema(db);
  const document = db.prepare("SELECT filename,mime_type AS mimeType,storage_path FROM di_documents WHERE id=? AND course_id=?").get(documentId, courseId) as { filename: string; mimeType: string; storage_path: string } | undefined;
  if (!document) return undefined;
  return { filename: document.filename, mimeType: document.mimeType, bytes: await readFile(document.storage_path) };
}

export function retrieveCourseDocuments(db: Database.Database, courseId: string, query: string, limit = 8): RetrievalResult {
  if (!courseId?.trim() || !query?.trim()) return { status: "no_evidence", message: "No matching excerpts were found in this course.", courseId: courseId ?? "", results: [] };
  const results = searchDocuments(db, courseId, query, limit);
  return results.length
    ? { status: "evidence", message: "Candidate excerpts found; verify each excerpt before using it as an answer.", courseId, results }
    : { status: "no_evidence", message: "No matching excerpts were found in this course.", courseId, results: [] };
}

export function mimeType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".txt": return "text/plain";
    default: throw new Error("Unsupported file format.");
  }
}

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, "\\$&"); }

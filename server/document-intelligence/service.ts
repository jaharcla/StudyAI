import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type Database from "better-sqlite3";
import { chunkUnits } from "./chunk.js";
import { extractDocument } from "./extract.js";
import { initializeDocumentIntelligenceSchema } from "./schema.js";
import type { ImportFile, SourceReference } from "./types.js";

export const MAX_BATCH_FILES = 20;
export const MAX_BATCH_BYTES = 50 * 1024 * 1024;

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
    const filename = basename(file.name).replace(/[\u0000-\u001f]/g, "").slice(0, 240);
    if (!filename || filename === ".") throw new Error("Every file needs a valid filename.");
    const extracted = await extractDocument(filename, file.bytes);
    const chunks = chunkUnits(extracted.units);
    if (!chunks.length) throw new Error(`${filename} contains no indexable text.`);
    return { file, filename, extracted, chunks, id: randomUUID() };
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
      const title = item.extracted.title?.trim().slice(0, 240) || item.filename;
      db.prepare("INSERT INTO di_documents(id,course_id,title,filename,mime_type,storage_path) VALUES(?,?,?,?,?,?)").run(item.id, courseId, title, item.filename, mimeType(item.filename), path);
      const insertUnit = db.prepare("INSERT INTO di_units(document_id,unit_type,unit_number,title,content) VALUES(?,?,?,?,?)");
      for (const unit of item.extracted.units) insertUnit.run(item.id, unit.type, unit.number, unit.title ?? null, unit.text);
      const insertChunk = db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)");
      for (const chunk of item.chunks) insertChunk.run(item.id, courseId, chunk.unitType, chunk.unitNumber, chunk.chunkIndex, chunk.content);
    }
  });
  try { insert(); } catch (error) { await Promise.all(stored.map((path) => unlink(path).catch(() => undefined))); throw error; }
  return prepared.map((item) => ({ id: item.id, title: item.extracted.title?.trim().slice(0, 240) || item.filename, unitCount: item.extracted.units.length, chunkCount: item.chunks.length }));
}

export function searchDocuments(db: Database.Database, courseId: string, query: string, limit = 8): Array<{ documentId: string; title: string; unitType: string; unitNumber: number; chunkIndex: number; sourceRef: string; excerpt: string; score: number }> {
  initializeDocumentIntelligenceSchema(db);
  const terms = query.replace(/["*:^(){}\[\]]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 20).map((part) => `"${part.replace(/"/g, '""')}"`).join(" OR ");
  if (!terms || !courseId) return [];
  const rows = db.prepare(`SELECT c.document_id AS documentId, d.title, c.unit_type AS unitType, c.unit_number AS unitNumber,
    c.chunk_index AS chunkIndex, snippet(di_chunk_search,0,'','','…',28) AS excerpt, bm25(di_chunk_search) AS score
    FROM di_chunk_search JOIN di_chunks c ON c.id=di_chunk_search.rowid JOIN di_documents d ON d.id=c.document_id
    WHERE di_chunk_search MATCH ? AND c.course_id=? ORDER BY score LIMIT ?`).all(terms, courseId, Math.max(1, Math.min(50, limit))) as Array<{ documentId: string; title: string; unitType: string; unitNumber: number; chunkIndex: number; excerpt: string; score: number }>;
  return rows.map((row) => ({ ...row, sourceRef: makeSourceReference({ documentId: row.documentId, unitType: row.unitType as SourceReference["unitType"], unitNumber: row.unitNumber, chunkIndex: row.chunkIndex }) }));
}

export function getDocumentLocation(db: Database.Database, sourceRef: string, courseId: string): { documentId: string; title: string; filename: string; unitType: string; unitNumber: number; chunkIndex: number; content: string } | undefined {
  const ref = parseSourceReference(sourceRef);
  return db.prepare(`SELECT d.id AS documentId,d.title,d.filename,u.unit_type AS unitType,u.unit_number AS unitNumber,
    c.chunk_index AS chunkIndex,c.content FROM di_chunks c JOIN di_documents d ON d.id=c.document_id
    JOIN di_units u ON u.document_id=c.document_id AND u.unit_type=c.unit_type AND u.unit_number=c.unit_number
    WHERE c.document_id=? AND c.unit_type=? AND c.unit_number=? AND c.chunk_index=? AND c.course_id=?`).get(ref.documentId, ref.unitType, ref.unitNumber, ref.chunkIndex, courseId) as ReturnType<typeof getDocumentLocation>;
}

function mimeType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".txt": return "text/plain";
    default: throw new Error("Unsupported file format.");
  }
}

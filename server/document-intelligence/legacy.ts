import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type Database from "better-sqlite3";
import { extractDocument } from "./extract.js";
import { chunkUnits } from "./chunk.js";
import { initializeDocumentIntelligenceSchema } from "./schema.js";
import { mimeType } from "./service.js";

export async function migrateLegacyDocuments(db: Database.Database) {
  initializeDocumentIntelligenceSchema(db);
  const result = { migrated: 0, failures: [] as Array<{ id: string; error: string }> };
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get()) return result;
  const rows = db.prepare("SELECT d.* FROM documents d WHERE NOT EXISTS (SELECT 1 FROM di_documents i WHERE i.id=d.id)").all() as Array<{ id: string; course_id: string; title: string; path: string; imported_at: string }>;
  for (const row of rows) {
    try {
      if (!db.prepare("SELECT id FROM courses WHERE id=?").get(row.course_id)) throw new Error("Legacy document course no longer exists");
      const filename = extname(row.title) ? row.title : row.title + extname(row.path);
      const bytes = await readFile(row.path);
      const extracted = await extractDocument(filename, bytes);
      const chunks = chunkUnits(extracted.units);
      if (!chunks.length) throw new Error("Legacy document contains no indexable text");
      const hash = createHash("sha256").update(bytes).digest("hex");
      const contentHash = db.prepare("SELECT id FROM di_documents WHERE course_id=? AND content_hash=?").get(row.course_id, hash) ? "" : hash;
      db.transaction(() => {
        db.prepare("INSERT INTO di_documents(id,course_id,title,filename,mime_type,storage_path,content_hash,imported_at) VALUES(?,?,?,?,?,?,?,?)").run(row.id, row.course_id, row.title, filename, mimeType(filename), row.path, contentHash, row.imported_at);
        const unit = db.prepare("INSERT INTO di_units(document_id,unit_type,unit_number,title,content) VALUES(?,?,?,?,?)");
        for (const item of extracted.units) unit.run(row.id, item.type, item.number, item.title ?? null, item.text);
        const chunk = db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)");
        for (const item of chunks) chunk.run(row.id, row.course_id, item.unitType, item.unitNumber, item.chunkIndex, item.content);
      })();
      result.migrated++;
    } catch (error) { result.failures.push({ id: row.id, error: error instanceof Error ? error.message : "Legacy import failed" }); }
  }
  return result;
}

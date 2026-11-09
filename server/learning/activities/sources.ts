import type Database from "better-sqlite3";
import { parseSourceReference } from "../../document-intelligence/service.js";
import type { ActivitySourceReference } from "../../../src/learning/activities/contracts.js";

export type ResolvedActivitySource = { sourceRef: string; title: string; excerpt: string };

export function resolveActivitySources(database: Database.Database, courseId: string, references: ActivitySourceReference[]): ResolvedActivitySource[] {
  return references.map((reference) => {
    const parsed = parseSourceReference(reference.sourceRef);
    const row = database.prepare(`SELECT d.title,c.content FROM di_documents d JOIN di_chunks c ON c.document_id=d.id AND c.course_id=d.course_id
      WHERE d.id=? AND d.course_id=? AND c.unit_type=? AND c.unit_number=? AND c.chunk_index=?`).get(
      parsed.documentId, courseId, parsed.unitType, parsed.unitNumber, parsed.chunkIndex,
    ) as { title: string; content: string } | undefined;
    if (!row || !row.content.includes(reference.excerpt)) throw new Error("Source reference or excerpt is not available in this course.");
    return { sourceRef: reference.sourceRef, title: row.title, excerpt: reference.excerpt };
  });
}

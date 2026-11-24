import type Database from "better-sqlite3";

/** An exact excerpt of an indexed course chunk, with the visible source it came from. */
export type IndexedSource = { documentId: string; title: string; page: number | null; excerpt: string };

const EXCERPT_LENGTH = 600;
const PER_DOCUMENT = 3;
const TOTAL = 60;
const CANDIDATES = 300;

type Row = IndexedSource & { rid: number };

/** Prefer readable prose over data tables so the first suggested excerpt is a usable seed. */
function score(row: Row): number {
  const letters = (row.excerpt.match(/[A-Za-z]/g) ?? []).length;
  const digits = (row.excerpt.match(/\d/g) ?? []).length;
  return (row.excerpt.includes(".") ? 200 : 0) + letters - digits * 2;
}

/**
 * Course-scoped source list from both document stores. Real imported PDFs live in
 * di_documents/di_chunks; the legacy .txt importer writes documents/document_chunks.
 * Excerpts are literal slices so authoring validation can prove the citation.
 */
export function indexedSources(database: Database.Database, courseId: string): IndexedSource[] {
  const exists = (name: string) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const parts: string[] = [];
  const params: string[] = [];
  if (exists("documents") && exists("document_chunks")) {
    parts.push(`SELECT d.id AS documentId, d.title AS title, c.page AS page, c.content AS content, c.rowid AS rid
      FROM documents d JOIN document_chunks c ON c.document_id=d.id AND c.course_id=d.course_id WHERE d.course_id=?`);
    params.push(courseId);
  }
  if (exists("di_documents") && exists("di_chunks")) {
    parts.push(`SELECT d.id AS documentId, d.title AS title, CASE WHEN c.unit_type='page' THEN c.unit_number ELSE NULL END AS page, c.content AS content, c.rowid AS rid
      FROM di_documents d JOIN di_chunks c ON c.document_id=d.id AND c.course_id=d.course_id WHERE d.course_id=?`);
    params.push(courseId);
  }
  if (!parts.length) return [];
  const sql = `WITH all_chunks AS (${parts.join(" UNION ALL ")}), ranked AS (
      SELECT documentId,title,page,content,rid,ROW_NUMBER() OVER (PARTITION BY documentId ORDER BY rid) AS rn
      FROM all_chunks WHERE length(content)>=20
    )
    SELECT documentId,title,page,substr(content,1,${EXCERPT_LENGTH}) AS excerpt,rid FROM ranked
    WHERE rn<=${PER_DOCUMENT} ORDER BY title,page,rid LIMIT ${CANDIDATES}`;
  const rows = database.prepare(sql).all(...params) as Row[];
  return rows
    .sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title) || (a.page ?? 0) - (b.page ?? 0) || a.rid - b.rid)
    .slice(0, TOTAL)
    .map(({ documentId, title, page, excerpt }) => ({ documentId, title, page, excerpt }));
}

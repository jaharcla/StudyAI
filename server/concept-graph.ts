import type Database from "better-sqlite3";
import { parseCanvasDocument } from "../src/canvas/model.js";
import { getDocumentLocation, makeSourceReference } from "./document-intelligence/service.js";

export type ConceptGraphNode = {
  id: string;
  label: string;
  parentId: string | null;
  detail?: string;
  sourceRef?: string;
  sourceLabel?: string;
  lessonId: string;
  lessonTitle: string;
  mastery: number;
  canPractice: boolean;
};
export type ConceptGraphEdge = { source: string; target: string; label: string };
export type ConceptGraph = { title: string; nodes: ConceptGraphNode[]; edges: ConceptGraphEdge[] };

type ConceptRow = {
  id: string;
  name: string;
  lesson_id: string;
  lesson_title: string;
  mastery: number;
  can_practice: number;
  source_title: string | null;
  source_document_id: string | null;
  source_page: number | null;
};

type PreparedStatements = {
  concepts: Database.Statement;
  canvases: Database.Statement;
};

// better-sqlite3 statements belong to the database that compiled them, so cache per instance.
const prepared = new WeakMap<Database.Database, PreparedStatements>();

function statementsFor(database: Database.Database): PreparedStatements {
  let cached = prepared.get(database);
  if (!cached) {
    cached = {
      concepts: database.prepare(`
        SELECT k.id, k.name, k.lesson_id, l.title AS lesson_title,
          COALESCE((SELECT e.value FROM learning_mastery_evidence e WHERE e.concept_id = k.id
            ORDER BY e.occurred_at DESC, e.sequence DESC LIMIT 1), 0.1) AS mastery,
          EXISTS(SELECT 1 FROM reviewed_questions q WHERE q.concept_id = k.id) AS can_practice,
          (SELECT q.source_title FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_title,
          (SELECT q.source_document_id FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_document_id,
          (SELECT q.source_page FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_page
        FROM learning_concepts k
        JOIN lessons l ON l.course_id = k.course_id AND l.id = k.lesson_id
        WHERE k.course_id = ?
        ORDER BY l.title, k.name
      `),
      canvases: database.prepare("SELECT lesson_id, document FROM canvases WHERE course_id = ?"),
    };
    prepared.set(database, cached);
  }
  return cached;
}

const PARSED_BOARD_LIMIT = 64;
const parsedBoards = new Map<string, ReturnType<typeof parseCanvasDocument>>();

// A saved board document does not change in place. Key by the raw document so an
// edit produces a new entry instead of a stale graph.
function parseBoard(document: string): ReturnType<typeof parseCanvasDocument> | undefined {
  const cached = parsedBoards.get(document);
  if (cached) return cached;
  let parsed: ReturnType<typeof parseCanvasDocument>;
  try { parsed = parseCanvasDocument(JSON.parse(document)); } catch { return undefined; }
  if (parsedBoards.size >= PARSED_BOARD_LIMIT) {
    const oldest = parsedBoards.keys().next().value;
    if (oldest !== undefined) parsedBoards.delete(oldest);
  }
  parsedBoards.set(document, parsed);
  return parsed;
}

function resolvedSourceRef(database: Database.Database, courseId: string, documentId: string | null, page: number | null): string | undefined {
  if (!documentId) return undefined;
  const ref = makeSourceReference({ documentId, unitType: page === null ? "text" : "page", unitNumber: page ?? 0, chunkIndex: 0 });
  return getDocumentLocation(database, ref, courseId) ? ref : undefined;
}

/**
 * Read-only course graph. Nodes are real learning concepts; edges are real
 * `relationship` objects on this course's saved canvases. Nothing is generated.
 */
export function buildConceptGraph(database: Database.Database, courseId: string, courseTitle = "Course"): ConceptGraph {
  const statements = statementsFor(database);
  const rows = statements.concepts.all(courseId) as ConceptRow[];

  const nodes: ConceptGraphNode[] = rows.map((row) => {
    const sourceRef = resolvedSourceRef(database, courseId, row.source_document_id, row.source_page);
    return {
      id: row.id,
      label: row.name,
      parentId: null,
      detail: sourceRef ? undefined : row.source_title ?? undefined,
      sourceRef,
      sourceLabel: row.source_title ?? undefined,
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      mastery: Number(row.mastery),
      canPractice: Boolean(row.can_practice),
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names = new Map<string, string[]>();
  for (const node of nodes) {
    const key = `${node.lessonId}:${node.label}`;
    names.set(key, [...(names.get(key) ?? []), node.id]);
  }

  const edges: ConceptGraphEdge[] = [];
  const seen = new Set<string>();
  const canvases = statements.canvases.all(courseId) as Array<{ lesson_id: string; document: string }>;
  for (const canvas of canvases) {
    const document = parseBoard(canvas.document);
    if (!document) continue;
    const conceptIds = new Map<string, string>();
    for (const object of document.objects) {
      if (object.kind !== "concept") continue;
      const named = names.get(`${canvas.lesson_id}:${object.title}`) ?? [];
      const conceptId = object.conceptId && byId.has(object.conceptId) ? object.conceptId : named.length === 1 ? named[0] : undefined;
      if (conceptId) conceptIds.set(object.id, conceptId);
    }
    for (const object of document.objects) {
      if (object.kind !== "relationship") continue;
      const source = conceptIds.get(object.fromId);
      const target = conceptIds.get(object.toId);
      if (!source || !target || source === target) continue;
      const edge = { source, target, label: object.label };
      const key = `${source}:${target}:${edge.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
      const node = byId.get(target);
      if (node && !node.parentId) node.parentId = source;
    }
  }

  return { title: `${courseTitle} · concept graph`, nodes, edges };
}

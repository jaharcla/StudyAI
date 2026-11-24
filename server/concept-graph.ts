import type Database from "better-sqlite3";
import { parseCanvasDocument } from "../src/canvas/model.js";

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
  source_ref: string | null;
};

/**
 * Read-only course graph. Nodes are real learning concepts; edges are real
 * `relationship` objects on this course's saved canvases. Nothing is generated.
 */
export function buildConceptGraph(database: Database.Database, courseId: string, courseTitle = "Course"): ConceptGraph {
  const rows = database.prepare(`
    SELECT k.id, k.name, k.lesson_id, l.title AS lesson_title,
      COALESCE((SELECT e.value FROM learning_mastery_evidence e WHERE e.concept_id = k.id
        ORDER BY e.occurred_at DESC, e.sequence DESC LIMIT 1), 0.1) AS mastery,
      EXISTS(SELECT 1 FROM reviewed_questions q WHERE q.concept_id = k.id) AS can_practice,
      (SELECT q.source_title FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_title,
      (SELECT CASE WHEN EXISTS(SELECT 1 FROM di_documents dd WHERE dd.id = q.source_document_id)
        THEN 'studyai://document/' || q.source_document_id || '/' ||
          CASE WHEN q.source_page IS NULL THEN 'text/0' ELSE 'page/' || q.source_page END || '?chunk=0'
      END FROM reviewed_questions q WHERE q.concept_id = k.id ORDER BY q.rowid DESC LIMIT 1) AS source_ref
    FROM learning_concepts k
    JOIN lessons l ON l.course_id = k.course_id AND l.id = k.lesson_id
    WHERE k.course_id = ?
    ORDER BY l.title, k.name
  `).all(courseId) as ConceptRow[];

  const nodes: ConceptGraphNode[] = rows.map((row) => ({
    id: row.id,
    label: row.name,
    parentId: null,
    detail: row.source_ref ? undefined : row.source_title ?? undefined,
    sourceRef: row.source_ref ?? undefined,
    sourceLabel: row.source_title ?? undefined,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    mastery: Number(row.mastery),
    canPractice: Boolean(row.can_practice),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names = new Map<string, string[]>();
  for (const node of nodes) {
    const key = `${node.lessonId}:${node.label}`;
    names.set(key, [...(names.get(key) ?? []), node.id]);
  }

  const edges: ConceptGraphEdge[] = [];
  const seen = new Set<string>();
  const canvases = database.prepare("SELECT lesson_id, document FROM canvases WHERE course_id = ?").all(courseId) as Array<{ lesson_id: string; document: string }>;
  for (const canvas of canvases) {
    let document: ReturnType<typeof parseCanvasDocument>;
    try { document = parseCanvasDocument(JSON.parse(canvas.document)); } catch { continue; }
    const conceptIds = new Map<string, string>();
    for (const object of document.objects) {
      if (object.kind !== "concept") continue;
      const named = names.get(`${canvas.lesson_id}:${object.title}`) ?? [];
      const conceptId = object.conceptId && byId.has(object.conceptId) ? object.conceptId : named[0];
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

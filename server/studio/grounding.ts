import type Database from "better-sqlite3";
import { getDocumentLocation, listDocuments, searchDocuments } from "../document-intelligence/service.js";
import { queryCourseCanvasScene } from "../canvas-intelligence/scene/service.js";
import type { CanvasKnowledge, Grounding, StudioSource } from "./contracts.js";

export const STUDIO_GROUNDING_CAPS = {
  excerpts: 12,
  excerptChars: 600,
  concepts: 20,
  canvasNodes: 12,
  packetChars: 10_000,
} as const;

/**
 * Builds a bounded, provenance-preserving grounding packet from three authorities that already
 * exist in StudyAI: FTS5 document search, the learning concept table, and the revision-bound
 * canvas scene graph. No new retrieval engine is introduced (see the Studio ADR).
 */
export function buildGrounding(db: Database.Database, courseId: string, lessonId: string, focus: string): Grounding {
  const queries = [focus];
  for (const document of listDocuments(db, courseId).documents.slice(0, 4)) {
    if (document.title && document.title !== focus) queries.push(document.title);
  }

  const hits = new Map<string, { sourceRef: string; title: string; excerpt: string }>();
  for (const query of queries.slice(0, 5)) {
    for (const hit of searchDocuments(db, courseId, query, 6)) {
      if (!hits.has(hit.sourceRef)) hits.set(hit.sourceRef, { sourceRef: hit.sourceRef, title: hit.title, excerpt: hit.excerpt });
    }
  }

  const sources: StudioSource[] = [];
  for (const hit of [...hits.values()].slice(0, STUDIO_GROUNDING_CAPS.excerpts)) {
    const location = getDocumentLocation(db, hit.sourceRef, courseId);
    // Use an exact prefix of the stored chunk, not the FTS snippet: the reviewed-question
    // validator requires sourceExcerpt to be a literal substring of the indexed chunk.
    const content = location?.content ?? hit.excerpt;
    const excerpt = content.slice(0, STUDIO_GROUNDING_CAPS.excerptChars);
    if (!excerpt.trim()) continue;
    sources.push({
      ref: hit.sourceRef,
      documentId: location?.documentId ?? excerptDocumentId(hit.sourceRef),
      title: location?.title ?? hit.title,
      location: location ? `${location.unitType} ${location.unitNumber}` : "document",
      excerpt,
      sourcePage: location?.unitType === "page" ? location.unitNumber : null,
    });
  }

  const conceptRows = db.prepare("SELECT DISTINCT name FROM learning_concepts WHERE course_id=? AND (lesson_id=? OR lesson_id IS NULL) ORDER BY name LIMIT ?").all(courseId, lessonId, STUDIO_GROUNDING_CAPS.concepts) as Array<{ name: string }>;
  const concepts = conceptRows.map((row) => row.name).filter(Boolean);

  const canvas: CanvasKnowledge[] = [];
  try {
    const scene = queryCourseCanvasScene(db, courseId, { courseId, lessonId, query: focus, limit: STUDIO_GROUNDING_CAPS.canvasNodes });
    for (const hit of scene.hits.slice(0, STUDIO_GROUNDING_CAPS.canvasNodes)) {
      const label = hit.node.text?.trim() || hit.node.recordType?.trim() || hit.node.kind;
      canvas.push({
        ref: `canvas:${hit.node.ref.scope}:${hit.node.id}`,
        label,
        kind: hit.node.kind,
        relations: hit.edges.slice(0, 6).map((edge) => `${edge.kind} ${edge.to}`),
      });
    }
  } catch {
    // A missing scene graph is normal for a board that has never been analysed. Documents and
    // concepts are still valid grounding, so a canvas miss must not block generation.
  }

  const packet = JSON.stringify({
    focus,
    courseSources: sources.map((source) => ({ ref: source.ref, title: source.title, location: source.location, excerpt: source.excerpt })),
    concepts,
    canvasKnowledge: canvas,
  }, null, 2).slice(0, STUDIO_GROUNDING_CAPS.packetChars);

  return { focus, sources, concepts, canvas, packet };
}

function excerptDocumentId(ref: string): string {
  const match = ref.match(/^studyai:\/\/document\/([^/]+)\//);
  return match ? decodeURIComponent(match[1]) : "";
}

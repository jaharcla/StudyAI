/**
 * Next-Lesson Pre-flight: pick weak concepts and ground them in student material.
 * There is no reliable next-lesson field, so this anchors on the active lesson.
 */
import type { ConceptGraphNode } from "../../server/concept-graph.js";
import { DOCUMENT_API, parseSourceReference, type SearchHit } from "../components/document-intelligence/api.js";

/** Weakest cited concepts first; stable on id so the same graph yields the same card. */
export function selectPreflightConcepts(nodes: readonly ConceptGraphNode[], limit = 3): ConceptGraphNode[] {
  return nodes
    .filter((node) => typeof node.sourceRef === "string" && node.sourceRef.length > 0)
    .slice()
    .sort((a, b) => a.mastery - b.mastery || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Only fields the study API actually returns; nothing is invented here. */
export type ReviewedQuestion = {
  presentationId: string;
  questionId: string;
  concept: string;
  prompt: string;
  choices: Array<{ id: string; text: string }>;
  source?: { title?: string; excerpt?: string; page?: number | null };
};

export type PreflightConcept = { label: string; excerpt: string; sourceRef: string };
export type PreflightResult =
  | { status: "ready"; concepts: PreflightConcept[]; question: ReviewedQuestion | null }
  | { status: "empty"; reason: "no-concepts" | "no-passages" }
  | { status: "error"; message: string };

async function getJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url);
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status}).`);
  return value;
}

/**
 * Ground the weakest concepts in verbatim passages from indexed course material.
 * Any failed call is an error the UI can retry; a missing question is simply null.
 */
export async function loadPreflight(courseId: string, lessonId: string, fetcher: typeof fetch = fetch): Promise<PreflightResult> {
  try {
    const courseScope = `course=${encodeURIComponent(courseId)}`;
    const graph = await getJson<{ nodes?: ConceptGraphNode[] }>(fetcher, `/api/concepts/graph?${courseScope}`);
    const selected = selectPreflightConcepts(graph.nodes ?? []);
    if (selected.length === 0) return { status: "empty", reason: "no-concepts" };

    const concepts: PreflightConcept[] = [];
    for (const concept of selected) {
      const found = await getJson<{ results?: SearchHit[] }>(fetcher, `${DOCUMENT_API}/documents?${courseScope}&q=${encodeURIComponent(concept.label)}`);
      const hit = (found.results ?? []).find((item) => parseSourceReference(item.sourceRef));
      if (hit) concepts.push({ label: concept.label, excerpt: hit.excerpt, sourceRef: hit.sourceRef });
    }
    if (concepts.length === 0) return { status: "empty", reason: "no-passages" };

    const asked = await getJson<ReviewedQuestion & { status?: string }>(fetcher,
      `/api/study/ask?${courseScope}&lesson=${encodeURIComponent(lessonId)}&concept=${encodeURIComponent(selected[0].id)}`);
    return { status: "ready", concepts, question: asked.status === "no-reviewed-questions" ? null : asked };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Pre-flight could not be loaded." };
  }
}

/**
 * Next-Lesson Pre-flight: pick weak concepts and ground them in student material.
 * There is no reliable next-lesson field, so this anchors on the active lesson.
 */
import type { ConceptGraphNode } from "../../server/concept-graph.js";

/** Weakest cited concepts first; stable on id so the same graph yields the same card. */
export function selectPreflightConcepts(nodes: readonly ConceptGraphNode[], limit = 3): ConceptGraphNode[] {
  return nodes
    .filter((node) => typeof node.sourceRef === "string" && node.sourceRef.length > 0)
    .slice()
    .sort((a, b) => a.mastery - b.mastery || a.id.localeCompare(b.id))
    .slice(0, limit);
}

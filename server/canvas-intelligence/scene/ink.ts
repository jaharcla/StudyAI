import type { CanvasInkItem } from "../../../src/canvas/ai/scene-tools.js";
import { shortHash } from "../../../src/canvas/spatial/identity.js";
import {
  CANVAS_SCENE_MAX_EDGES,
  CANVAS_SCENE_MAX_NODES,
  CanvasSceneGraphSchema,
  type CanvasSceneEdge,
  type CanvasSceneGraph,
} from "../../../src/canvas/spatial/types.js";

export type InkEvidence = CanvasInkItem & {
  bounds?: CanvasSceneGraph["nodes"][number]["bounds"];
  sourceRefs?: CanvasSceneGraph["nodes"][number]["sourceRefs"];
};

function addEdge(edges: CanvasSceneEdge[], edge: Omit<CanvasSceneEdge, "id">) {
  const id = `${edge.kind}:${edge.from}:${edge.to}`;
  if (edges.some((item) => item.id === id)) return;
  edges.push({ ...edge, id });
}

export function normalizeInkText(value: string): string {
  return value.replace(/^```(?:latex|tex)?\s*/i, "").replace(/\s*```$/, "").trim().slice(0, 2000);
}

export function mergeInkEvidence(graph: CanvasSceneGraph, evidence: readonly InkEvidence[]): CanvasSceneGraph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = [...graph.edges];

  for (const item of evidence) {
    const group = nodes.get(item.groupId);
    if (!group || group.kind !== "stroke-group") continue;
    const id = `${item.source === "ocr" ? "o" : "c"}:${item.groupId}:${shortHash(`${item.source}:${item.text}`)}`;
    if (nodes.has(id)) continue;
    const conflict = edges.some((edge) => {
      if (edge.kind !== "recognizes" || edge.to !== group.id) return false;
      return nodes.get(edge.from)?.verificationStatus === "confirmed";
    });
    const origin = item.source === "ocr" ? "ocr" : item.source === "user" ? "user" : "model";
    const verificationStatus = item.confirmed ? "confirmed" : "unconfirmed";
    nodes.set(id, {
      id,
      kind: item.source === "ocr" ? "ocr-item" : "recognition-candidate",
      ref: { scope: "scene", id },
      bounds: item.bounds ?? group.bounds,
      boundsBasis: item.bounds ? "region" : "derived",
      text: normalizeInkText(item.text) || null,
      recordType: item.format,
      origin,
      verificationStatus,
      confidence: item.confidence,
      sourceRefs: (item.sourceRefs ?? group.sourceRefs).slice(0, 64),
      geometry: null,
      uncertaintyReasons: item.confirmed
        ? []
        : [
            "Ink transcription; not user-confirmed.",
            ...(conflict ? ["Conflicts with confirmed label."] : []),
          ],
    });
    addEdge(edges, {
      kind: "recognizes",
      from: id,
      to: group.id,
      origin,
      verificationStatus,
      basis: item.source === "ocr" ? "ocr-region" : "recognition",
      distance: null,
      confidence: item.confidence,
      sourceRefs: group.sourceRefs.slice(0, 64),
      uncertaintyReasons: [],
    });
  }

  const sortedNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)).slice(0, CANVAS_SCENE_MAX_NODES);
  const kept = new Set(sortedNodes.map((node) => node.id));
  const sortedEdges = edges
    .filter((edge) => kept.has(edge.from) && kept.has(edge.to))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, CANVAS_SCENE_MAX_EDGES);
  const truncated = sortedNodes.length < nodes.size || sortedEdges.length < edges.length;

  return CanvasSceneGraphSchema.parse({
    ...graph,
    nodes: sortedNodes,
    edges: sortedEdges,
    warnings: truncated ? [...graph.warnings, "Ink evidence merge reached the scene node or edge limit."].slice(0, 64) : graph.warnings,
    truncated: graph.truncated || truncated,
  });
}

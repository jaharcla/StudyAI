import type { CanvasSceneGraph } from "../spatial/types.js";

export type CanvasSceneAIContext = {
  scope: CanvasSceneGraph["scope"];
  revision: number;
  revisionHash: string;
  builderVersion: string;
  nodeCounts: Record<string, number>;
  nodes: Array<{ id: string; kind: string; text: string | null; bounds: CanvasSceneGraph["nodes"][number]["bounds"]; sourceRefs: string[]; verificationStatus: string }>;
  edges: Array<{ id: string; kind: string; from: string; to: string; distance: number | null }>;
  warnings: string[];
  truncated: boolean;
};

export function buildCanvasSceneAIContext(graph: CanvasSceneGraph, options: { maxChars?: number; maxNodes?: number; maxEdges?: number } = {}): CanvasSceneAIContext {
  const maxChars = Math.max(500, Math.min(6000, Math.floor(options.maxChars ?? 6000)));
  const maxNodes = Math.max(1, Math.min(24, Math.floor(options.maxNodes ?? 24)));
  const maxEdges = Math.max(1, Math.min(48, Math.floor(options.maxEdges ?? 48)));
  const nodeCounts: Record<string, number> = {};
  for (const node of graph.nodes) nodeCounts[node.kind] = (nodeCounts[node.kind] ?? 0) + 1;
  const context: CanvasSceneAIContext = {
    scope: graph.scope,
    revision: graph.revision,
    revisionHash: graph.revisionHash,
    builderVersion: graph.builderVersion,
    nodeCounts,
    nodes: graph.nodes.slice(0, maxNodes).map((node) => ({
      id: node.id,
      kind: node.kind,
      text: node.text ? node.text.slice(0, 500) : null,
      bounds: node.bounds,
      sourceRefs: node.sourceRefs.map((ref) => `${ref.scope}:${ref.id}`),
      verificationStatus: node.verificationStatus,
    })),
    edges: graph.edges.slice(0, maxEdges).map((edge) => ({ id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, distance: edge.distance })),
    warnings: graph.warnings.slice(0, 16),
    truncated: graph.truncated || graph.nodes.length > maxNodes || graph.edges.length > maxEdges,
  };
  while (JSON.stringify(context).length > maxChars && (context.edges.length || context.nodes.length)) {
    context.truncated = true;
    if (context.edges.length) context.edges.pop();
    else context.nodes.pop();
  }
  return context;
}

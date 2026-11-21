import type { CanvasSceneGraph } from "../spatial/types.js";

type SceneNode = CanvasSceneGraph["nodes"][number];
type SceneBounds = SceneNode["bounds"];

const AMBIENT_MAX_CLUSTERS = 6;
const AMBIENT_MAX_LABELS = 3;
const AMBIENT_LABEL_CHARS = 80;
const AMBIENT_PROXIMITY = 250;

export type CanvasSceneAmbientCluster = {
  id: string;
  nodeCount: number;
  kinds: Record<string, number>;
  summary: string;
  sampleLabels: string[];
  unconfirmedCount: number;
};

export type CanvasSceneAIContext = {
  scope: CanvasSceneGraph["scope"];
  revision: number;
  revisionHash: string;
  builderVersion: string;
  nodeCounts: Record<string, number>;
  ambientClusters: CanvasSceneAmbientCluster[];
  nodes: Array<{
    id: string;
    kind: string;
    text: string | null;
    recordType: string | null;
    bounds: CanvasSceneGraph["nodes"][number]["bounds"];
    origin: string;
    verificationStatus: string;
    confidence: number | null;
    sourceRefs: string[];
    uncertaintyReasons: string[];
    groupOf: string | null;
  }>;
  edges: Array<{
    id: string;
    kind: string;
    from: string;
    to: string;
    distance: number | null;
    basis: string;
    verificationStatus: string;
  }>;
  warnings: string[];
  truncated: boolean;
};

function nodeRank(node: CanvasSceneGraph["nodes"][number]): number {
  if (node.verificationStatus === "source" || node.verificationStatus === "confirmed") return 0;
  if (node.kind === "recognition-candidate") return 1;
  if (node.kind === "ocr-item") return 2;
  if (node.kind === "model-observation") return 3;
  return 0;
}

function near(a: SceneBounds, b: SceneBounds): boolean {
  return !(
    a.x + a.width + AMBIENT_PROXIMITY < b.x ||
    b.x + b.width + AMBIENT_PROXIMITY < a.x ||
    a.y + a.height + AMBIENT_PROXIMITY < b.y ||
    b.y + b.height + AMBIENT_PROXIMITY < a.y
  );
}

function union(a: SceneBounds, b: SceneBounds): SceneBounds {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  return {
    x: minX,
    y: minY,
    width: Math.max(a.x + a.width, b.x + b.width) - minX,
    height: Math.max(a.y + a.height, b.y + b.height) - minY,
  };
}

function buildAmbientClusters(omitted: SceneNode[]): CanvasSceneAmbientCluster[] {
  if (!omitted.length) return [];

  const groups: Array<{ nodes: SceneNode[]; bounds: SceneBounds }> = [];
  for (const node of omitted) {
    const group = groups.find((candidate) => near(candidate.bounds, node.bounds));
    if (group) {
      group.nodes.push(node);
      group.bounds = union(group.bounds, node.bounds);
    } else if (groups.length < AMBIENT_MAX_CLUSTERS) {
      groups.push({ nodes: [node], bounds: { ...node.bounds } });
    } else {
      const last = groups[groups.length - 1];
      last.nodes.push(node);
      last.bounds = union(last.bounds, node.bounds);
    }
  }

  return groups.map((group, index) => {
    const kinds: Record<string, number> = {};
    const sampleLabels: string[] = [];
    let unconfirmedCount = 0;
    for (const node of group.nodes) {
      kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;
      if (node.verificationStatus === "source" || node.verificationStatus === "confirmed") {
        if (node.text && sampleLabels.length < AMBIENT_MAX_LABELS) sampleLabels.push(node.text.slice(0, AMBIENT_LABEL_CHARS));
      } else {
        unconfirmedCount++;
      }
    }
    const kindsSummary = Object.entries(kinds).map(([kind, count]) => `${count} ${kind}`).join(", ");
    return {
      id: `ambient-${index + 1}`,
      nodeCount: group.nodes.length,
      kinds,
      summary: `${group.nodes.length} other board nodes: ${kindsSummary}${unconfirmedCount ? `, ${unconfirmedCount} unconfirmed` : ""}`,
      sampleLabels,
      unconfirmedCount,
    };
  });
}

export function buildCanvasSceneAIContext(
  graph: CanvasSceneGraph,
  options: { maxChars?: number; maxNodes?: number; maxEdges?: number } = {},
): CanvasSceneAIContext {
  const maxChars = Math.max(500, Math.min(6000, Math.floor(options.maxChars ?? 6000)));
  const maxNodes = Math.max(1, Math.min(24, Math.floor(options.maxNodes ?? 24)));
  const maxEdges = Math.max(1, Math.min(48, Math.floor(options.maxEdges ?? 48)));
  const nodeCounts: Record<string, number> = {};
  for (const node of graph.nodes) nodeCounts[node.kind] = (nodeCounts[node.kind] ?? 0) + 1;

  const ordered = [...graph.nodes]
    .sort((left, right) => nodeRank(left) - nodeRank(right) || left.id.localeCompare(right.id))
    .slice(0, maxNodes);
  const keptIds = new Set(ordered.map((node) => node.id));
  const ambientClusters = buildAmbientClusters(graph.nodes.filter((node) => !keptIds.has(node.id)));
  const groupOf = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "contains" || !edge.from.startsWith("g:") || !keptIds.has(edge.to)) continue;
    if (!groupOf.has(edge.to)) groupOf.set(edge.to, edge.from);
  }

  const context: CanvasSceneAIContext = {
    scope: graph.scope,
    revision: graph.revision,
    revisionHash: graph.revisionHash,
    builderVersion: graph.builderVersion,
    nodeCounts,
    ambientClusters,
    nodes: ordered.map((node) => ({
      id: node.id,
      kind: node.kind,
      text: node.text ? node.text.slice(0, 500) : null,
      recordType: node.recordType,
      bounds: node.bounds,
      origin: node.origin,
      verificationStatus: node.verificationStatus,
      confidence: node.confidence,
      sourceRefs: node.sourceRefs.map((ref) => `${ref.scope}:${ref.id}`),
      uncertaintyReasons: node.uncertaintyReasons.slice(0, 16),
      groupOf: groupOf.get(node.id) ?? null,
    })),
    edges: graph.edges
      .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
      .slice(0, maxEdges)
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        from: edge.from,
        to: edge.to,
        distance: edge.distance,
        basis: edge.basis,
        verificationStatus: edge.verificationStatus,
      })),
    warnings: graph.warnings.slice(0, 16),
    truncated: graph.truncated || graph.nodes.length > maxNodes || graph.edges.length > maxEdges,
  };

  while (JSON.stringify(context).length > maxChars && (context.edges.length || context.nodes.length || context.ambientClusters.length)) {
    context.truncated = true;
    if (context.edges.length) context.edges.pop();
    else if (context.nodes.length) context.nodes.pop();
    else context.ambientClusters.pop();
  }
  if (context.nodes.length) {
    const remaining = new Set(context.nodes.map((node) => node.id));
    context.edges = context.edges.filter((edge) => remaining.has(edge.from) && remaining.has(edge.to));
  } else {
    context.edges = [];
  }
  return context;
}

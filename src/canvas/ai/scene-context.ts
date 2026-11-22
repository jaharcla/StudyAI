import type { CanvasSceneGraph } from "../spatial/types.js";

type SceneNode = CanvasSceneGraph["nodes"][number];
type SceneBounds = SceneNode["bounds"];
type Viewport = { x: number; y: number; w: number; h: number };

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
  inViewportCount: number;
  offViewportCount: number;
};

export type CanvasSceneAIContext = {
  scope: CanvasSceneGraph["scope"];
  revision: number;
  revisionHash: string;
  builderVersion: string;
  nodeCounts: Record<string, number>;
  ambientClusters: CanvasSceneAmbientCluster[];
  unclusteredNodeCount: number;
  unclusteredKinds: Record<string, number>;
  unclusteredUnconfirmedCount: number;
  viewportSummary: {
    known: boolean;
    inViewport: number;
    offViewport: number;
    selected: number;
    omittedInViewport: number;
    omittedOffViewport: number;
  };
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
    selected: boolean;
    inViewport: boolean | null;
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

function nodeRank(node: SceneNode): number {
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

function inViewport(bounds: SceneBounds, viewport?: Viewport): boolean {
  if (!viewport) return true;
  return bounds.x <= viewport.x + viewport.w && bounds.x + bounds.width >= viewport.x
    && bounds.y <= viewport.y + viewport.h && bounds.y + bounds.height >= viewport.y;
}

function tally(nodes: readonly SceneNode[]) {
  const kinds: Record<string, number> = {};
  const sampleLabels: string[] = [];
  let unconfirmedCount = 0;
  for (const node of nodes) {
    kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;
    if (node.verificationStatus === "source" || node.verificationStatus === "confirmed") {
      if (node.text && sampleLabels.length < AMBIENT_MAX_LABELS) sampleLabels.push(node.text.slice(0, AMBIENT_LABEL_CHARS));
    } else {
      unconfirmedCount++;
    }
  }
  return { kinds, sampleLabels, unconfirmedCount };
}

/**
 * Groups omitted nodes by fixed anchor bounds (not an expanding union, which could chain distant
 * regions together). Processing is sorted by node id, so results do not depend on input ordering.
 * Nodes that cannot join any of the bounded clusters are counted separately, never folded into a
 * cluster as if they were spatially connected to it.
 */
function buildAmbientClusters(omitted: SceneNode[], viewport?: Viewport) {
  if (!omitted.length) {
    return { clusters: [] as CanvasSceneAmbientCluster[], unclusteredNodeCount: 0, unclusteredKinds: {} as Record<string, number>, unclusteredUnconfirmedCount: 0 };
  }

  const groups: Array<{ anchor: SceneBounds; anchorId: string; nodes: SceneNode[] }> = [];
  const unclustered: SceneNode[] = [];
  for (const node of [...omitted].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = groups.find((candidate) => near(candidate.anchor, node.bounds));
    if (group) group.nodes.push(node);
    else if (groups.length < AMBIENT_MAX_CLUSTERS) groups.push({ anchor: { ...node.bounds }, anchorId: node.id, nodes: [node] });
    else unclustered.push(node);
  }
  groups.sort((a, b) => a.anchorId.localeCompare(b.anchorId));

  const clusters = groups.map((group) => {
    const { kinds, sampleLabels, unconfirmedCount } = tally(group.nodes);
    const kindsSummary = Object.entries(kinds).map(([kind, count]) => `${count} ${kind}`).join(", ");
    const offViewportCount = viewport ? group.nodes.filter((node) => !inViewport(node.bounds, viewport)).length : 0;
    return {
      id: `ambient-${group.anchorId.slice(0, 64)}`,
      nodeCount: group.nodes.length,
      kinds,
      summary: `${group.nodes.length} other board nodes: ${kindsSummary}${unconfirmedCount ? `, ${unconfirmedCount} unconfirmed` : ""}${offViewportCount ? `, ${offViewportCount} off-viewport (not visible)` : ""}`,
      sampleLabels,
      unconfirmedCount,
      inViewportCount: viewport ? group.nodes.length - offViewportCount : group.nodes.length,
      offViewportCount,
    };
  });

  const unclusteredTally = tally(unclustered);
  return {
    clusters,
    unclusteredNodeCount: unclustered.length,
    unclusteredKinds: unclusteredTally.kinds,
    unclusteredUnconfirmedCount: unclusteredTally.unconfirmedCount,
  };
}

export function buildCanvasSceneAIContext(
  graph: CanvasSceneGraph,
  options: { maxChars?: number; maxNodes?: number; maxEdges?: number; selectedIds?: readonly string[]; viewport?: Viewport } = {},
): CanvasSceneAIContext {
  const maxChars = Math.max(500, Math.min(6000, Math.floor(options.maxChars ?? 6000)));
  const maxNodes = Math.max(1, Math.min(24, Math.floor(options.maxNodes ?? 24)));
  const maxEdges = Math.max(1, Math.min(48, Math.floor(options.maxEdges ?? 48)));
  const viewport = options.viewport;
  const viewportKnown = Boolean(viewport);
  const selectedIds = new Set(options.selectedIds ?? []);
  const nodeCounts: Record<string, number> = {};
  for (const node of graph.nodes) nodeCounts[node.kind] = (nodeCounts[node.kind] ?? 0) + 1;

  // QuickDraw selection ids are source ids, not scene node ids. Resolve through the source-reference
  // contract: a node is selected when its own ref or any of its sourceRefs carries a selected id.
  const isSelected = (node: SceneNode) => selectedIds.has(node.ref.id) || node.sourceRefs.some((ref) => selectedIds.has(ref.id));
  const visible = (node: SceneNode) => viewportKnown && inViewport(node.bounds, viewport);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  const neighbors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
    if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
    neighbors.get(edge.from)!.add(edge.to);
    neighbors.get(edge.to)!.add(edge.from);
  }
  const focusIds = new Set(graph.nodes.filter((node) => isSelected(node) || visible(node)).map((node) => node.id));
  const connected = new Set<string>();
  for (const id of focusIds) for (const other of neighbors.get(id) ?? []) if (!focusIds.has(other)) connected.add(other);

  const priority = (node: SceneNode): number => {
    const confirmed = node.verificationStatus === "source" || node.verificationStatus === "confirmed";
    if (isSelected(node)) return 0;
    if (visible(node) && confirmed) return 1;
    if (connected.has(node.id)) return 2;
    if (confirmed) return 3;
    if (visible(node)) return 4;
    return 5;
  };
  const ordered = [...graph.nodes]
    .sort((left, right) => priority(left) - priority(right) || nodeRank(left) - nodeRank(right) || left.id.localeCompare(right.id))
    .slice(0, maxNodes);
  const keptIds = new Set(ordered.map((node) => node.id));
  const omitted = graph.nodes.filter((node) => !keptIds.has(node.id));
  const ambient = buildAmbientClusters(omitted, viewport);

  const groupOf = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "contains" || !edge.from.startsWith("g:") || !keptIds.has(edge.to)) continue;
    if (!groupOf.has(edge.to)) groupOf.set(edge.to, edge.from);
  }
  const edgeRank = (edge: CanvasSceneGraph["edges"][number]) => {
    const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
    return (from && focusIds.has(from.id)) || (to && focusIds.has(to.id)) ? 0 : 1;
  };

  const context: CanvasSceneAIContext = {
    scope: graph.scope,
    revision: graph.revision,
    revisionHash: graph.revisionHash,
    builderVersion: graph.builderVersion,
    nodeCounts,
    ambientClusters: ambient.clusters,
    unclusteredNodeCount: ambient.unclusteredNodeCount,
    unclusteredKinds: ambient.unclusteredKinds,
    unclusteredUnconfirmedCount: ambient.unclusteredUnconfirmedCount,
    viewportSummary: {
      known: viewportKnown,
      inViewport: viewportKnown ? graph.nodes.filter((node) => inViewport(node.bounds, viewport)).length : 0,
      offViewport: viewportKnown ? graph.nodes.filter((node) => !inViewport(node.bounds, viewport)).length : 0,
      selected: graph.nodes.filter(isSelected).length,
      omittedInViewport: viewportKnown ? omitted.filter((node) => inViewport(node.bounds, viewport)).length : 0,
      omittedOffViewport: viewportKnown ? omitted.filter((node) => !inViewport(node.bounds, viewport)).length : 0,
    },
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
      selected: isSelected(node),
      inViewport: viewportKnown ? inViewport(node.bounds, viewport) : null,
    })),
    edges: graph.edges
      .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
      .sort((a, b) => edgeRank(a) - edgeRank(b) || a.id.localeCompare(b.id))
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
    else if (context.nodes.length) {
      let removable = context.nodes.length - 1;
      while (removable >= 0 && context.nodes[removable].selected) removable--;
      context.nodes.splice(removable >= 0 ? removable : context.nodes.length - 1, 1);
    } else context.ambientClusters.pop();
  }
  if (context.nodes.length) {
    const remaining = new Set(context.nodes.map((node) => node.id));
    context.edges = context.edges.filter((edge) => remaining.has(edge.from) && remaining.has(edge.to));
  } else {
    context.edges = [];
  }
  return context;
}

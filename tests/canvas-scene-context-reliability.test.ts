import { describe, expect, it } from "vitest";
import { buildCanvasSceneAIContext } from "../src/canvas/ai/scene-context.js";
import { buildTutorCanvasContext } from "../src/canvas/ai/tutor-canvas-context.js";
import { CanvasSceneGraphSchema, type CanvasSceneEdge, type CanvasSceneGraph, type CanvasSceneNode } from "../src/canvas/spatial/types.js";

type NodeOptions = {
  kind?: CanvasSceneNode["kind"];
  sourceId?: string;
  ref?: CanvasSceneNode["ref"];
  width?: number;
  height?: number;
  text?: string | null;
  status?: CanvasSceneNode["verificationStatus"];
  confidence?: number | null;
  sourceRefs?: CanvasSceneNode["sourceRefs"];
  reasons?: string[];
};

function sceneNode(id: string, x: number, y: number, options: NodeOptions = {}): CanvasSceneNode {
  return {
    id,
    kind: options.kind ?? "native-object",
    ref: options.ref ?? { scope: "quickdraw", id: options.sourceId ?? id },
    bounds: { x, y, width: options.width ?? 40, height: options.height ?? 40 },
    boundsBasis: "source",
    text: options.text ?? null,
    recordType: null,
    origin: "quickdraw",
    verificationStatus: options.status ?? "source",
    confidence: options.confidence ?? 1,
    sourceRefs: options.sourceRefs ?? [],
    geometry: null,
    uncertaintyReasons: options.reasons ?? [],
  };
}

function makeGraph(nodes: CanvasSceneNode[], edges: CanvasSceneEdge[] = []): CanvasSceneGraph {
  return CanvasSceneGraphSchema.parse({
    schemaVersion: 1,
    scope: { boardId: "board", courseId: "course", lessonId: "lesson" },
    revision: 7,
    revisionHash: "rev-7",
    snapshotHash: "snap-7",
    builderVersion: "test",
    builtAt: "2026-11-21T20:00:00.000Z",
    nodes,
    edges,
    warnings: [],
    truncated: false,
  });
}

function edge(from: string, to: string, kind: CanvasSceneEdge["kind"] = "near"): CanvasSceneEdge {
  return {
    id: `e:${from}:${kind}:${to}`,
    kind,
    from,
    to,
    origin: "geometry",
    verificationStatus: "derived",
    basis: "bounds",
    distance: 10,
    confidence: 1,
    sourceRefs: [],
    uncertaintyReasons: [],
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

const viewport = { x: -2000, y: -2000, w: 20000, h: 20000 };

describe("ambient cluster determinism and spatial coherence", () => {
  function regions() {
    const nodes: CanvasSceneNode[] = [];
    for (let region = 0; region < 10; region++) {
      nodes.push(sceneNode(`node:${String(region).padStart(2, "0")}:a`, region * 1000, 0));
      nodes.push(sceneNode(`node:${String(region).padStart(2, "0")}:b`, region * 1000 + 30, 30));
    }
    return nodes;
  }

  it("produces identical clusters for repeated runs and randomized input ordering", () => {
    const nodes = regions();
    const signature = (graph: CanvasSceneGraph) => JSON.stringify({
      clusters: buildCanvasSceneAIContext(graph, { maxNodes: 2, viewport }).ambientClusters,
      unclusteredNodeCount: buildCanvasSceneAIContext(graph, { maxNodes: 2, viewport }).unclusteredNodeCount,
    });
    const expected = signature(makeGraph(nodes));
    for (let seed = 1; seed <= 8; seed++) expect(signature(makeGraph(shuffled(nodes, seed)))).toBe(expected);
    for (let run = 0; run < 5; run++) expect(signature(makeGraph(nodes))).toBe(expected);
  });

  it("caps clusters at six and aggregates additional disconnected regions instead of merging them", () => {
    const context = buildCanvasSceneAIContext(makeGraph(regions()), { maxNodes: 1, viewport });
    expect(context.ambientClusters).toHaveLength(6);
    expect(context.ambientClusters.every((cluster) => cluster.nodeCount <= 3)).toBe(true);
    expect(context.unclusteredNodeCount).toBeGreaterThan(0);
    expect(context.unclusteredKinds["native-object"]).toBe(context.unclusteredNodeCount);
    const clustered = context.ambientClusters.reduce((sum, cluster) => sum + cluster.nodeCount, 0);
    expect(clustered + context.unclusteredNodeCount).toBe(19);
  });

  it("treats nodes exactly at the proximity boundary as near and just beyond it as separate", () => {
    const keeper = sceneNode("keeper", -8000, -8000);
    const atBoundary = makeGraph([keeper, sceneNode("a", 0, 0), sceneNode("b", 290, 0)]);
    const beyond = makeGraph([keeper, sceneNode("a", 0, 0), sceneNode("b", 291, 0)]);
    const options = { maxNodes: 1, viewport, selectedIds: ["keeper"] };
    expect(buildCanvasSceneAIContext(atBoundary, options).ambientClusters).toHaveLength(1);
    expect(buildCanvasSceneAIContext(beyond, options).ambientClusters).toHaveLength(2);
  });

  it("keeps stable cluster identifiers across reordering", () => {
    const nodes = regions();
    const ids = (graph: CanvasSceneGraph) => buildCanvasSceneAIContext(graph, { maxNodes: 1, viewport }).ambientClusters.map((cluster) => cluster.id);
    const expected = ids(makeGraph(nodes));
    expect(new Set(expected).size).toBe(expected.length);
    for (let seed = 1; seed <= 5; seed++) expect(ids(makeGraph(shuffled(nodes, seed)))).toEqual(expected);
  });

  it("preserves uncertainty boundaries in mixed confirmed/unconfirmed evidence", () => {
    const graph = makeGraph([
      sceneNode("kept", 0, 0),
      sceneNode("confirmed", 1000, 0, { text: "confirmed label" }),
      sceneNode("ocr", 1000, 30, { kind: "ocr-item", sourceId: "ocr-1", status: "unconfirmed", text: "GHOST", confidence: 0.4, reasons: ["low confidence"] }),
      sceneNode("far", 9000, 0, { kind: "model-observation", sourceId: "model-1", status: "unconfirmed", text: "FAR-GHOST", confidence: 0.2 }),
    ]);
    const context = buildCanvasSceneAIContext(graph, { maxNodes: 1, viewport, selectedIds: ["kept"] });
    const labels = context.ambientClusters.flatMap((cluster) => cluster.sampleLabels);
    expect(labels).toEqual(["confirmed label"]);
    expect(labels.join(" ")).not.toContain("GHOST");
    expect(context.ambientClusters.reduce((sum, cluster) => sum + cluster.unconfirmedCount, 0)).toBe(2);
    expect(context.unclusteredUnconfirmedCount).toBeGreaterThanOrEqual(0);
  });
});

describe("selected, visible and connected-aware scene context", () => {
  function manyNodes() {
    return Array.from({ length: 30 }, (_, index) => sceneNode(`n:${String(index).padStart(2, "0")}`, index * 200, 0, { sourceId: `src-${index}` }));
  }

  it("keeps a selected node even when it would be truncated by id order", () => {
    const nodes = manyNodes();
    const graph = makeGraph(nodes);
    const without = buildCanvasSceneAIContext(graph, { maxNodes: 3, viewport });
    expect(without.nodes.some((node) => node.id === "n:29")).toBe(false);

    const withSelection = buildCanvasSceneAIContext(graph, { maxNodes: 3, selectedIds: ["src-29"], viewport });
    expect(withSelection.nodes[0]).toMatchObject({ id: "n:29", selected: true });
    expect(withSelection.viewportSummary.selected).toBe(1);
  });

  it("resolves selection through source references, not scene node id equality", () => {
    const derived = sceneNode("g:group", 0, 0, {
      kind: "stroke-group",
      ref: { scope: "scene", id: "g:group" },
      sourceRefs: [{ scope: "quickdraw", id: "src-7" }],
    });
    const context = buildCanvasSceneAIContext(makeGraph([...manyNodes(), derived]), { maxNodes: 3, selectedIds: ["src-7"], viewport });
    expect(context.nodes.some((node) => node.id === "g:group" && node.selected)).toBe(true);
  });

  it("prioritizes visible objects over equally verified off-viewport objects", () => {
    const graph = makeGraph([
      sceneNode("off:0", 9000, 9000),
      sceneNode("off:1", 9200, 9000),
      sceneNode("visible", 100, 100),
    ]);
    const context = buildCanvasSceneAIContext(graph, { maxNodes: 1, viewport: { x: 0, y: 0, w: 500, h: 500 } });
    expect(context.nodes[0].id).toBe("visible");
    expect(context.nodes[0].inViewport).toBe(true);
  });

  it("preserves a directly connected neighbor of a selected node where possible", () => {
    const graph = makeGraph([...manyNodes(), sceneNode("candidate", 5000, 0)], [edge("n:29", "candidate")]);
    const context = buildCanvasSceneAIContext(graph, { maxNodes: 3, selectedIds: ["src-29"], viewport });
    expect(context.nodes.map((node) => node.id)).toContain("candidate");
    expect(context.edges.some((item) => item.from === "n:29" && item.to === "candidate")).toBe(true);
  });

  it("summarizes off-screen nodes without presenting them as visible", () => {
    const nodes = [
      sceneNode("visible", 0, 0),
      ...Array.from({ length: 8 }, (_, index) => sceneNode(`off:${index}`, 9000 + index * 100, 9000)),
    ];
    const context = buildCanvasSceneAIContext(makeGraph(nodes), { maxNodes: 1, viewport: { x: 0, y: 0, w: 500, h: 500 } });
    expect(context.viewportSummary.offViewport).toBe(8);
    expect(context.viewportSummary.omittedOffViewport).toBe(8);
    expect(context.ambientClusters.some((cluster) => cluster.offViewportCount > 0)).toBe(true);
    expect(context.ambientClusters.some((cluster) => cluster.summary.includes("off-viewport"))).toBe(true);
    expect(context.nodes.every((node) => node.inViewport !== false || node.id === "visible")).toBe(true);
  });

  it("produces deterministic full context for reordered graph nodes", () => {
    const nodes = manyNodes();
    const options = { maxNodes: 6, maxEdges: 5, selectedIds: ["src-12"], viewport: { x: 0, y: 0, w: 1000, h: 500 } };
    const expected = JSON.stringify(buildCanvasSceneAIContext(makeGraph(nodes), options));
    for (let seed = 1; seed <= 6; seed++) expect(JSON.stringify(buildCanvasSceneAIContext(makeGraph(shuffled(nodes, seed)), options))).toBe(expected);
  });

  it("always respects the character budget", () => {
    const graph = makeGraph([...manyNodes(), sceneNode("g:group", 0, 0, { kind: "stroke-group", ref: { scope: "scene", id: "g:group" }, sourceRefs: [{ scope: "quickdraw", id: "src-3" }] })], manyNodes().slice(0, 6).map((node, index) => edge(node.id, manyNodes()[index + 1].id)));
    for (const maxChars of [500, 800, 1200, 2500, 6000]) {
      const context = buildCanvasSceneAIContext(graph, { maxChars, maxNodes: 12, selectedIds: ["src-29"], viewport });
      expect(JSON.stringify(context).length).toBeLessThanOrEqual(maxChars);
    }
  });

  it("threads selected ids and viewport through the tutor context builder", () => {
    const context = buildTutorCanvasContext({
      scene: makeGraph(manyNodes()),
      shapes: null,
      selectedIds: ["src-29"],
      viewport: { x: 18000, y: 0, w: 500, h: 500 },
    });
    expect(context.scene?.nodes[0]).toMatchObject({ id: "n:29", selected: true });
    expect(context.viewport).toEqual({ x: 18000, y: 0, w: 500, h: 500 });
    expect(context.scene?.viewportSummary.selected).toBe(1);
  });
});

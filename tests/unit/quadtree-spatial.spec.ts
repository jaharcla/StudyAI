import { describe, expect, it } from "vitest";
import { CanvasQuadtree } from "../../server/canvas/quadtree";
import { AmbientClusterSummarizer } from "../../server/canvas/cluster-summarizer";
import { LayoutConstraintSolver } from "../../src/canvas/layout-solver";
import { CanvasNode } from "../../server/canvas/spatial-types";

describe("Canvas Intelligence v2: Spatial & Layout Modules", () => {
  it("queries Quadtree nodes within viewport range accurately", () => {
    const nodes: CanvasNode[] = [
      { id: "1", type: "rectangle", bounds: { x: 10, y: 10, width: 50, height: 50 } },
      { id: "2", type: "circle", bounds: { x: 500, y: 500, width: 50, height: 50 } },
      { id: "3", type: "arrow", bounds: { x: 20, y: 20, width: 10, height: 10 } },
    ];

    const tree = CanvasQuadtree.buildFromNodes(nodes);
    const range = { x: 0, y: 0, width: 100, height: 100 };
    const result = tree.query(range);

    expect(result.map((n) => n.id)).toEqual(expect.arrayContaining(["1", "3"]));
    expect(result.map((n) => n.id)).not.toContain("2");
  });

  it("aggregates off-screen nodes into ambient clusters", () => {
    const allNodes: CanvasNode[] = [
      { id: "1", type: "rectangle", bounds: { x: 0, y: 0, width: 50, height: 50 } },
      { id: "2", type: "text", bounds: { x: 1500, y: 1500, width: 100, height: 30 } },
      { id: "3", type: "text", bounds: { x: 1550, y: 1520, width: 80, height: 30 } },
    ];

    const viewport = { x: -100, y: -100, width: 500, height: 500 };
    const clusters = AmbientClusterSummarizer.clusterOffscreenNodes(allNodes, viewport);

    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeCount).toBe(2);
    expect(clusters[0].summary).toContain("2-node cluster");
  });

  it("resolves AABB proposal collisions with non-overlapping displacement", () => {
    const existing = [{ x: 100, y: 100, width: 100, height: 100 }];
    const targets = [{ id: "prop1", suggestedBounds: { x: 120, y: 120, width: 50, height: 50 } }];

    const result = LayoutConstraintSolver.resolveCollisions(existing, targets);

    expect(result.hasCollisions).toBe(true);
    expect(result.resolvedBounds[0].x !== 120 || result.resolvedBounds[0].y !== 120).toBe(true);
  });
});

import { AmbientCluster, BoundingBox, CanvasNode } from "./spatial-types";

function boundsOverlapOrNear(a: BoundingBox, b: BoundingBox, margin: number): boolean {
  return !(
    a.x + a.width + margin < b.x ||
    b.x + b.width + margin < a.x ||
    a.y + a.height + margin < b.y ||
    b.y + b.height + margin < a.y
  );
}

function mergeBounds(a: BoundingBox, b: BoundingBox): BoundingBox {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export class AmbientClusterSummarizer {
  static clusterOffscreenNodes(
    allNodes: CanvasNode[],
    viewport: BoundingBox,
    proximityDistance = 250
  ): AmbientCluster[] {
    const offscreenNodes = allNodes.filter(
      (n) =>
        !(
          n.bounds.x >= viewport.x &&
          n.bounds.x + n.bounds.width <= viewport.x + viewport.width &&
          n.bounds.y >= viewport.y &&
          n.bounds.y + n.bounds.height <= viewport.y + viewport.height
        )
    );

    if (offscreenNodes.length === 0) {
      return [];
    }

    const clusters: { nodes: CanvasNode[]; bounds: BoundingBox }[] = [];

    for (const node of offscreenNodes) {
      let merged = false;
      for (const cluster of clusters) {
        if (boundsOverlapOrNear(cluster.bounds, node.bounds, proximityDistance)) {
          cluster.nodes.push(node);
          cluster.bounds = mergeBounds(cluster.bounds, node.bounds);
          merged = true;
          break;
        }
      }

      if (!merged) {
        clusters.push({
          nodes: [node],
          bounds: { ...node.bounds },
        });
      }
    }

    return clusters.map((c, index) => {
      const typeCounts: Record<string, number> = {};
      const connectedSet = new Set<string>();

      for (const n of c.nodes) {
        typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
        if (n.attachments) {
          n.attachments.forEach((att) => connectedSet.add(att));
        }
      }

      const summaryParts = Object.entries(typeCounts).map(
        ([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`
      );

      return {
        id: `ambient_cluster_${index + 1}`,
        bounds: c.bounds,
        nodeCount: c.nodes.length,
        summary: `${c.nodes.length}-node cluster: ${summaryParts.join(", ")}`,
        connectedNodeIds: Array.from(connectedSet),
        types: typeCounts,
      };
    });
  }
}

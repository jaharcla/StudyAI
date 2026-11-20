# Canvas Intelligence v2: Off-Screen Semantic Cluster Aggregation & Layout Constraint Engine Architecture

## 1. Executive Summary
This document specifies the technical architecture for **Canvas Intelligence v2**, introducing:
- **Spatial Quadtree Indexing ($\mathcal{O}(N \log N)$ build, $\mathcal{O}(\log N + K)$ query)** to replace flat node array scans for large canvas boards.
- **Off-Screen Ambient Cluster Aggregation** to summarize out-of-viewport nodes into compact, semantically grouped rollups rather than discarding them or overflowing context windows.
- **2D Layout Constraint Engine** utilizing Axis-Aligned Bounding Box (AABB) overlap resolution and spring-embedding separation to ensure AI-generated diagram proposals never collide with existing student work.

---

## 2. Core Components & Interfaces

### 2.1 Spatial Quadtree Index (`server/canvas/quadtree.ts`)
A dynamic 2D Quadtree partitioning canvas space into bounding quadrants.

```typescript
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  bounds: BoundingBox;
  text?: string;
  groupId?: string;
}
```

### 2.2 Off-Screen Ambient Cluster Aggregator (`server/canvas/cluster-summarizer.ts`)
Grouping algorithm aggregating non-viewport nodes into ambient clusters.

```typescript
export interface AmbientCluster {
  id: string;
  bounds: BoundingBox;
  nodeCount: number;
  summary: string;
  connectedNodeIds: string[];
}
```

### 2.3 2D Layout Constraint Solver (`src/canvas/layout-solver.ts`)
Constraint engine enforcing non-overlapping AI proposal placement.

---

## 3. Implementation Plan

- [x] Data contracts in `server/canvas/spatial-types.ts`
- [x] Quadtree spatial index in `server/canvas/quadtree.ts`
- [x] Cluster summarizer in `server/canvas/cluster-summarizer.ts`
- [x] 2D layout solver in `src/canvas/layout-solver.ts`
- [x] Unit test coverage in `tests/unit/quadtree-spatial.spec.ts`

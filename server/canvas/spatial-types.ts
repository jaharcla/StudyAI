/**
 * Shared data contracts and geometric primitives for Canvas Intelligence v2.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  bounds: BoundingBox;
  text?: string;
  groupId?: string;
  attachments?: string[];
}

export interface AmbientCluster {
  id: string;
  bounds: BoundingBox;
  nodeCount: number;
  summary: string;
  connectedNodeIds: string[];
  types: Record<string, number>;
}

export interface HybridCanvasPromptContext {
  focusedNodes: CanvasNode[];
  ambientClusters: AmbientCluster[];
  isIncomplete: boolean;
  viewport: BoundingBox;
  totalNodeCount: number;
}

export interface LayoutTarget {
  id: string;
  suggestedBounds: BoundingBox;
  pinned?: boolean;
}

export interface LayoutResolutionResult {
  resolvedBounds: BoundingBox[];
  displacements: Point[];
  hasCollisions: boolean;
  iterations: number;
}

import type { CanvasSceneBounds, CanvasSceneNode } from "./types.js";

export interface CanvasSpatialIndex {
  insert(node: CanvasSceneNode): void;
  remove(id: string): void;
  query(bounds: CanvasSceneBounds): CanvasSceneNode[];
  nearest(point: { x: number; y: number }, limit: number, maxDistance?: number): Array<{ node: CanvasSceneNode; distance: number }>;
  size(): number;
}

function intersects(a: CanvasSceneBounds, b: CanvasSceneBounds) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function gap(a: CanvasSceneBounds, b: CanvasSceneBounds) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

export class CanvasGridSpatialIndex implements CanvasSpatialIndex {
  private readonly cellSize: number;
  private readonly linearThreshold: number;
  private readonly maxCellsPerNode: number;
  private readonly nodes = new Map<string, CanvasSceneNode>();
  private readonly cells = new Map<string, Set<string>>();
  private readonly overflow = new Set<string>();

  constructor(options: { cellSize?: number; linearThreshold?: number; maxCellsPerNode?: number } = {}) {
    this.cellSize = Math.max(64, Math.min(256, Math.floor(options.cellSize ?? 128)));
    this.linearThreshold = Math.max(0, Math.floor(options.linearThreshold ?? 256));
    this.maxCellsPerNode = Math.max(1, Math.floor(options.maxCellsPerNode ?? 256));
  }

  insert(node: CanvasSceneNode): void {
    this.nodes.set(node.id, node);
    if (this.nodes.size <= this.linearThreshold) return;
    this.insertGrid(node);
  }

  private insertGrid(node: CanvasSceneNode) {
    const bounds = node.bounds;
    const x0 = Math.floor(bounds.x / this.cellSize), y0 = Math.floor(bounds.y / this.cellSize);
    const x1 = Math.floor((bounds.x + bounds.width) / this.cellSize), y1 = Math.floor((bounds.y + bounds.height) / this.cellSize);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > this.maxCellsPerNode) { this.overflow.add(node.id); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x}:${y}`;
      const cell = this.cells.get(key) ?? new Set<string>();
      cell.add(node.id);
      this.cells.set(key, cell);
    }
  }

  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    this.overflow.delete(id);
    for (const cell of this.cells.values()) cell.delete(id);
  }

  query(bounds: CanvasSceneBounds): CanvasSceneNode[] {
    if (this.nodes.size <= this.linearThreshold) return [...this.nodes.values()].filter((node) => intersects(node.bounds, bounds)).sort((a, b) => a.id.localeCompare(b.id));
    const ids = new Set(this.overflow);
    const x0 = Math.floor(bounds.x / this.cellSize), y0 = Math.floor(bounds.y / this.cellSize);
    const x1 = Math.floor((bounds.x + bounds.width) / this.cellSize), y1 = Math.floor((bounds.y + bounds.height) / this.cellSize);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const id of this.cells.get(`${x}:${y}`) ?? []) ids.add(id);
    return [...ids].map((id) => this.nodes.get(id)).filter((node): node is CanvasSceneNode => Boolean(node) && intersects(node!.bounds, bounds)).sort((a, b) => a.id.localeCompare(b.id));
  }

  nearest(point: { x: number; y: number }, limit: number, maxDistance = Number.POSITIVE_INFINITY): Array<{ node: CanvasSceneNode; distance: number }> {
    const search = { x: point.x, y: point.y, width: 0, height: 0 };
    return [...this.nodes.values()]
      .map((node) => ({ node, distance: gap(node.bounds, search) }))
      .filter((item) => item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id))
      .slice(0, Math.max(0, limit));
  }

  size(): number {
    return this.nodes.size;
  }
}

export function createCanvasSpatialIndex(options?: { cellSize?: number; linearThreshold?: number; maxCellsPerNode?: number }): CanvasSpatialIndex {
  return new CanvasGridSpatialIndex(options);
}

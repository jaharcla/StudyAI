import { BoundingBox, CanvasNode } from "./spatial-types";

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function containsPoint(bounds: BoundingBox, x: number, y: number): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

export class QuadtreeNode {
  bounds: BoundingBox;
  capacity: number;
  nodes: CanvasNode[] = [];
  divided: boolean = false;
  northWest?: QuadtreeNode;
  northEast?: QuadtreeNode;
  southWest?: QuadtreeNode;
  southEast?: QuadtreeNode;

  constructor(bounds: BoundingBox, capacity: number = 8) {
    this.bounds = bounds;
    this.capacity = capacity;
  }

  subdivide(): void {
    const x = this.bounds.x;
    const y = this.bounds.y;
    const w = this.bounds.width / 2;
    const h = this.bounds.height / 2;

    this.northWest = new QuadtreeNode({ x, y, width: w, height: h }, this.capacity);
    this.northEast = new QuadtreeNode({ x: x + w, y, width: w, height: h }, this.capacity);
    this.southWest = new QuadtreeNode({ x, y: y + h, width: w, height: h }, this.capacity);
    this.southEast = new QuadtreeNode({ x: x + w, y, width: w, height: h }, this.capacity);
    this.divided = true;
  }

  insert(node: CanvasNode): boolean {
    const center = {
      x: node.bounds.x + node.bounds.width / 2,
      y: node.bounds.y + node.bounds.height / 2,
    };

    if (!containsPoint(this.bounds, center.x, center.y)) {
      return false;
    }

    if (this.nodes.length < this.capacity && !this.divided) {
      this.nodes.push(node);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
      const existing = this.nodes;
      this.nodes = [];
      for (const e of existing) {
        this.insert(e);
      }
    }

    return (
      this.northWest!.insert(node) ||
      this.northEast!.insert(node) ||
      this.southWest!.insert(node) ||
      this.southEast!.insert(node)
    );
  }

  queryRange(range: BoundingBox, found: CanvasNode[] = []): CanvasNode[] {
    if (!intersects(this.bounds, range)) {
      return found;
    }

    for (const node of this.nodes) {
      if (intersects(node.bounds, range)) {
        found.push(node);
      }
    }

    if (this.divided) {
      this.northWest!.queryRange(range, found);
      this.northEast!.queryRange(range, found);
      this.southWest!.queryRange(range, found);
      this.southEast!.queryRange(range, found);
    }

    return found;
  }
}

export class CanvasQuadtree {
  root: QuadtreeNode;

  constructor(worldBounds: BoundingBox, capacity: number = 8) {
    this.root = new QuadtreeNode(worldBounds, capacity);
  }

  static buildFromNodes(nodes: CanvasNode[], defaultPadding = 1000): CanvasQuadtree {
    if (nodes.length === 0) {
      return new CanvasQuadtree({ x: -5000, y: -5000, width: 10000, height: 10000 });
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.bounds.x);
      minY = Math.min(minY, n.bounds.y);
      maxX = Math.max(maxX, n.bounds.x + n.bounds.width);
      maxY = Math.max(maxY, n.bounds.y + n.bounds.height);
    }

    const bounds: BoundingBox = {
      x: minX - defaultPadding,
      y: minY - defaultPadding,
      width: Math.max(100, maxX - minX + defaultPadding * 2),
      height: Math.max(100, maxY - minY + defaultPadding * 2),
    };

    const tree = new CanvasQuadtree(bounds);
    for (const n of nodes) {
      tree.root.insert(n);
    }
    return tree;
  }

  query(range: BoundingBox): CanvasNode[] {
    return this.root.queryRange(range, []);
  }
}

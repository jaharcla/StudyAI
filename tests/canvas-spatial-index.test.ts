import { describe, expect, it } from "vitest";
import { createCanvasSpatialIndex } from "../src/canvas/spatial/index.js";
import type { CanvasSceneBounds, CanvasSceneNode } from "../src/canvas/spatial/types.js";

function makeNode(id: string, x: number, y: number, width = 20, height = 20): CanvasSceneNode {
  return {
    id,
    kind: "native-object",
    ref: { scope: "quickdraw", id },
    bounds: { x, y, width, height },
    boundsBasis: "source",
    text: null,
    recordType: null,
    origin: "quickdraw",
    verificationStatus: "source",
    confidence: 1,
    sourceRefs: [],
    geometry: null,
    uncertaintyReasons: [],
  };
}

function intersects(a: CanvasSceneBounds, b: CanvasSceneBounds) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function gap(a: CanvasSceneBounds, b: CanvasSceneBounds) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

const byId = (a: CanvasSceneNode, b: CanvasSceneNode) => a.id.localeCompare(b.id);

function bruteQuery(nodes: readonly CanvasSceneNode[], bounds: CanvasSceneBounds): string[] {
  return nodes.filter((node) => intersects(node.bounds, bounds)).sort(byId).map((node) => node.id);
}

function bruteNearest(nodes: readonly CanvasSceneNode[], point: { x: number; y: number }, limit: number, maxDistance = Number.POSITIVE_INFINITY) {
  const search = { ...point, width: 0, height: 0 };
  return nodes
    .map((node) => ({ id: node.id, distance: gap(node.bounds, search) }))
    .filter((item) => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gridNodes(count: number): CanvasSceneNode[] {
  return Array.from({ length: count }, (_, index) => {
    const column = index % 50;
    const row = Math.floor(index / 50);
    return makeNode(`n:${String(index).padStart(5, "0")}`, column * 40 - 500, row * 40 - 500);
  });
}

describe("CanvasGridSpatialIndex threshold transition", () => {
  it.each([255, 256, 257, 300, 1000, 10_000])("returns every node and no duplicates with %i nodes", (count) => {
    const nodes = gridNodes(count);
    const index = createCanvasSpatialIndex();
    for (const node of nodes) index.insert(node);
    expect(index.size()).toBe(count);

    const all = { x: -1000, y: -1000, width: 4000, height: 4000 };
    const results = index.query(all).map((node) => node.id);
    expect(results).toEqual(bruteQuery(nodes, all));
    expect(new Set(results).size).toBe(results.length);

    for (const node of count <= 1000 ? nodes : nodes.filter((_, i) => i % 20 === 0)) {
      const found = index.query(node.bounds).map((item) => item.id);
      expect(found, `node ${node.id} must be queryable from its own bounds`).toContain(node.id);
      expect(found.filter((id) => id === node.id)).toHaveLength(1);
    }
  });

  it("indexes large objects spanning many cells (overflow) and keeps them queryable", () => {
    const index = createCanvasSpatialIndex();
    const large = makeNode("large:1", -2000, -2000, 5000, 5000);
    const nodes = [...gridNodes(300), large];
    for (const node of nodes) index.insert(node);

    expect(index.query(large.bounds).map((node) => node.id)).toEqual(bruteQuery(nodes, large.bounds));
    expect(index.query({ x: 0, y: 0, width: 10, height: 10 }).map((node) => node.id)).toContain("large:1");
    expect(index.nearest({ x: 0, y: 0 }, 6).some((item) => item.node.id === "large:1")).toBe(true);
  });

  it("keeps the index correct when removals cross the threshold in both directions", () => {
    const index = createCanvasSpatialIndex();
    let nodes = gridNodes(300);
    for (const node of nodes) index.insert(node);

    const removed = nodes.slice(0, 100);
    for (const node of removed) index.remove(node.id);
    nodes = nodes.slice(100);
    expect(index.size()).toBe(200);

    const bounds = { x: -1000, y: -1000, width: 4000, height: 4000 };
    expect(index.query(bounds).map((node) => node.id)).toEqual(bruteQuery(nodes, bounds));

    for (const node of gridNodes(60)) {
      index.insert(node);
      nodes.push(node);
    }
    expect(index.query(bounds).map((node) => node.id)).toEqual(bruteQuery(nodes, bounds));

    const remaining = [...nodes];
    for (const node of remaining) index.remove(node.id);
    expect(index.size()).toBe(0);
    expect(index.query(bounds)).toEqual([]);
    expect(index.nearest({ x: 0, y: 0 }, 3)).toEqual([]);
  });

  it("re-inserting an existing id replaces its bounds without stale cell references", () => {
    const index = createCanvasSpatialIndex();
    const nodes = gridNodes(300);
    for (const node of nodes) index.insert(node);

    const original = nodes[10];
    const oldBounds = { ...original.bounds };
    const moved = makeNode(original.id, 9000, 9000, 40, 40);
    index.insert(moved);
    const expected = nodes.map((node) => (node.id === moved.id ? moved : node));

    expect(index.query(oldBounds).map((node) => node.id)).not.toContain(moved.id);
    expect(index.query(moved.bounds).map((node) => node.id)).toContain(moved.id);
    const all = { x: -2000, y: -2000, width: 14000, height: 14000 };
    expect(index.query(all).map((node) => node.id)).toEqual(bruteQuery(expected, all));
    expect(index.size()).toBe(300);
  });

  it("handles negative coordinates and negative-to-positive spans", () => {
    const index = createCanvasSpatialIndex({ linearThreshold: 2 });
    const nodes = [
      makeNode("a", -300, -300, 100, 100),
      makeNode("b", -50, -50, 100, 100),
      makeNode("c", 100, 100, 100, 100),
      makeNode("d", -400, 200, 900, 50),
    ];
    for (const node of nodes) index.insert(node);
    expect(index.query({ x: -400, y: -400, width: 800, height: 800 }).map((node) => node.id)).toEqual(bruteQuery(nodes, { x: -400, y: -400, width: 800, height: 800 }));
  });
});

describe("CanvasGridSpatialIndex nearest", () => {
  it("returns exact nearest results, respecting limit, maxDistance and deterministic ties", () => {
    const index = createCanvasSpatialIndex();
    expect(index.nearest({ x: 0, y: 0 }, 3)).toEqual([]);

    const nodes = [
      makeNode("b", 100, 0),
      makeNode("a", 100, 0),
      makeNode("far", 1000, 1000),
      makeNode("large", -50, -50, 200, 200),
    ];
    for (const node of nodes) index.insert(node);

    expect(index.nearest({ x: 0, y: 0 }, 2).map((item) => item.node.id)).toEqual(["large", "a"]);
    expect(index.nearest({ x: 0, y: 0 }, 10, 50).map((item) => item.node.id)).toEqual(["large"]);
    expect(index.nearest({ x: 0, y: 0 }, 0)).toEqual([]);
    expect(index.nearest({ x: 0, y: 0 }, -3)).toEqual([]);
  });
});

describe("CanvasGridSpatialIndex randomized differential tests", () => {
  for (const seed of [1, 7, 42, 1337, 90210]) {
    it(`matches brute force for seed ${seed}`, () => {
      const random = mulberry32(seed);
      const index = createCanvasSpatialIndex({ linearThreshold: 4 + Math.floor(random() * 60), maxCellsPerNode: 4 + Math.floor(random() * 40) });
      let nodes: CanvasSceneNode[] = [];
      let counter = 0;

      for (let step = 0; step < 800; step++) {
        if (nodes.length && random() < 0.25) {
          const victim = nodes[Math.floor(random() * nodes.length)];
          index.remove(victim.id);
          nodes = nodes.filter((node) => node.id !== victim.id);
        } else {
          const large = random() < 0.1;
          const width = large ? 1000 + random() * 2000 : 10 + random() * 120;
          const height = large ? 1000 + random() * 2000 : 10 + random() * 120;
          const node = makeNode(`r:${String(counter++).padStart(4, "0")}`, random() * 2000 - 1000, random() * 2000 - 1000, width, height);
          index.insert(node);
          nodes = [...nodes, node];
        }
        expect(index.size()).toBe(nodes.length);
      }

      const queryBounds = (): CanvasSceneBounds => {
        const x = random() * 2400 - 1200, y = random() * 2400 - 1200;
        return { x, y, width: random() * 1500, height: random() * 1500 };
      };
      for (let attempt = 0; attempt < 60; attempt++) {
        const bounds = queryBounds();
        expect(index.query(bounds).map((node) => node.id), `range query ${attempt} seed ${seed}`).toEqual(bruteQuery(nodes, bounds));
      }
      for (let attempt = 0; attempt < 60; attempt++) {
        const point = { x: random() * 2400 - 1200, y: random() * 2400 - 1200 };
        const limit = 1 + Math.floor(random() * 10);
        const maxDistance = random() < 0.3 ? random() * 500 : Number.POSITIVE_INFINITY;
        const actual = index.nearest(point, limit, maxDistance).map((item) => ({ id: item.node.id, distance: item.distance }));
        expect(actual, `nearest ${attempt} seed ${seed}`).toEqual(bruteNearest(nodes, point, limit, maxDistance));
      }
    });
  }
});

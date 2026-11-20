import { describe, expect, it } from "vitest";
import type { CanvasShapeContext } from "../src/canvas/ai/canvas-context.js";
import type { ScientificObject } from "../src/canvas/model.js";
import { buildCanvasChunks } from "../server/canvas-reasoning/chunks.js";

function shape(id: string, x: number, y: number, w = 10, h = 10, extra: Partial<CanvasShapeContext> = {}): CanvasShapeContext {
  return { id, type: "geo", position: { x, y, rotation: 0, z: 0 }, bounds: { x, y, w, h }, ...extra };
}

function arrowShape(id: string, from: { x: number; y: number }, to: { x: number; y: number }): CanvasShapeContext {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  return shape(id, x, y, Math.abs(to.x - from.x), Math.abs(to.y - from.y), { type: "arrow", arrow: { from, to, bend: 0 } });
}

function atom(id: string, x: number, y: number, label: string): ScientificObject {
  return { id, kind: "atom", x, y, width: 40, height: 40, element: "H", nonbondingElectrons: 0, bondOrderSum: 1, label };
}

function detailCount(chunk: { detail: string }): number {
  try {
    const parsed: unknown = JSON.parse(chunk.detail);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

describe("buildCanvasChunks", () => {
  it("groups two spatial clusters into two chunks with the correct sources", () => {
    const shapes = [shape("a1", 0, 0), shape("a2", 20, 0), shape("a3", 40, 0), shape("b1", 300, 0), shape("b2", 320, 0), shape("b3", 340, 0)];

    const chunks = buildCanvasChunks({ shapes, objects: [], question: "", selectedIds: [] });

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => [...chunk.sourceIds].sort())).toEqual([["a1", "a2", "a3"], ["b1", "b2", "b3"]]);
  });

  it("lists a connecting arrow as a candidate in both chunks exactly once", () => {
    const big = shape("a1", 0, 0, 300, 40);
    const far = shape("b1", 341, 0, 10, 10);
    const arrow = arrowShape("arrow-1", { x: 100, y: 10 }, { x: 345, y: 10 });

    const chunks = buildCanvasChunks({ shapes: [big, far, arrow], objects: [], question: "", selectedIds: [] });

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk.sourceIds.filter((id) => id === "arrow-1")).toHaveLength(1);
      expect(chunk.sourceIds).toContain("arrow-1");
    }
  });

  it("ranks the chunk whose labels match the question", () => {
    const left = shape("left-1", 0, 0, 40, 40);
    const right = shape("right-1", 400, 0, 40, 40, { type: "text", text: "molecule" });
    const hydrogen = atom("h-1", 445, 0, "H");

    const chunks = buildCanvasChunks({ shapes: [left, right], objects: [hydrogen], question: "What molecule is drawn, and which H atoms are shown?", selectedIds: [] });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].sourceIds).toContain("right-1");
    expect(chunks[0].sourceIds).toContain("h-1");
    expect(chunks[0].labels.join(" ").toLowerCase()).toContain("molecule");
  });

  it("moves the matching region earlier for directional cues", () => {
    const left = shape("left-1", 0, 0, 40, 40);
    const right = shape("right-1", 400, 0, 40, 40);

    const chunks = buildCanvasChunks({ shapes: [left, right], objects: [], question: "On the left side, what is drawn?", selectedIds: [] });

    expect(chunks[0].sourceIds).toContain("left-1");
  });

  it("merges more than six clusters down to six chunks", () => {
    const shapes = Array.from({ length: 8 }, (_, index) => shape(`s-${index}`, index * 200, 0, 20, 20));

    const chunks = buildCanvasChunks({ shapes, objects: [], question: "", selectedIds: [] });

    expect(chunks).toHaveLength(6);
    expect(chunks.reduce((total, chunk) => total + detailCount(chunk), 0)).toBe(8);
  });

  it("splits a single cluster of more than forty shapes", () => {
    const shapes = Array.from({ length: 60 }, (_, index) => shape(`s-${index}`, (index % 10) * 12, Math.floor(index / 10) * 12, 10, 10));

    const chunks = buildCanvasChunks({ shapes, objects: [], question: "", selectedIds: [] });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(detailCount(chunk)).toBeLessThanOrEqual(40);
  });

  it("is deterministic for the same input", () => {
    const shapes = [shape("a1", 0, 0), shape("a2", 20, 0), shape("b1", 300, 0)];
    const input = { shapes, objects: [], question: "What is on the right?", selectedIds: [] };

    expect(buildCanvasChunks(input)).toEqual(buildCanvasChunks(input));
  });
});

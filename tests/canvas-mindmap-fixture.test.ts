import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { buildCanvasSceneGraph } from "../server/canvas-intelligence/scene/build.js";
import { createObject, emptyCanvasDocument, parseCanvasDocument, type MindmapNode } from "../src/canvas/model.js";
import { applyCanvasObjectProposal, proposeCanvasObject } from "../src/canvas/tutor.js";

type MindmapObject = Extract<ReturnType<typeof createObject>, { kind: "mindmap" }>;
const starter = (): MindmapObject => {
  const object = createObject("mindmap", 0, 0);
  if (object.kind !== "mindmap") throw new Error("mindmap kind is missing");
  return object;
};
const board = (object: unknown) => ({ version: 1, snapshot: emptyCanvasDocument().snapshot, objects: [object] });

describe("mindmap scientific object", () => {
  it("round-trips a mind map board and still parses a version-1 board without one", () => {
    const parsed = parseCanvasDocument(JSON.parse(readFileSync("tests/fixtures/mindmap-board.json", "utf8")));
    const map = parsed.objects.find((object) => object.kind === "mindmap");
    if (!map || map.kind !== "mindmap") throw new Error("fixture mindmap missing");
    expect(map.title).toBe("Photosynthesis");
    expect(map.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(["Photosynthesis", "Light reaction", "Calvin cycle"]));
    expect(map.nodes).toHaveLength(3);
    expect(map.edges).toHaveLength(2);
    expect(parseCanvasDocument({ version: 1, snapshot: emptyCanvasDocument().snapshot, objects: [] }).objects).toEqual([]);
    expect(parseCanvasDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("rejects malformed mind maps", () => {
    const base = starter();
    const badEdge: MindmapObject = { ...base, edges: [{ from: base.nodes[0].id, to: "missing" }] };
    expect(() => parseCanvasDocument(board(badEdge))).toThrow();
    const selfEdge: MindmapObject = { ...base, edges: [{ from: base.nodes[0].id, to: base.nodes[0].id }] };
    expect(() => parseCanvasDocument(board(selfEdge))).toThrow();
    const extra: MindmapNode[] = Array.from({ length: 11 }, (_unused, index) => ({ id: `x${index}`, label: `node ${index}`, x: 0, y: 0 }));
    const overCap: MindmapObject = { ...base, nodes: [...base.nodes, ...extra], edges: [] };
    expect(overCap.nodes.length).toBe(14);
    expect(() => parseCanvasDocument(board(overCap))).toThrow();
    const nonFinite: MindmapObject = { ...base, nodes: [{ id: "n0", label: "ok", x: Number.NaN, y: 0 }, ...base.nodes.slice(1)], edges: [] };
    expect(() => parseCanvasDocument(board(nonFinite))).toThrow();
    const badLabel: MindmapObject = { ...base, nodes: [{ id: "n0", label: "z".repeat(121), x: 0, y: 0 }, ...base.nodes.slice(1)], edges: [] };
    expect(() => parseCanvasDocument(board(badLabel))).toThrow();
  });

  it("maps mind maps into the scene graph with title and labels", () => {

    const object = starter();
    const input = normalizeCanvasInput({ boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", snapshot: emptyCanvasDocument().snapshot, scientificObjects: [object], selectedIds: [] });
    const graph = buildCanvasSceneGraph({ input, scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 1, revisionHash: "rev", snapshotHash: "snap", builtAt: "2026-11-22T20:00:00.000Z" });
    const node = graph.nodes.find((candidate) => candidate.id === `s:${object.id}`);
    expect(node).toBeTruthy();
    expect(node!.recordType).toBe("mindmap");
    expect(node!.kind).toBe("scientific-object");
    expect(node!.text).toContain("New mind map");
    expect(node!.text).toContain(object.nodes[1].label);
  });

  it("accepts a mind map through the existing object-proposal path", () => {
    const context = { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", revision: 3, objects: [] };
    const nodes: MindmapNode[] = [
      { id: "r", label: "Fractions", x: 0, y: 0 },
      { id: "a", label: "Numerator", x: -140, y: 80 },
      { id: "b", label: "Denominator", x: 140, y: 80 },
      { id: "c", label: "Improper", x: 0, y: 170 },
    ];
    const proposal = proposeCanvasObject(context, { boardId: "board-1", kind: "mindmap", x: 240, y: 220, fieldsJson: JSON.stringify({ title: "Fractions", nodes, edges: [{ from: "r", to: "a" }, { from: "r", to: "b" }, { from: "a", to: "c" }] }), reason: "Organise the fraction vocabulary the student asked about." });
    if (proposal.object.kind !== "mindmap") throw new Error("proposal lost the mindmap kind");
    expect(proposal.object.title).toBe("Fractions");
    expect(proposal.object.nodes).toHaveLength(4);
    const next = applyCanvasObjectProposal({ ...context, objects: [] }, proposal);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ kind: "mindmap", title: "Fractions" });
  });
});

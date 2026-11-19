import { describe, expect, it } from "vitest";
import { CanvasSceneGraphSchema, type CanvasSceneGraph } from "../src/canvas/spatial/types.js";
import { mergeInkEvidence } from "../server/canvas-intelligence/scene/ink.js";

function graphWithConfirmedLabel(): CanvasSceneGraph {
  return CanvasSceneGraphSchema.parse({
    schemaVersion: 1,
    scope: { boardId: "board", courseId: "course", lessonId: "lesson" },
    revision: 2,
    revisionHash: "rev-2",
    snapshotHash: "snap-2",
    builderVersion: "test",
    builtAt: "2026-11-19T00:00:00.000Z",
    nodes: [
      {
        id: "g:a", kind: "stroke-group", ref: { scope: "scene", id: "g:a" },
        bounds: { x: 0, y: 0, width: 20, height: 20 }, boundsBasis: "source-union",
        text: null, recordType: "stroke-group", origin: "geometry",
        verificationStatus: "derived", confidence: 1, sourceRefs: [{ scope: "quickdraw", id: "s1" }],
        geometry: null, uncertaintyReasons: [],
      },
      {
        id: "u:a", kind: "recognition-candidate", ref: { scope: "scene", id: "u:a" },
        bounds: { x: 0, y: 0, width: 20, height: 20 }, boundsBasis: "derived",
        text: "F", recordType: "user-label", origin: "user",
        verificationStatus: "confirmed", confidence: null, sourceRefs: [{ scope: "quickdraw", id: "s1" }],
        geometry: null, uncertaintyReasons: [],
      },
    ],
    edges: [{
      id: "e:1", kind: "recognizes", from: "u:a", to: "g:a", origin: "user",
      verificationStatus: "confirmed", basis: "recognition", distance: null,
      confidence: null, sourceRefs: [{ scope: "quickdraw", id: "s1" }], uncertaintyReasons: [],
    }],
    warnings: [],
    truncated: false,
  });
}

describe("canvas ink evidence", () => {
  it("never replaces a confirmed label and is idempotent", () => {
    const graph = graphWithConfirmedLabel();
    const evidence = [{ groupId: "g:a", text: "P", format: "text" as const, confidence: 0.8, source: "ocr" as const, confirmed: false }];
    const once = mergeInkEvidence(graph, evidence);
    const twice = mergeInkEvidence(once, evidence);
    expect(twice.nodes.filter((node) => node.text === "P")).toHaveLength(1);
    expect(twice.nodes.find((node) => node.text === "P")?.uncertaintyReasons.join(" ")).toMatch(/conflict/i);
    expect(twice.nodes.find((node) => node.text === "F")?.verificationStatus).toBe("confirmed");
    expect(twice.nodes.length).toBe(once.nodes.length);
    expect(twice.edges.some((edge) => edge.kind === "recognizes" && edge.from.startsWith("o:"))).toBe(true);
  });

  it("adds an unconfirmed node with the group bounds and source refs", () => {
    const merged = mergeInkEvidence(graphWithConfirmedLabel(), [
      { groupId: "g:a", text: "\\frac{1}{2}", format: "latex", confidence: 0.71, source: "ocr", confirmed: false },
    ]);
    const node = merged.nodes.find((candidate) => candidate.text === "\\frac{1}{2}");
    expect(node?.kind).toBe("ocr-item");
    expect(node?.verificationStatus).toBe("unconfirmed");
    expect(node?.bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(node?.sourceRefs).toEqual([{ scope: "quickdraw", id: "s1" }]);
  });
});

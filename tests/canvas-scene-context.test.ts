import { describe, expect, it } from "vitest";
import { buildCanvasSceneAIContext } from "../src/canvas/ai/scene-context.js";
import { CanvasSceneGraphSchema, type CanvasSceneGraph } from "../src/canvas/spatial/types.js";

function graph(): CanvasSceneGraph {
  const nodes = Array.from({ length: 30 }, (_, index) => ({
    id: `q:${index}`,
    kind: "native-object" as const,
    ref: { scope: "quickdraw" as const, id: `${index}` },
    bounds: { x: index, y: index, width: 10, height: 10 },
    boundsBasis: "source" as const,
    text: index === 0 ? "force F and spring" : null,
    recordType: "text",
    origin: "quickdraw" as const,
    verificationStatus: "source" as const,
    confidence: 1,
    sourceRefs: [],
    geometry: null,
    uncertaintyReasons: [],
  }));
  return CanvasSceneGraphSchema.parse({
    schemaVersion: 1,
    scope: { boardId: "board", courseId: "course", lessonId: "lesson" },
    revision: 4,
    revisionHash: "rev-4",
    snapshotHash: "snap-4",
    builderVersion: "test",
    builtAt: "2026-11-18T20:00:00.000Z",
    nodes,
    edges: [],
    warnings: [],
    truncated: false,
  });
}

function graphWithOcrConflict(): CanvasSceneGraph {
  const base = graph();
  return CanvasSceneGraphSchema.parse({
    ...base,
    nodes: [
      ...base.nodes.slice(0, 2),
      {
        id: "g:abc", kind: "stroke-group", ref: { scope: "scene", id: "g:abc" },
        bounds: { x: 0, y: 0, width: 20, height: 20 }, boundsBasis: "source-union",
        text: null, recordType: "stroke-group", origin: "geometry",
        verificationStatus: "derived", confidence: 1, sourceRefs: [],
        geometry: null, uncertaintyReasons: [],
      },
      {
        id: "o:1", kind: "ocr-item", ref: { scope: "scene", id: "o:1" },
        bounds: { x: 0, y: 0, width: 20, height: 20 }, boundsBasis: "region",
        text: "P", recordType: "text", origin: "ocr",
        verificationStatus: "unconfirmed", confidence: 0.62, sourceRefs: [],
        geometry: null, uncertaintyReasons: ["Conflicts with confirmed label."],
      },
    ],
    edges: [{
      id: "e:1", kind: "recognizes", from: "o:1", to: "g:abc", origin: "ocr",
      verificationStatus: "unconfirmed", basis: "ocr-region", distance: null,
      confidence: 0.62, sourceRefs: [], uncertaintyReasons: [],
    }],
  });
}

function graphWithoutEvidence(): CanvasSceneGraph {
  const base = graph();
  return CanvasSceneGraphSchema.parse({ ...base, nodes: [base.nodes[0]], edges: [] });
}

describe("canvas scene AI context", () => {
  it("keeps evidence and uncertainty, not just labels", () => {
    const context = buildCanvasSceneAIContext(graphWithOcrConflict());
    const ocr = context.nodes.find((node) => node.kind === "ocr-item");
    expect(ocr?.verificationStatus).toBe("unconfirmed");
    expect(ocr?.confidence).toBe(0.62);
    expect(ocr?.uncertaintyReasons.join(" ")).toMatch(/conflict/i);
    expect(context.edges.some((edge) => edge.kind === "recognizes" && edge.to.startsWith("g:"))).toBe(true);
  });

  it("still returns source nodes when no model evidence exists", () => {
    const context = buildCanvasSceneAIContext(graphWithoutEvidence());
    expect(context.nodes.some((node) => node.kind === "native-object")).toBe(true);
    expect(context.truncated).toBe(false);
  });

  it("bounds node count, text, and total characters", () => {
    const context = buildCanvasSceneAIContext(graph(), { maxNodes: 5, maxChars: 1200 });
    expect(context.nodes.length).toBeLessThanOrEqual(5);
    expect(context.truncated).toBe(true);
    expect(context.nodeCounts["native-object"]).toBe(30);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(1200);
    expect(context.nodes[0].text).toBe("force F and spring");
  });
});

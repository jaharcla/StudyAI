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

describe("canvas scene AI context", () => {
  it("bounds node count, text, and total characters", () => {
    const context = buildCanvasSceneAIContext(graph(), { maxNodes: 5, maxChars: 1200 });
    expect(context.nodes).toHaveLength(5);
    expect(context.truncated).toBe(true);
    expect(context.nodeCounts["native-object"]).toBe(30);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(1200);
    expect(context.nodes[0].text).toBe("force F and spring");
  });
});

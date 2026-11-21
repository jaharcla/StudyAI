import { describe, expect, it } from "vitest";
import { boundedSceneSlice, describeCanvas, readCanvasInkSchema, requestCanvasInk, requestCanvasScene, resetCanvasSceneCacheForTests, searchCanvasEvidence, searchCourseCanvasEvidence } from "../src/canvas/ai/scene-tools.js";
import { CanvasSceneGraphSchema, type CanvasSceneGraph } from "../src/canvas/spatial/types.js";

const graph: CanvasSceneGraph = CanvasSceneGraphSchema.parse({
  schemaVersion: 1,
  scope: { boardId: "board", courseId: "course", lessonId: "lesson" },
  revision: 2,
  revisionHash: "rev-2",
  snapshotHash: "snap-2",
  builderVersion: "test",
  builtAt: "2026-11-18T20:00:00.000Z",
  nodes: [
    { id: "q:a", kind: "stroke", ref: { scope: "quickdraw", id: "a" }, bounds: { x: 0, y: 0, width: 10, height: 10 }, boundsBasis: "source", text: null, recordType: "draw", origin: "quickdraw", verificationStatus: "source", confidence: 1, sourceRefs: [], geometry: null, uncertaintyReasons: [] },
    { id: "s:b", kind: "scientific-object", ref: { scope: "science", id: "b" }, bounds: { x: 20, y: 0, width: 10, height: 10 }, boundsBasis: "source", text: "force", recordType: "concept", origin: "science", verificationStatus: "source", confidence: 1, sourceRefs: [], geometry: null, uncertaintyReasons: [] },
  ],
  edges: [{ id: "e:1", kind: "near", from: "q:a", to: "s:b", origin: "geometry", verificationStatus: "derived", basis: "bounds", distance: 10, confidence: 1, sourceRefs: [], uncertaintyReasons: [] }],
  warnings: [],
  truncated: false,
});

describe("canvas scene tools", () => {
  it("describes a scene in plain text and reports reader-check warnings", () => {
    const described = describeCanvas(graph);
    expect(described.boardId).toBe("board");
    expect(described.objectCount).toBe(2);
    expect(described.lines.join("\n")).toContain("force");
    expect(described.warnings).toEqual([]);
    const overlapping = {
      ...graph,
      edges: [...graph.edges, { ...graph.edges[0], id: "e:overlap", kind: "overlaps" as const }],
    };
    const warnings = describeCanvas(overlapping, { x: 0, y: 0, w: 15, h: 15 }).warnings;
    expect(warnings.some((warning) => /overlap/i.test(warning))).toBe(true);
    expect(warnings.some((warning) => /outside/i.test(warning))).toBe(true);
  });

  it("builds, caches, and slices the scene", async () => {
    resetCanvasSceneCacheForTests();
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return Response.json({ scene: graph, indexStatus: "indexed", warnings: [] });
    }) as typeof fetch;
    const first = await requestCanvasScene({ boardId: "board", courseId: "course", lessonId: "lesson", revision: 2 }, fetcher);
    const second = await requestCanvasScene({ boardId: "board", courseId: "course", lessonId: "lesson", revision: 2 }, fetcher);
    expect(first.revisionHash).toBe("rev-2");
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(boundedSceneSlice(first, { maxNodes: 1 }).nodes).toHaveLength(1);
    expect(boundedSceneSlice(first, { nodeKinds: ["scientific-object"] }).nodes.map((node) => node.id)).toEqual(["s:b"]);
  });

  it("searches the current revision and returns incident edges", async () => {
    resetCanvasSceneCacheForTests();
    const fetcher = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/scene")) return Response.json({ scene: graph, indexStatus: "indexed", warnings: [] });
      return Response.json({ nodes: [graph.nodes[1]], edges: graph.edges, warnings: [], truncated: false });
    }) as typeof fetch;
    const result = await searchCanvasEvidence({ boardId: "board", courseId: "course", lessonId: "lesson", revision: 2 }, "force", 5, fetcher);
    expect(result.revisionHash).toBe("rev-2");
    expect(result.nodes.map((node) => node.id)).toEqual(["s:b"]);
    expect(result.edges).toHaveLength(1);
  });

  it("searches the current course across boards without building a scene", async () => {
    const hits = [{ boardId: "board", revisionHash: "rev-2", revision: 2, node: graph.nodes[1], edges: graph.edges }];
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return Response.json({ hits, warnings: [], truncated: false });
    }) as typeof fetch;
    const result = await searchCourseCanvasEvidence({ courseId: "course" }, "force", 5, fetcher);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/courses/course/canvas-scene/query");
    expect(requests[0].body).toMatchObject({ courseId: "course", query: "force", limit: 5 });
    expect(result.hits.map((hit) => hit.boardId)).toEqual(["board"]);
    expect(result.hits[0].node.id).toBe("s:b");

    await searchCourseCanvasEvidence({ courseId: "course", lessonId: "lesson" }, "force", 5, fetcher);
    expect(requests[1].body).toMatchObject({ courseId: "course", lessonId: "lesson", query: "force" });
  });

  it("posts only the requested groups and surfaces a stale revision", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return Response.json({ revisionHash: "rev-2", items: [], warnings: [] });
    }) as typeof fetch;
    const result = await requestCanvasInk(
      { boardId: "board", courseId: "course", lessonId: "lesson", revision: 2 },
      { groupIds: ["g:abc"], profile: "math" },
      fetcher,
    );
    expect(requests[0].url).toBe("/api/canvases/board/ink");
    expect(requests[0].body).toMatchObject({ courseId: "course", lessonId: "lesson", expectedRevision: 2, groupIds: ["g:abc"], profile: "math" });
    expect(result.revisionHash).toBe("rev-2");

    const stale = (async () => Response.json({ error: "stale_revision" }, { status: 409 })) as typeof fetch;
    await expect(requestCanvasInk(
      { boardId: "board", courseId: "course", lessonId: "lesson", revision: 2 },
      { groupIds: ["g:abc"] },
      stale,
    )).rejects.toThrow(/stale/i);
  });
});

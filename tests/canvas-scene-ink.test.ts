import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasSceneGraphSchema, type CanvasSceneGraph } from "../src/canvas/spatial/types.js";
import { mergeInkEvidence } from "../server/canvas-intelligence/scene/ink.js";
import { buildCanvasScene } from "../server/canvas-intelligence/scene/service.js";
import { readCanvasInk } from "../server/canvas-intelligence/scene/ink-service.js";
import { loadCanvasSceneGraph } from "../server/canvas-intelligence/scene/store.js";
import { OCRResultSchema } from "../server/canvas-intelligence/types.js";

afterEach(() => vi.unstubAllEnvs());

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

  it("reads only requested freehand groups, rejects stale reads, and writes evidence", async () => {
    vi.stubEnv("CANVAS_SCENE_RECOGNITION", "off");
    const snapshot = {
      document: {
        store: {
          d1: { id: "d1", typeName: "shape", type: "draw", x: 10, y: 10, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5, 0, 40, 0.5], size: "m" } },
          t1: { id: "t1", typeName: "shape", type: "text", x: 70, y: 20, rot: 0, z: 2, props: { text: "force F", size: "m", scale: 1 } },
        },
      },
    };
    const document = { version: 1, snapshot, objects: [] };
    const db = new Database(":memory:");
    db.exec("CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT)");
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run("board-1", "course-1", "lesson-1", 3, JSON.stringify(document));
    const built = await buildCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3 });
    const group = built.scene.nodes.find((node) => node.kind === "stroke-group")!;
    let calls = 0;
    const ocr = async () => {
      calls++;
      return OCRResultSchema.parse({ items: [{ text: "x=1", kind: "equation", confidence: 0.7, alternatives: [], sourceIds: ["d1"], imageRegion: null }], uncertain: true, raw: "x=1" });
    };

    const result = await readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3, groupIds: [group.id] }, { ocr });
    expect(calls).toBe(1);
    expect(result.items).toEqual([{ groupId: group.id, text: "x=1", format: "text", confidence: 0.7, source: "ocr", confirmed: false }]);
    expect(result.warnings).toEqual([]);
    const saved = loadCanvasSceneGraph(db, "board-1", built.scene.revisionHash)!;
    expect(saved.nodes.some((node) => node.kind === "ocr-item" && node.text === "x=1")).toBe(true);

    const again = await readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3, groupIds: [group.id] }, { ocr });
    expect(calls).toBe(1);
    expect(again.items).toEqual(result.items);

    const typed = await readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3, groupIds: ["q:t1"] }, { ocr });
    expect(calls).toBe(1);
    expect(typed.warnings.join(" ")).toMatch(/not a freehand group/i);

    const unknown = await readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3, groupIds: ["g:nope"] }, { ocr });
    expect(unknown.warnings.join(" ")).toMatch(/not a freehand group/i);

    await expect(readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 2, groupIds: [group.id] }, { ocr }))
      .rejects.toMatchObject({ code: "stale_revision" });
    db.close();
  });
});

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { CanvasEvidenceBundleSchema, SelectedCanvasContextSchema } from "../server/canvas-intelligence/evidence.js";
import { createCanvasAnalysisResult } from "../server/canvas-analysis/contract.js";
import { buildCanvasSceneGraph } from "../server/canvas-intelligence/scene/build.js";
import { recognizeCanvasStrokes } from "../server/canvas-intelligence/recognition/index.js";
import { initializeCanvasSceneSchema, loadCanvasSceneGraph, saveCanvasSceneGraph, searchCanvasScene } from "../server/canvas-intelligence/scene/store.js";
import { buildCanvasScene, CanvasSceneError, queryCanvasScene, queryCourseCanvasScene } from "../server/canvas-intelligence/scene/service.js";
import { readCanvasInk } from "../server/canvas-intelligence/scene/ink-service.js";
import { createCanvasSpatialIndex } from "../src/canvas/spatial/index.js";
import { CanvasSceneGraphSchema } from "../src/canvas/spatial/types.js";

const snapshot = { document: { store: {
  d1: { id: "d1", typeName: "shape", type: "draw", x: 10, y: 10, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5], size: "m" } },
  t1: { id: "t1", typeName: "shape", type: "text", x: 70, y: 20, rot: 0, z: 2, props: { text: "force F", size: "m", scale: 1 } },
} } };
const objects = [{ id: "c1", kind: "concept", x: 140, y: 20, width: 220, height: 110, title: "Newton's second law", definition: "Force equals mass times acceleration." }];
const document = { version: 1, snapshot, objects };

function input() {
  return normalizeCanvasInput({ boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", snapshot, scientificObjects: objects, selectedIds: [] });
}

describe("canvas scene graph", () => {
  it("builds deterministic source-linked nodes and contains edges", () => {
    const graph = buildCanvasSceneGraph({ input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z" });
    expect(CanvasSceneGraphSchema.parse(graph)).toEqual(graph);
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["q:d1", "q:t1", "s:c1"]));
    expect(graph.nodes.find((node) => node.id === "q:d1")?.kind).toBe("stroke");
    expect(graph.nodes.find((node) => node.id === "q:t1")?.text).toBe("force F");
    const group = graph.nodes.find((node) => node.kind === "stroke-group")!;
    expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "contains", from: group.id, to: "q:d1" }));
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
    const second = buildCanvasSceneGraph({ input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z" });
    expect(second).toEqual(graph);
  });

  it("inserts, queries, and finds nearest scene nodes", () => {
    const graph = buildCanvasSceneGraph({ input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z" });
    const index = createCanvasSpatialIndex({ linearThreshold: 1 });
    for (const node of graph.nodes) index.insert(node);
    expect(index.query({ x: 0, y: 0, width: 50, height: 50 }).map((node) => node.id)).toContain("q:d1");
    expect(index.nearest({ x: 20, y: 20 }, 2).map((item) => item.node.id)).toContain("q:d1");
  });

  it("adds recognition candidates and analysis evidence as unconfirmed nodes", async () => {
    const recognition = await recognizeCanvasStrokes(input(), { mode: "baseline" });
    const analysis = {
      observedEvidence: { items: [{ id: "ev:1", origin: "ocr", kind: "label", text: "force", sourceRefs: [{ scope: "quickdraw", id: "t1" }], worldRegion: { x: 70, y: 20, width: 50, height: 20 }, confidence: 0.8, uncertaintyReasons: ["OCR is uncalibrated."] }] },
      inferredInterpretations: { evidence: [] },
    };
    const graph = buildCanvasSceneGraph({ input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z", recognition, analysis });
    const candidate = graph.nodes.find((node) => node.kind === "recognition-candidate");
    expect(candidate).toBeTruthy();
    expect(candidate!.verificationStatus).toBe("unconfirmed");
    expect(graph.edges.some((edge) => edge.kind === "recognizes" && edge.from === candidate!.id)).toBe(true);
    const ocr = graph.nodes.find((node) => node.id === "o:ev:1");
    expect(ocr).toMatchObject({ kind: "ocr-item", origin: "ocr", verificationStatus: "unconfirmed", text: "force" });
    expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "derived-from", from: "o:ev:1", to: "q:t1" }));
  });

  it("applies user feedback to recognition candidates", () => {
    const groupKey = "d1";
    const stage = {
      mode: "baseline" as const,
      adapterId: "baseline-geometry",
      adapterVersion: "1",
      results: [{ groupId: "group-d1", sourceIds: ["d1"], bounds: { x: 10, y: 10, width: 40, height: 40 }, candidates: [{ label: "line", kind: "symbol" as const, confidence: 0.67, alternatives: [] }], uncertain: true, uncertaintyReasons: ["Geometry-only symbol candidate."] }],
      warnings: [],
      latencyMs: 1,
      groupsConsidered: 1,
      groupsRecognized: 1,
    };
    const build = (feedback?: Map<string, { groupKey: string; decision: "accept" | "reject" | "correct"; label: string | null; sourceIds: string[] }>) => buildCanvasSceneGraph({
      input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash",
      builtAt: "2026-11-18T20:00:00.000Z", recognition: stage, feedback,
    });

    const accepted = build(new Map([[groupKey, { groupKey, decision: "accept", label: "line", sourceIds: ["d1"] }]]));
    const acceptedNode = accepted.nodes.find((node) => node.kind === "recognition-candidate");
    expect(acceptedNode).toMatchObject({ text: "line", origin: "user", verificationStatus: "confirmed", uncertaintyReasons: [] });
    expect(accepted.edges).toContainEqual(expect.objectContaining({ kind: "recognizes", from: acceptedNode!.id, verificationStatus: "confirmed", origin: "user" }));

    const corrected = build(new Map([[groupKey, { groupKey, decision: "correct", label: "spring", sourceIds: ["d1"] }]]));
    expect(corrected.nodes.some((node) => node.kind === "recognition-candidate" && node.text === "line")).toBe(false);
    const correctedNode = corrected.nodes.find((node) => node.kind === "recognition-candidate");
    expect(correctedNode).toMatchObject({ text: "spring", origin: "user", verificationStatus: "confirmed" });

    const rejected = build(new Map([[groupKey, { groupKey, decision: "reject", label: null, sourceIds: ["d1"] }]]));
    expect(rejected.nodes.some((node) => node.kind === "recognition-candidate")).toBe(false);
  });

  it("stores the graph and searches indexed node text", () => {
    const db = new Database(":memory:");
    initializeCanvasSceneSchema(db);
    const graph = buildCanvasSceneGraph({ input: input(), scope: { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" }, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z" });
    saveCanvasSceneGraph(db, graph);
    expect(loadCanvasSceneGraph(db, "board-1", "rev-hash")).toEqual(graph);
    const result = searchCanvasScene(db, { courseId: "course-1", lessonId: "lesson-1", boardId: "board-1", revisionHash: "rev-hash" }, "force", 5);
    expect(result.nodes.map((node) => node.id)).toContain("q:t1");
    expect(result.nodes.map((node) => node.id)).toContain("s:c1");
    db.close();
  });

  it("rejects stale builds and serves a query by revision hash", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT)");
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run("board-1", "course-1", "lesson-1", 3, JSON.stringify(document));
    const built = await buildCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3 });
    expect(built.scene.revision).toBe(3);
    await expect(buildCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 2 })).rejects.toThrow(CanvasSceneError);
    const query = queryCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", revisionHash: built.scene.revisionHash, query: "force", limit: 5 });
    expect(query.nodes.length).toBeGreaterThan(0);
    db.close();
  });

  it("hashes the persisted revision when a vector geometry omits its scale", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT)");
    const vectorDocument = {
      version: 1,
      snapshot,
      objects: [{ id: "v1", kind: "vector", x: 10, y: 20, width: 120, height: 60, components: [120, 60, 0], units: "", label: "Vector", geometry: { tail: { x: 10, y: 20 }, tip: { x: 130, y: -40 } } }],
    };
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)").run("board-1", "course-1", "lesson-1", 2, JSON.stringify(vectorDocument));
    const built = await buildCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 2 });
    expect(built.scene.revision).toBe(2);
    const vector = built.scene.nodes.find((node) => node.id === "s:v1");
    expect(vector?.text).toBe("Vector — components [120, 60, 0]");
    const ink = await readCanvasInk(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 2, groupIds: ["missing"] });
    expect(ink.items).toEqual([]);
    expect(ink.warnings).toEqual(["missing is not a freehand group."]);
    db.close();
  });

  it("maps a validated CanvasAnalysisResult into OCR and model nodes", async () => {
    const canvasInput = input();
    const scope = { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1" };
    const revisionHash = canvasInput.revision;
    const evidence = CanvasEvidenceBundleSchema.parse({
      schemaVersion: 1,
      scope: { ...scope, revisionHash },
      evidence: [
        { id: "ev:native", revisionHash, origin: "native", kind: "label", subjectId: "t1", claimKey: null, claimValue: null, text: "force F", sourceIds: ["t1"], sourceRefs: [{ scope: "quickdraw", id: "t1" }], confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] },
        { id: "ev:ocr", revisionHash, origin: "ocr", kind: "label", subjectId: null, claimKey: null, claimValue: null, text: "force F", sourceIds: ["t1"], sourceRefs: [{ scope: "quickdraw", id: "t1" }], worldRegion: { x: 70, y: 20, width: 50, height: 20 }, confidence: 0.8, locationPrecision: "region", uncertain: true, uncertaintyReasons: ["OCR is uncalibrated."] },
        { id: "ev:model", revisionHash, origin: "model", kind: "observation", subjectId: null, claimKey: null, claimValue: null, text: "The label names a force.", sourceIds: ["t1"], sourceRefs: [{ scope: "quickdraw", id: "t1" }], worldRegion: { x: 70, y: 20, width: 50, height: 20 }, confidence: 0.6, locationPrecision: "region", uncertain: true, uncertaintyReasons: ["Model observation."] },
      ],
      conflicts: [],
      warnings: [],
    });
    const selectedContext = SelectedCanvasContextSchema.parse({
      schemaVersion: 1,
      scope: { ...scope, revisionHash },
      evidence: evidence.evidence,
      sourceRecords: canvasInput.nativeRecords.map(({ id, type, bounds, geometry, text }) => ({ id, type, ...(bounds ? { bounds } : {}), ...(geometry ? { geometry } : {}), ...(text !== undefined ? { text } : {}) })),
      scientificObjects: canvasInput.scientificObjects,
      conflicts: [],
      warnings: [],
      excludedEvidenceCount: 0,
      excludedSourceCount: 0,
      truncated: false,
    });
    const provenance = [
      { id: "p-canvas", stage: "canvas", provider: "quickdraw", method: "persisted snapshot", model: null, createdAt: "2026-11-18T20:00:00.000Z" },
      { id: "p-ocr", stage: "ocr", provider: "system", method: "fixture OCR", model: null, createdAt: "2026-11-18T20:00:00.000Z" },
      { id: "p-structure", stage: "structure", provider: "system", method: "fixture structure", model: null, createdAt: "2026-11-18T20:00:00.000Z" },
    ];
    const analysis = createCanvasAnalysisResult({
      board: { ...scope, revision: 3, document },
      canvasInput,
      evidence,
      selectedContext,
      pipelineResult: { schemaVersion: 1, fixtureId: "scene-fixture", pipelineId: "P1", pipelineVersion: "canvas-fusion/1.0.0", status: "complete", objects: [], relationships: [], interpretations: [], provenance, uncertainties: [], errors: [] },
    });

    const graph = buildCanvasSceneGraph({ input: canvasInput, scope, revision: 3, revisionHash: "rev-hash", snapshotHash: "snap-hash", builtAt: "2026-11-18T20:00:00.000Z", analysis });
    const ocrNode = graph.nodes.find((node) => node.id === "o:ev:ocr");
    expect(ocrNode).toMatchObject({ kind: "ocr-item", origin: "ocr", verificationStatus: "unconfirmed", text: "force F", bounds: { x: 70, y: 20, width: 50, height: 20 } });
    expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "derived-from", from: "o:ev:ocr", to: "q:t1", verificationStatus: "unconfirmed" }));
    const modelNode = graph.nodes.find((node) => node.id === "m:ev:model");
    expect(modelNode).toMatchObject({ kind: "model-observation", origin: "model", verificationStatus: "unconfirmed", text: "The label names a force." });
    expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "derived-from", from: "m:ev:model", to: "q:t1", verificationStatus: "unconfirmed" }));
    expect(graph.nodes.some((node) => node.id === "o:ev:native")).toBe(false);
  });

  it("searches every current board in a course and excludes stale revisions", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,revision INTEGER,document TEXT)");
    const insert = db.prepare("INSERT INTO canvases(id,course_id,lesson_id,revision,document) VALUES(?,?,?,?,?)");
    insert.run("board-1", "course-1", "lesson-1", 3, JSON.stringify(document));
    insert.run("board-2", "course-1", "lesson-2", 1, JSON.stringify(document));
    insert.run("board-3", "course-2", "lesson-9", 1, JSON.stringify(document));
    await buildCanvasScene(db, "board-1", { courseId: "course-1", lessonId: "lesson-1", expectedRevision: 3 });
    await buildCanvasScene(db, "board-2", { courseId: "course-1", lessonId: "lesson-2", expectedRevision: 1 });
    await buildCanvasScene(db, "board-3", { courseId: "course-2", lessonId: "lesson-9", expectedRevision: 1 });

    const current = queryCourseCanvasScene(db, "course-1", { courseId: "course-1", query: "force", limit: 10 });
    expect(new Set(current.hits.map((hit) => hit.boardId))).toEqual(new Set(["board-1", "board-2"]));
    expect(current.hits.every((hit) => hit.edges.every((edge) => edge.from === hit.node.id || edge.to === hit.node.id))).toBe(true);

    db.prepare("UPDATE canvases SET revision=4 WHERE id='board-1'").run();
    const afterEdit = queryCourseCanvasScene(db, "course-1", { courseId: "course-1", query: "force", limit: 10 });
    expect(new Set(afterEdit.hits.map((hit) => hit.boardId))).toEqual(new Set(["board-2"]));
    expect(new Set(afterEdit.hits.map((hit) => hit.revision))).toEqual(new Set([1]));

    const scoped = queryCourseCanvasScene(db, "course-1", { courseId: "course-1", lessonId: "lesson-2", query: "force", limit: 10 });
    expect(new Set(scoped.hits.map((hit) => hit.boardId))).toEqual(new Set(["board-2"]));

    expect(() => queryCourseCanvasScene(db, "other-course", { courseId: "course-1", query: "force" })).toThrow(CanvasSceneError);
    db.close();
  });
});

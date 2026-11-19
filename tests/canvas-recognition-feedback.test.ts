import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { initializeCanvasRecognitionFeedbackSchema, loadCanvasRecognitionFeedback, parseRecognitionFeedbackInput, recognitionGroupKey, saveCanvasRecognitionFeedback } from "../server/canvas-intelligence/recognition/feedback.js";
import { teachCanvasRecognitionFromStrokes } from "../server/canvas-intelligence/recognition/teach.js";
import { listCanvasRecognitionPrototypes } from "../server/canvas-intelligence/recognition/store.js";

vi.mock("../server/canvas-intelligence/recognition/clip.js", () => ({
  embedRecognitionImage: async () => Array.from({ length: 512 }, () => 0.01),
}));

const snapshot = { document: { store: {
  d1: { id: "d1", typeName: "shape", type: "draw", x: 10, y: 10, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 40, 0, 0.5, 40, 40, 0.5], size: "m" } },
  t1: { id: "t1", typeName: "shape", type: "text", x: 70, y: 20, rot: 0, z: 2, props: { text: "force", size: "m", scale: 1 } },
} } };
const document = { version: 1, snapshot, objects: [] };
const board = { boardId: "board-1", courseId: "course-1", lessonId: "lesson-1", document: JSON.stringify(document) };

describe("canvas recognition feedback", () => {
  it("keys groups deterministically and replaces the previous decision", () => {
    const db = new Database(":memory:");
    initializeCanvasRecognitionFeedbackSchema(db);
    expect(recognitionGroupKey(["b", "a", "b"])).toBe("a|b");
    saveCanvasRecognitionFeedback(db, { courseId: "course-1", boardId: "board-1", strokeIds: ["b", "a"], decision: "accept", label: "spring" });
    let loaded = loadCanvasRecognitionFeedback(db, "course-1", "board-1");
    expect(loaded.get("a|b")).toMatchObject({ decision: "accept", label: "spring", sourceIds: ["a", "b"] });
    saveCanvasRecognitionFeedback(db, { courseId: "course-1", boardId: "board-1", strokeIds: ["a", "b"], decision: "reject", label: null });
    loaded = loadCanvasRecognitionFeedback(db, "course-1", "board-1");
    expect(loaded.size).toBe(1);
    expect(loaded.get("a|b")).toMatchObject({ decision: "reject", label: null });
    db.close();
  });

  it("validates labels and scopes feedback decisions", () => {
    expect(() => parseRecognitionFeedbackInput({ courseId: "c", boardId: "b", strokeIds: [], decision: "accept", label: "x" })).toThrow("stroke");
    expect(() => parseRecognitionFeedbackInput({ courseId: "c", boardId: "b", strokeIds: ["a"], decision: "accept" })).toThrow("label");
    expect(() => parseRecognitionFeedbackInput({ courseId: "c", boardId: "b", strokeIds: ["a"], decision: "maybe", label: "x" })).toThrow("decision");
    expect(parseRecognitionFeedbackInput({ courseId: "c", boardId: "b", strokeIds: ["a"], decision: "reject" })).toMatchObject({ strokeIds: ["a"], decision: "reject", label: null });
  });

  it("teaches the persisted stroke group through the shared renderer", async () => {
    const db = new Database(":memory:");
    const result = await teachCanvasRecognitionFromStrokes({ db, board, strokeIds: ["d1"], label: "  Spring  " });
    expect(result).toEqual({ label: "spring", examples: 1 });
    expect((await teachCanvasRecognitionFromStrokes({ db, board, strokeIds: ["d1"], label: "spring" })).examples).toBe(2);
    expect(listCanvasRecognitionPrototypes(db, "course-1").spring).toHaveLength(2);
    await expect(teachCanvasRecognitionFromStrokes({ db, board, strokeIds: ["missing"], label: "spring" })).rejects.toThrow("Unknown canvas stroke");
    await expect(teachCanvasRecognitionFromStrokes({ db, board, strokeIds: ["t1"], label: "spring" })).rejects.toThrow("freehand strokes");
    await expect(teachCanvasRecognitionFromStrokes({ db, board, strokeIds: ["d1"], label: "   " })).rejects.toThrow("label");
    db.close();
  });
});

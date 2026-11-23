import { describe, expect, it } from "vitest";
import { Store, pageBounds, type ShapeRecord } from "@quickdrawjs/core";
import { approveCanvasProposal, canvasActionSchema, proposeCanvasAction } from "../src/canvas/ai/canvas-actions";
import { boardOccupancy, shapeBounds } from "../src/canvas/ai/canvas-context";
import { planLayout } from "../src/canvas/ai/layout";
import { CANVAS_DESIGN_GUIDE } from "../src/canvas/ai/scene-tools";
import { compileTeachingScene, teachingSceneSchema } from "../src/canvas/ai/teaching-scene";

const scene = {
  boardId: "board-a",
  direction: "right" as const,
  nodes: [
    { id: "browser", label: "Browser" },
    { id: "server", label: "Server" },
    { id: "cache", label: "Cache", kind: "note" as const },
  ],
  edges: [
    { from: "browser", to: "server", label: "HTTPS" },
    { from: "server", to: "cache" },
  ],
  steps: [
    { title: "Request", highlight: ["browser"] },
    { title: "Lookup", highlight: ["cache"] },
  ],
  reason: "Explain the request path",
};

const longNote: ShapeRecord = { id: "note-1", typeName: "shape", type: "note", x: 100, y: 100, rot: 0, z: 1, props: { text: "the normal force is a perpendicular contact reaction produced by microscopic deformation of both surfaces", color: "black", size: "m", font: "sans", scale: 1 } };

describe("teaching scene compiler", () => {
  it("accepts a bounded scene and rejects malformed ones", () => {
    expect(teachingSceneSchema.parse(scene)).toMatchObject({ boardId: "board-a", direction: "right" });
    expect(() => teachingSceneSchema.parse({ ...scene, nodes: [scene.nodes[0], scene.nodes[0]] })).toThrow(/unique/i);
    expect(() => teachingSceneSchema.parse({ ...scene, edges: [{ from: "browser", to: "missing" }] })).toThrow(/unknown/i);
    expect(() => teachingSceneSchema.parse({ ...scene, edges: [{ from: "browser", to: "browser" }] })).toThrow(/self/i);
    expect(() => teachingSceneSchema.parse({ ...scene, nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })) })).toThrow();
  });

  it("compiles to a valid proposal batch with deterministic non-overlapping layout", () => {
    const batch = compileTeachingScene(teachingSceneSchema.parse(scene));
    expect(() => canvasActionSchema.parse(batch)).not.toThrow();
    expect(batch.actions.filter((action) => action.kind === "createShape")).toHaveLength(3);
    expect(batch.actions.filter((action) => action.kind === "createArrow")).toHaveLength(2);
    expect(batch.actions.filter((action) => action.kind === "createText")).toHaveLength(2);
    const shapes = batch.actions.filter((action) => action.kind === "createShape");
    expect(shapes.map((action) => action.kind === "createShape" ? action.shape.id : "")).toEqual(["browser", "server", "cache"]);
    const xs = shapes.map((action) => action.kind === "createShape" ? action.shape.x : 0);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(200);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(200);
    const arrow = batch.actions.find((action) => action.kind === "createArrow");
    expect(arrow && arrow.kind === "createArrow" && Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y)).toBeGreaterThan(0);
  });

  it("emits step highlights for the shapes this batch itself creates", () => {
    // Previously these were silently dropped unless the id already existed on the board, which
    // made a scene that labels its own output impossible in one transaction.
    const batch = compileTeachingScene(teachingSceneSchema.parse(scene));
    expect(batch.actions.filter((action) => action.kind === "highlightShape").map((action) => action.kind === "highlightShape" ? action.id : "")).toEqual(["browser", "cache"]);
  });

  it("proposes and applies a self-referencing scene as one transaction, note included", () => {
    // Highlighting the `note` node goes through pageBounds, which measures text. That path used to
    // be excluded from unit tests for lack of a DOM; tests/setup/node-offscreen-canvas.ts now gives
    // the library the measurer seam it already checks for, so the whole default scene can be applied.
    const store = new Store();
    const proposal = proposeCanvasAction(store, "board-a", compileTeachingScene(teachingSceneSchema.parse(scene)), 7);
    expect(proposal.actions.filter((action) => action.kind === "highlightShape")).toHaveLength(2);
    approveCanvasProposal(store, "board-a", proposal, undefined, 7);
    expect(store.ids()).toEqual(expect.arrayContaining(["browser", "server", "cache"]));
    expect(store.shapes().filter((shape) => shape.type === "highlight")).toHaveLength(2);
    expect(store.shapes().some((shape) => shape.type === "geo" && shape.id === "browser")).toBe(true);
  });

  it("measures a wrapped note for occupancy instead of trusting the estimate", () => {
    const store = new Store();
    store.put(longNote);
    const measured = pageBounds(longNote);
    const estimate = shapeBounds(longNote);
    const occupied = boardOccupancy(store);

    // The AI-context estimator holds a note at its minimum box; the rendered note is far taller once
    // the label wraps. If occupancy followed the estimate, the planner would lay a box over the
    // bottom two thirds of the student's text.
    expect(estimate.h).toBeLessThan(measured.h);
    expect(measured.h).toBeGreaterThan(300);
    expect(occupied).toEqual([{ x: measured.x, y: measured.y, width: measured.w, height: measured.h }]);

    const plan = planLayout([{ id: "box", width: 100, height: 40 }], occupied, { x: 0, y: 0, width: 600, height: 500 });
    expect(plan.status).toBe("placed");
    if (plan.status === "placed") {
      const rect = plan.placements[0].rect;
      const overlapsNote = rect.x < measured.x + measured.w && rect.x + rect.width > measured.x
        && rect.y < measured.y + measured.h && rect.y + rect.height > measured.y;
      expect(overlapsNote).toBe(false);
    }
  });

  it("wraps a note into a fixed column, so longer text is taller and not wider", () => {
    // Notes keep a constant width and grow downward. Asserting that a highlight span widens with the
    // label was a wrong test, and it is the one this file shipped by mistake.
    const highlightSpan = (text: string) => {
      const store = new Store();
      store.put({ id: "note-1", typeName: "shape", type: "note", x: 100, y: 100, rot: 0, z: 1, props: { text, color: "black", size: "m", font: "sans", scale: 1 } });
      const proposal = proposeCanvasAction(store, "board-a", { boardId: "board-a", actions: [{ kind: "highlightShape", id: "note-1" }] }, 7);
      approveCanvasProposal(store, "board-a", proposal, undefined, 7);
      const mark = store.shapes().find((shape) => shape.type === "highlight");
      const pts = (mark?.props.pts ?? []) as number[];
      const xs = pts.filter((_, index) => index % 3 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    const noteHeight = (text: string) => pageBounds({ id: "n", typeName: "shape", type: "note", x: 0, y: 0, rot: 0, z: 1, props: { text, color: "black", size: "m", font: "sans", scale: 1 } }).h;
    const long = "the normal force is perpendicular to the contact surface and adjusts to the other contacts";
    expect(highlightSpan("F")).toBe(highlightSpan(long));
    expect(Number.isFinite(noteHeight(long))).toBe(true);
    expect(noteHeight(long)).toBeGreaterThan(noteHeight("F"));
  });

  it("rejects a forward reference, because the batch applies in order", () => {
    const store = new Store();
    expect(() => proposeCanvasAction(store, "board-a", {
      boardId: "board-a",
      actions: [
        { kind: "highlightShape", id: "later" },
        { kind: "createShape", shape: { id: "later", type: "geo", x: 10, y: 10, props: { geo: "rectangle", w: 40, h: 40, color: "black", size: "m" } } },
      ],
    }, 7)).toThrow(/unknown shape id/i);
  });

  it("refuses to update a shape the same batch creates, rather than guessing its committed properties", () => {
    const store = new Store();
    expect(() => proposeCanvasAction(store, "board-a", {
      boardId: "board-a",
      actions: [
        { kind: "createShape", shape: { id: "newone", type: "geo", x: 10, y: 10, props: { geo: "rectangle", w: 40, h: 40, color: "black", size: "m" } } },
        { kind: "updateShape", id: "newone", patch: { props: { w: 80 } } },
      ],
    }, 7)).toThrow(/same batch/i);
  });

  it("leaves the board untouched when an action fails partway through the batch", () => {
    // The second write to the store throws, so earlier creates in the same batch have already run.
    // If the batch were not transactional this would leave orphaned shapes on the board.
    const store = new Store();
    store.put({ id: "existing", typeName: "shape", type: "geo", x: 5, y: 5, rot: 0, z: 1, props: { geo: "rectangle", w: 40, h: 40, color: "black", size: "m" } });
    const before = store.ids().slice().sort().join(",");
    const proposal = proposeCanvasAction(store, "board-a", {
      boardId: "board-a",
      actions: [
        { kind: "createShape", shape: { id: "made1", type: "geo", x: 200, y: 200, props: { geo: "rectangle", w: 40, h: 40, color: "black", size: "m" } } },
        { kind: "createShape", shape: { id: "made2", type: "geo", x: 300, y: 300, props: { geo: "rectangle", w: 40, h: 40, color: "black", size: "m" } } },
      ],
    }, 7);
    const put = store.put.bind(store);
    let writes = 0;
    store.put = (record) => { if (++writes === 2) throw new Error("store exploded mid-batch"); return put(record); };
    expect(() => approveCanvasProposal(store, "board-a", proposal, undefined, 7)).toThrow(/mid-batch/i);
    store.put = put;
    expect(store.ids().slice().sort().join(",")).toBe(before);
    expect(store.get("made1")).toBeUndefined();
  });

  it("still rejects references to shapes that exist neither on the board nor in the batch", () => {
    const store = new Store();
    expect(() => proposeCanvasAction(store, "board-a", { boardId: "board-a", actions: [{ kind: "highlightShape", id: "ghost" }] }, 7)).toThrow(/unknown shape id/i);
  });

  it("lays out vertically when direction is down", () => {
    const batch = compileTeachingScene(teachingSceneSchema.parse({ ...scene, direction: "down" }));
    const shapes = batch.actions.filter((action) => action.kind === "createShape");
    const ys = shapes.map((action) => action.kind === "createShape" ? action.shape.y : 0);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(120);
  });

  it("publishes a design guide with layout and annotation rules", () => {
    expect(CANVAS_DESIGN_GUIDE).toContain("Layout");
    expect(CANVAS_DESIGN_GUIDE).toContain("annotations");
    expect(CANVAS_DESIGN_GUIDE.length).toBeGreaterThan(200);
  });
});

import { describe, expect, it } from "vitest";
import { Store, type ShapeRecord } from "@quickdrawjs/core";
import { approveCanvasProposal, proposeCanvasAction, validateCanvasAction } from "../src/canvas/ai/canvas-actions";
import { buildCanvasAIContext } from "../src/canvas/ai/canvas-context";
import type { ScientificObject } from "../src/canvas/model";

function shape(id: string, type: ShapeRecord["type"], x: number, y: number, props: Record<string, unknown>, rot = 0): ShapeRecord {
  return { id, typeName: "shape", type, x, y, rot, z: 1, props };
}
function baseStore() {
  const store = new Store();
  store.put(shape("label", "text", 10, 20, { text: "mitochondrion", color: "black", size: "m", font: "sans", autosize: true, scale: 1 }));
  store.put(shape("arrow", "arrow", 30, 40, { dx: 60, dy: -10, bend: 5, color: "blue", size: "m", dash: "solid" }));
  store.put(shape("offscreen", "geo", 5000, 5000, { geo: "ellipse", w: 100, h: 50, color: "red", size: "s", fill: "none" }));
  store.put(shape("stroke", "draw", 4, 6, { pts: [0, 0, 0.5, 5, 10, 0.8, 10, 15, 0.9], size: "m" }));
  return store;
}
const scope = { boardId: "board-a", courseId: "bio-130", lessonId: "cell" };

describe("Quickdraw AI context", () => {
  it("prioritizes selected shapes and extracts typed text and arrow geometry", () => {
    const context = buildCanvasAIContext({ source: baseStore(), selectedIds: ["label", "arrow"], viewport: { x: 0, y: 0, w: 200, h: 200 }, objects: [], scope });
    expect(context.selected.map((item) => item.id)).toEqual(["label", "arrow"]);
    expect(context.selected[0].text).toBe("mitochondrion");
    expect(context.selected[1].arrow).toEqual({ from: { x: 30, y: 40 }, to: { x: 90, y: 30 }, bend: 5 });
    expect(context.scope).toEqual(scope);
    expect(context.visible.some((item) => item.id === "offscreen")).toBe(false);
  });

  it("filters to viewport, summarizes raw strokes, and includes relevant scientific objects", () => {
    const object: ScientificObject = { id: "concept-1", kind: "concept", x: 10, y: 15, width: 40, height: 20, title: "Cell", definition: "Basic unit" };
    const context = buildCanvasAIContext({ source: baseStore(), selectedIds: [], viewport: { x: 0, y: 0, w: 200, h: 200 }, objects: [object], scope });
    expect(context.visible.map((item) => item.id)).not.toContain("offscreen");
    expect(context.visible.find((item) => item.id === "stroke")?.strokeSummary).toEqual({ pointCount: 3, bounds: { x: 1, y: 3, w: 16, h: 21 }, simplified: [{ x: 4, y: 6 }, { x: 9, y: 16 }, { x: 14, y: 21 }] });
    expect(context.nearbyObjects.map((item) => item.id)).toContain("concept-1");
    expect(context.spatialRelationships.length).toBeGreaterThan(0);
  });

  it("uses Quickdraw rotated bounds and obeys the context character limit", () => {
    const store = new Store();
    store.put(shape("rotated", "geo", 0, 0, { geo: "rectangle", w: 100, h: 20, color: "black", size: "m" }, Math.PI / 4));
    const bounds = buildCanvasAIContext({ source: store, selectedIds: ["rotated"], viewport: { x: -100, y: -100, w: 300, h: 300 }, objects: [], scope }).selected[0].bounds;
    expect(bounds.w).toBeGreaterThan(80);
    expect(bounds.h).toBeGreaterThan(80);
    const context = buildCanvasAIContext({ source: baseStore(), selectedIds: [], viewport: { x: 0, y: 0, w: 200, h: 200 }, objects: [], scope, maxChars: 600 });
    expect(context.truncated).toBe(true);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(600);
  });

  it("accepts serialized Quickdraw snapshots", () => {
    const context = buildCanvasAIContext({ source: baseStore().getSnapshot(), selectedIds: ["label"], viewport: { x: 0, y: 0, w: 200, h: 200 }, objects: [], scope });
    expect(context.selected[0].text).toBe("mitochondrion");
  });

  it("reports rotated arrow endpoints in page coordinates", () => {
    const store = new Store();
    store.put(shape("rotated-arrow", "arrow", 30, 40, { dx: 60, dy: -10, bend: 5, color: "blue", size: "m", dash: "solid" }, Math.PI / 2));
    const arrow = buildCanvasAIContext({ source: store, selectedIds: ["rotated-arrow"], viewport: { x: -100, y: -100, w: 300, h: 300 }, objects: [], scope }).selected[0].arrow;
    expect(arrow?.from).toEqual({ x: 55, y: 5 });
    expect(arrow?.to).toEqual({ x: 65, y: 65 });
  });
});

describe("Quickdraw AI action proposals", () => {
  it("creates, updates, moves, deletes, and connects through undoable store transactions", () => {
    const store = baseStore();
    const create = proposeCanvasAction(store, scope.boardId, { kind: "create", shape: { type: "geo", x: 120, y: 140, props: { geo: "rectangle", w: 40, h: 30, color: "black", size: "m" } } });
    const created = approveCanvasProposal(store, scope.boardId, create).changedId;
    expect(store.get(created)?.typeName).toBe("shape");
    store.undo(); expect(store.has(created)).toBe(false);
    store.redo(); expect(store.has(created)).toBe(true);

    const update = proposeCanvasAction(store, scope.boardId, { kind: "update", id: created, patch: { props: { fill: "solid" } } });
    approveCanvasProposal(store, scope.boardId, update);
    expect(store.get(created)?.id).toBe(created);
    expect((store.get(created) as ShapeRecord).props.fill).toBe("solid");
    const move = proposeCanvasAction(store, scope.boardId, { kind: "move", id: created, x: -15, y: 25 });
    approveCanvasProposal(store, scope.boardId, move);
    expect((store.get(created) as ShapeRecord).x).toBe(-15);

    const connect = proposeCanvasAction(store, scope.boardId, { kind: "connect", fromId: "label", toId: created });
    const arrowId = approveCanvasProposal(store, scope.boardId, connect).changedId;
    expect((store.get(arrowId) as ShapeRecord).type).toBe("arrow");
    const deletion = proposeCanvasAction(store, scope.boardId, { kind: "delete", id: created });
    approveCanvasProposal(store, scope.boardId, deletion);
    expect(store.has(created)).toBe(false);
    store.undo(); expect(store.has(created)).toBe(true);
  });

  it("rejects unknown IDs, invalid geometry, unsupported properties, and malformed commands", () => {
    const store = baseStore();
    expect(() => validateCanvasAction(store, { kind: "move", id: "missing", x: 0, y: 0 })).toThrow(/Unknown shape ID/);
    expect(() => validateCanvasAction(store, { kind: "create", shape: { type: "geo", x: 0, y: 0, props: { geo: "rectangle", w: 0, h: 5, color: "black", size: "m" } } })).toThrow();
    expect(() => validateCanvasAction(store, { kind: "update", id: "label", patch: { props: { script: "alert(1)" } } })).toThrow(/Unsupported text property/);
    expect(() => validateCanvasAction(store, { kind: "delete", id: "label", force: true })).toThrow();
  });

  it("rejects stale proposals and board scope changes without mutating either board", () => {
    const storeA = baseStore(), storeB = baseStore();
    const proposal = proposeCanvasAction(storeA, "board-a", { kind: "move", id: "label", x: 50, y: 60 });
    expect(() => approveCanvasProposal(storeB, "board-b", proposal)).toThrow(/different board/);
    expect(() => approveCanvasProposal(storeA, "board-a", proposal)).not.toThrow();
    const stale = proposeCanvasAction(storeA, "board-a", { kind: "move", id: "label", x: 70, y: 80 });
    storeA.update("label", { x: 99 });
    expect(() => approveCanvasProposal(storeA, "board-a", stale)).toThrow(/changed after this proposal/);
    expect((storeB.get("label") as ShapeRecord).x).toBe(10);
  });
});

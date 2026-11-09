import { describe, expect, it, vi } from "vitest";
import { Store, type ShapeRecord } from "@quickdrawjs/core";
import { approveCanvasProposal, MAX_CANVAS_STATE_CHARS, proposeCanvasAction, readCanvasState, validateCanvasAction } from "../src/canvas/ai/canvas-actions";
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
const scope = { boardId: "board-a", courseId: "bio-130", lessonId: "cell", revision: 7 };
const propose = (source: Store, boardId: string, value: unknown) => proposeCanvasAction(source, boardId, value, scope.revision);
const approve = (source: Store, boardId: string, proposal: ReturnType<typeof proposeCanvasAction>, editor?: any, currentRevision = scope.revision) => approveCanvasProposal(source, boardId, proposal, editor, currentRevision);

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
  it("creates stable editable shapes and applies one undoable action batch", () => {
    const store = baseStore();
    const proposal = propose(store, scope.boardId, { boardId: scope.boardId, actions: [
      { kind: "createShape", shape: { id: "shape:box", type: "geo", x: 120, y: 140, props: { geo: "rectangle", w: 40, h: 30, color: "black", size: "m" } } },
      { kind: "createText", id: "shape:label", x: 140, y: 180, text: "Nitrate" },
      { kind: "createArrow", id: "shape:arrow", from: { x: 140, y: 170 }, to: { x: 190, y: 170 }, label: "resonance" },
    ] });
    expect(proposal.requiresConfirmation).toBe(false);
    approve(store, scope.boardId, proposal);
    expect(store.get("shape:box")?.typeName).toBe("shape");
    expect((store.get("shape:label") as ShapeRecord).props.text).toBe("Nitrate");
    expect((store.get("shape:arrow") as ShapeRecord).props.dx).toBe(50);
    const reloaded = new Store();
    reloaded.loadSnapshot(store.getSnapshot());
    expect((reloaded.get("shape:label") as ShapeRecord).props.text).toBe("Nitrate");
    store.undo(); expect(store.has("shape:box")).toBe(false);
    store.redo(); expect(store.has("shape:box")).toBe(true);

    const update = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "updateShape", id: "shape:box", patch: { props: { fill: "solid" } } }] });
    approve(store, scope.boardId, update);
    expect((store.get("shape:box") as ShapeRecord).props.fill).toBe("solid");
    const move = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "moveShape", id: "shape:box", x: -15, y: 25 }] });
    approve(store, scope.boardId, move);
    expect((store.get("shape:box") as ShapeRecord).x).toBe(-15);
    const highlight = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "highlightShape", id: "shape:box" }] });
    const markerId = approve(store, scope.boardId, highlight).changedId;
    expect((store.get(markerId) as ShapeRecord).type).toBe("highlight");
    const deletion = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "deleteShape", id: "shape:box" }] });
    expect(deletion.requiresConfirmation).toBe(true);
    approve(store, scope.boardId, deletion);
    expect(store.has("shape:box")).toBe(false);
    store.undo(); expect(store.has("shape:box")).toBe(true);
  });

  it("reads bounded state and rejects malformed, unsupported, oversized, or conflicting requests", () => {
    const store = baseStore();
    expect(() => validateCanvasAction(store, { kind: "moveShape", id: "missing", x: 0, y: 0 })).toThrow(/Unknown shape ID/);
    expect(() => validateCanvasAction(store, { kind: "createShape", shape: { type: "geo", x: 0, y: 0, props: { geo: "rectangle", w: 0, h: 5, color: "black", size: "m" } } })).toThrow();
    expect(() => validateCanvasAction(store, { kind: "updateShape", id: "label", patch: { props: { script: "alert(1)" } } })).toThrow(/Unsupported text property/);
    expect(() => validateCanvasAction(store, { kind: "deleteShape", id: "label", force: true })).toThrow();
    expect(() => propose(store, scope.boardId, { boardId: scope.boardId, actions: Array.from({ length: 31 }, () => ({ kind: "selectShapes", ids: [] })) })).toThrow();
    expect(() => propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "createText", id: "label", x: 0, y: 0, text: "collision" }] })).toThrow(/already exists/);
    expect(() => propose(store, "board-b", { boardId: "board-b", actions: [{ kind: "moveShape", id: "label", x: 2, y: 2 }] })).not.toThrow();
    expect(() => propose(store, scope.boardId, { boardId: "board-b", actions: [{ kind: "moveShape", id: "label", x: 2, y: 2 }] })).toThrow(/active board changed/);
    expect(readCanvasState(store, scope.boardId, scope.boardId).objectCount).toBe(4);
    expect(() => readCanvasState(store, scope.boardId, "board-b")).toThrow(/active board changed/);
  });

  it("bounds large tool results while preserving selected geometry and reporting omissions", () => {
    const store = new Store();
    for (let index = 0; index < 40; index++) store.put(shape(`text-${index}`, "text", index, index + 1, { text: `Evidence ${index} ${"x".repeat(500)}`, color: "black", size: "m", font: "sans", autosize: true, scale: 1 }));
    const points = Array.from({ length: 3000 }, (_, index) => index);
    store.put(shape("selected-stroke", "draw", 7, 9, { pts: points, color: "blue", size: "m" }));

    const result = readCanvasState(store, scope.boardId, scope.boardId, ["selected-stroke"]);
    const selectedStroke = result.shapes.find((item) => item.id === "selected-stroke");
    const selectedPoints = (selectedStroke?.props as Record<string, unknown> | undefined)?.pts as number[];

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(MAX_CANVAS_STATE_CHARS);
    expect(result.objectCount).toBe(41);
    expect(result.truncated).toBe(true);
    expect(result.omittedShapeCount).toBeGreaterThan(0);
    expect(result.shapes[0].id).toBe("selected-stroke");
    expect(selectedStroke).toMatchObject({ type: "draw", x: 7, y: 9 });
    expect(selectedPoints).toHaveLength(90);
    expect(selectedPoints.at(-1)).toBe(2999);
    expect(selectedStroke?.truncatedProperties).toContain("props.pts sampled 1000 points to 30 across the stroke");
    const textShape = result.shapes.find((item) => item.id === "text-0");
    expect((textShape?.props as Record<string, unknown> | undefined)?.text).toMatch(/^Evidence 0 /);
    expect(textShape?.truncatedProperties).toContain("props.text truncated from 511 characters to 500");
    const targeted = readCanvasState(store, scope.boardId, scope.boardId, [], ["text-39", "missing-shape"]);
    expect(targeted.shapes[0].id).toBe("text-39");
    expect(targeted.requestedShapeCount).toBe(2);
    expect(targeted.omittedRequestedShapeIds).toContain("missing-shape");
  });

  it("rejects stale proposals and board scope changes without mutating either board", () => {
    const storeA = baseStore(), storeB = baseStore();
    const proposal = propose(storeA, "board-a", { boardId: "board-a", actions: [{ kind: "moveShape", id: "label", x: 50, y: 60 }] });
    expect(() => approve(storeB, "board-b", proposal)).toThrow(/different board/);
    expect(() => approve(storeA, "board-a", proposal)).not.toThrow();
    const stale = propose(storeA, "board-a", { boardId: "board-a", actions: [{ kind: "moveShape", id: "label", x: 70, y: 80 }] });
    storeA.update("label", { x: 99 });
    expect(() => approve(storeA, "board-a", stale)).toThrow(/changed after this proposal/);
    expect((storeB.get("label") as ShapeRecord).x).toBe(10);
  });

  it("rejects stale board revisions and requires explicit current revision at approval", () => {
    const store = baseStore();
    const proposal = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "moveShape", id: "label", x: 70, y: 80 }] });
    expect(() => approve(store, scope.boardId, proposal, undefined, scope.revision + 1)).toThrow(/stale/);
    expect(() => approveCanvasProposal(store, scope.boardId, proposal)).toThrow(/revision is required/);
    expect((store.get("label") as ShapeRecord).x).toBe(10);
  });

  it("requires confirmation for broad batches", () => {
    const store = baseStore();
    const actions = Array.from({ length: 6 }, (_, index) => ({ kind: "createText" as const, id: `shape:${index}`, x: index * 10, y: 0, text: "note" }));
    const proposal = propose(store, scope.boardId, { boardId: scope.boardId, actions });
    expect(proposal.requiresConfirmation).toBe(true);
    proposal.requiresConfirmation = false;
    expect(() => approveCanvasProposal(store, scope.boardId, proposal, undefined, scope.revision)).toThrow(/explicit confirmation/);
  });

  it("selects requested shapes through the Quickdraw editor API", () => {
    const store = baseStore();
    const undoCount = store.undos.length;
    const proposal = propose(store, scope.boardId, { boardId: scope.boardId, actions: [{ kind: "selectShapes", ids: ["label"] }] });
    const editor = { setSelection: vi.fn() } as any;
    approveCanvasProposal(store, scope.boardId, proposal, editor, scope.revision);
    expect(editor.setSelection).toHaveBeenCalledWith(["label"]);
    expect(store.undos).toHaveLength(undoCount);
  });
});

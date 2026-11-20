import { describe, expect, it } from "vitest";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { normalizeOCRText } from "../server/canvas-intelligence/ocr.js";
import { associateOCRLabels } from "../server/canvas-intelligence/regions.js";

const positionedLabel = { ...normalizeOCRText("F"), items: normalizeOCRText("F").items.map((item) => ({ ...item, worldRegion: { x: 0, y: 0, width: 10, height: 10 }, locationPrecision: "item" as const })) };

describe("canvas label associations", () => {
  it("does not mistake another text label or note for the object being labelled", () => {
    const input = normalizeCanvasInput({ boardId: "labels", snapshot: { document: { store: {
      text: { id: "text", type: "text", x: 12, y: 0, width: 20, height: 10, text: "mass" },
      note: { id: "note", type: "note", x: 14, y: 0, width: 20, height: 10 },
      arrow: { id: "arrow", type: "arrow", x: 30, y: 0, width: 20, height: 10 },
    } } } });
    expect(associateOCRLabels(input, positionedLabel)[0]).toMatchObject({ status: "geometry-supported", candidateIds: ["arrow"] });
  });
  it("leaves a label unmatched when only text is nearby", () => {
    const input = normalizeCanvasInput({ boardId: "labels-only", snapshot: { document: { store: {
      text: { id: "text", type: "text", x: 12, y: 0, width: 20, height: 10, text: "mass" },
    } } } });
    expect(associateOCRLabels(input, positionedLabel)[0]).toMatchObject({ status: "unmatched", candidateIds: [] });
  });
});

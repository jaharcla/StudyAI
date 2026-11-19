import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clampOCRRegionLimit, groupCanvasInkStrokes, groupCanvasInkStrokesForOCR, isMathInkBoard, selectCanvasOCRGroups, type CanvasInkStrokeBounds } from "../src/canvas/ocr-regions";

const saved = JSON.parse(readFileSync("tests/fixtures/canvas-grounding/preserved-quickdraw-sample.json", "utf8")) as {
  records: CanvasInkStrokeBounds[];
  relevanceBounds: Array<{ x: number; y: number; width: number; height: number }>;
  expectedHandwritingSourceIds: string[];
};

describe("pure-ink math OCR grouping", () => {
  const records: CanvasInkStrokeBounds[] = [0, 1, 2].map((index) => ({
    id: `stroke-${index}`,
    type: "draw",
    bounds: { x: index * 100, y: 0, width: 20, height: 20 },
    points: [{ x: index * 100, y: 0 }, { x: index * 100 + 20, y: 20 }],
  }));

  it("joins a pure-ink math board into one expression crop", () => {
    expect(groupCanvasInkStrokes(records)).toHaveLength(3);
    const groups = groupCanvasInkStrokesForOCR(records, { mathMode: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceIds).toEqual(["stroke-0", "stroke-1", "stroke-2"]);
    expect(groups[0].id).toContain("stroke-group:expression:");
    expect(groups[0].worldBounds).toEqual({ x: 0, y: 0, width: 220, height: 20 });
  });

  it("detects math ink boards and clamps the configurable region limit", () => {
    expect(isMathInkBoard(records, 0)).toBe(true);
    expect(isMathInkBoard(records, 1)).toBe(false);
    expect(clampOCRRegionLimit(99)).toBe(8);
    expect(clampOCRRegionLimit(0)).toBe(1);
    expect(clampOCRRegionLimit("not-a-number")).toBe(3);
  });
});

describe("saved canvas OCR region selection", () => {
  it("includes the saved H-C-H stroke group within the three-region budget", () => {
    const groups = groupCanvasInkStrokes(saved.records);
    const selection = selectCanvasOCRGroups(groups, { records: saved.records, relevanceBounds: saved.relevanceBounds, limit: 3 });

    expect(selection.selected).toHaveLength(3);
    expect(selection.selected.some((group) => saved.expectedHandwritingSourceIds.every((id) => group.sourceIds.includes(id)))).toBe(true);
    expect(selection.omitted).toHaveLength(4);
    expect(selection.omitted.every((region) => region.reason === "crop-limit" && region.score.total >= 0)).toBe(true);
  });

  it("selects the complete grouped handwriting when one of its strokes is selected", () => {
    const groups = groupCanvasInkStrokes(saved.records);
    const selection = selectCanvasOCRGroups(groups, {
      records: saved.records,
      relevanceBounds: saved.relevanceBounds,
      selectedIds: [saved.expectedHandwritingSourceIds[0]],
      limit: 3,
    });

    expect(selection.selected).toHaveLength(1);
    expect(selection.selected[0].sourceIds).toEqual(saved.expectedHandwritingSourceIds);
    expect(selection.omitted.every((region) => region.reason === "not-selected")).toBe(true);
  });

  it("prefers spatially diverse groups when nearby candidates have equal scores", () => {
    const groups = [0, 1, 2].map((index) => ({
      id: `group-${index}`,
      sourceIds: [`stroke-${index}`],
      worldBounds: { x: index < 2 ? index * 20 : 500, y: 0, width: 12, height: 12 },
    }));
    const records = groups.map((group) => ({ id: group.sourceIds[0], type: "draw", bounds: group.worldBounds, points: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 8, y: 0 }] }));
    const selection = selectCanvasOCRGroups(groups, { records, limit: 2 });

    expect(selection.selected.map((group) => group.id)).toContain("group-2");
    expect(selection.selected.map((group) => group.id)).not.toContain("group-1");
  });
});

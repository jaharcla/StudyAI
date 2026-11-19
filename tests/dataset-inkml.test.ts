import { describe, expect, it } from "vitest";
import type { ShapeRecord } from "@quickdrawjs/react";
import type { CanvasDocument } from "../src/canvas/model";
import { fitInkMLCanvas, inkMLProvenance, inkMLToCanvasDocument, parseInkML } from "../src/canvas/dataset-inkml";

const xml = `<ink xmlns="http://www.w3.org/2003/InkML"><traceFormat><channel name="X"/><channel name="Y"/><channel name="T" type="decimal" units="ms"/></traceFormat><annotation type="sampleId">sample-1</annotation><annotation type="normalizedLabel">x &amp; y</annotation><trace id="4">10 20 0, 12 24 10</trace><trace id="8">15 30 20</trace></ink>`;

describe("dataset InkML conversion", () => {
  it("retains source channels, annotations, trace boundaries, and exact coordinates", () => {
    const ink = parseInkML(xml);
    const document = inkMLToCanvasDocument(ink);
    const strokes = Object.values(document.snapshot.document.store).filter((shape): shape is ShapeRecord => shape.typeName === "shape");

    expect(ink.annotations.normalizedLabel).toBe("x & y");
    expect(ink.channels).toEqual([{ name: "X" }, { name: "Y" }, { name: "T", type: "decimal", units: "ms" }]);
    expect(strokes.map((stroke) => stroke.id)).toEqual(["shape:inkml-sample-1-4", "shape:inkml-sample-1-8"]);
    expect(strokes[0].props.pts).toEqual([10, 20, 0.5, 12, 24, 0.5]);
    expect(inkMLProvenance(ink, "test/sample-1.inkml").traces[0].points).toEqual([[10, 20, 0], [12, 24, 10]]);
  });

  it("fits the visible strokes while keeping the inverse source coordinates in provenance", () => {
    const ink = parseInkML(xml);
    const transform = fitInkMLCanvas(ink, { x: 100, y: 50, width: 200, height: 100 });
    const document = inkMLToCanvasDocument(ink, ink.sampleId, transform);
    const points = firstStroke(document).props.pts as number[];

    expect(points[0]).toBeGreaterThanOrEqual(100);
    expect(points[1]).toBeGreaterThanOrEqual(50);
    expect((points[0] - transform.offsetX) / transform.scale).toBe(10);
    expect((points[1] - transform.offsetY) / transform.scale).toBe(20);
  });

  it("maps an InkML pressure channel into QuickDraw pressure", () => {
    const ink = parseInkML(`<ink><traceFormat><channel name="X"/><channel name="Y"/><channel name="P" type="decimal"/></traceFormat><trace id="p">1 2 0.2, 3 4 0.8</trace></ink>`);
    const points = firstStroke(inkMLToCanvasDocument(ink)).props.pts as number[];
    expect(points).toEqual([1, 2, 0.2, 3, 4, 0.8]);
  });

  it("rejects entity declarations, malformed points, and over-budget traces", () => {
    expect(() => parseInkML(`<!DOCTYPE ink [<!ENTITY x SYSTEM "file:///secret">]>${xml}`)).toThrow(/DTD and entity/);
    expect(() => parseInkML(xml.replace("<trace id=\"4\">", "<traceGroup><trace id=\"4\">"))).toThrow(/outside the supported/);
    expect(() => parseInkML(xml.replace("10 20 0", "10 20 nope"))).toThrow(/non-finite/);
    expect(() => parseInkML(xml, { maxPoints: 2 })).toThrow(/point limit/);
  });
});

function firstStroke(document: CanvasDocument): ShapeRecord {
  const shape = Object.values(document.snapshot.document.store).find((record): record is ShapeRecord => record.typeName === "shape");
  if (!shape) throw new Error("No QuickDraw stroke was created.");
  return shape;
}

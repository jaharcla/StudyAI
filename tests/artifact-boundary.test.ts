import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compilePackage } from "../server/artifact-intelligence/service";
import { parseArtifactPackage } from "../src/artifacts/package";
import { DEFAULT_VIEWPORT } from "../src/canvas/ai/teaching-scene";

const REF = "studyai://document/module-1/text/4?chunk=0";

const pkg = parseArtifactPackage({
  schemaVersion: 1,
  id: "boundary-pkg",
  objective: "Friction recap",
  courseId: "c1",
  lessonId: "l1",
  components: [{ id: "q1", kind: "question", prompt: "Which way does friction act?", answer: "Uphill.", sourceRefs: [REF] }],
}, [REF]);

describe("intelligence/rendering authority boundary", () => {
  it("does not import board persistence, board reads, or the tutor authoring path", () => {
    const source = readFileSync("server/artifact-intelligence/service.ts", "utf8");
    for (const forbidden of ["canvas-persistence", "server/agent", "parseCanvasDocument", "../canvas/tutor", "./agent"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("compiles with only supplied geometry and retrieved evidence, no database or HTTP handle", () => {
    const result = compilePackage(pkg, {
      courseId: "c1", lessonId: "l1", boardId: "b1",
      occupancy: [],
      viewport: DEFAULT_VIEWPORT,
      anchors: new Map(),
      retrievedRefs: [REF],
      retrievedChunks: [{ ref: REF, text: "Friction opposes the motion down the slope." }],
    });
    expect(result.canvas?.objects.map((object) => object.kind)).toEqual(["question"]);
    expect(result.studio).toBeUndefined();
    expect(result.learning).toBeUndefined();
  });

  it("returns the Phase 1 ValidationReport shape", () => {
    const report = compilePackage(pkg, {
      courseId: "c1", lessonId: "l1", boardId: "b1",
      occupancy: [],
      viewport: DEFAULT_VIEWPORT,
      anchors: new Map(),
      retrievedRefs: [REF],
      retrievedChunks: [{ ref: REF, text: "Friction opposes the motion down the slope." }],
    }).report;
    expect(Object.keys(report).sort()).toEqual(["ok", "problems"].sort());
    expect(typeof report.ok).toBe("boolean");
    expect(Array.isArray(report.problems)).toBe(true);
  });
});

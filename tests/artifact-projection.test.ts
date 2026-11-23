import { describe, expect, it } from "vitest";
import { parseArtifactPackage } from "../src/artifacts/package";
import { projectPackage } from "../src/artifacts/project";
import { compilePackage } from "../server/artifact-intelligence/service";
import { DEFAULT_VIEWPORT } from "../src/canvas/ai/teaching-scene";
import { ActivitySpecSchema } from "../src/learning/activities/contracts";
import type { StudyGuideContent } from "../server/studio/contracts";
import { defaultActivityCapabilities, validateCapabilities } from "../server/learning/activities/capabilities";

const REF = "studyai://document/module-1/text/4?chunk=0";

const forcePackage = parseArtifactPackage({
  schemaVersion: 1,
  id: "force-pkg",
  objective: "Explain friction on an incline",
  courseId: "c1",
  lessonId: "l1",
  components: [
    { id: "e1", kind: "explanation", text: "Friction opposes motion.", sourceRefs: [REF], concepts: ["friction"] },
    { id: "d1", kind: "diagram", title: "Forces", surfaceAngleDeg: 0, sourceRefs: [REF], forces: [{ label: "gravity", components: [0, -9.8] }] },
    { id: "we1", kind: "worked-example", prompt: "Find friction direction.", steps: ["Identify motion", "Oppose it"], answer: "Uphill.", sourceRefs: [REF] },
    { id: "q1", kind: "question", prompt: "Which way does friction act?", answer: "Uphill.", sourceRefs: [REF] },
    { id: "s1", kind: "summary", title: "Forces recap", sections: [{ heading: "Friction", body: "Opposes motion." }], sourceRefs: [REF] },
    { id: "ix1", kind: "interactive-exercise", prompt: "Read the graph.", sourceRefs: [REF], exercise: { mode: "graph-interpretation", slope: 2, intercept: 0, xRange: [-1, 1], atX: 1 } },
  ],
  relations: [
    { from: "e1", to: "q1", relation: "explains" },
    { from: "d1", to: "q1", relation: "demonstrates" },
    { from: "s1", to: "e1", relation: "summarizes" },
  ],
}, [REF]);

const ctx = {
  courseId: "c1",
  lessonId: "l1",
  boardId: "b1",
  occupancy: [],
  viewport: DEFAULT_VIEWPORT,
  anchors: new Map<string, { x: number; y: number; width: number; height: number }>(),
  retrievedRefs: [REF],
  retrievedChunks: [{ ref: REF, text: "Friction opposes the motion down the slope." }],
};

describe("projectPackage", () => {
  it("assigns every component to exactly one renderer", () => {
    const projection = projectPackage(forcePackage);
    const all = [...projection.canvas, ...projection.studio, ...projection.learning];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(forcePackage.components.map((component) => component.id).sort());
    expect(projection.studio).toEqual(["s1"]);
    expect(projection.learning).toEqual(["ix1"]);
  });
});

describe("compilePackage", () => {
  it("compiles one Canvas revision, one Studio guide and one valid ActivitySpec", () => {
    const result = compilePackage(forcePackage, ctx);
    expect(result.canvas?.objects.map((object) => object.kind)).toEqual(["question", "force"]);
    expect(result.report).toEqual({ ok: true, problems: [] });

    expect(result.studio?.kind).toBe("study-guide");
    const content = result.studio?.content as StudyGuideContent;
    expect(content.sections[0]?.body).toBe("Opposes motion.");

    const spec = ActivitySpecSchema.parse(result.learning);
    expect(() => validateCapabilities(spec, defaultActivityCapabilities)).not.toThrow();
    expect(spec.tasks).toHaveLength(1);
    expect(spec.artifacts[0]?.capabilityId).toBe("canvas.linear-graph");
  });
});

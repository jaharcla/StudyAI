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

describe("cycle 4 schema integration", () => {
  it("compiles a first-class refusal to no artifact", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "refusal", objective: "Exam topics", courseId: "c1", lessonId: "l1",
      components: [],
      outcome: { status: "insufficient-source", missing: ["final exam announcement"], nextStep: "Upload the announcement." },
    }, []);
    const result = compilePackage(pkg, ctx);
    expect(result.outcome?.status).toBe("insufficient-source");
    expect(result.canvas).toBeUndefined();
    expect(result.studio).toBeUndefined();
    expect(result.learning).toBeUndefined();
    expect(result.report).toEqual({ ok: true, problems: [] });
  });

  it("carries a question scenario through compilation so the student can answer it", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "scenario-q", objective: "Friction", courseId: "c1", lessonId: "l1",
      components: [{
        id: "q1", kind: "question", prompt: "Compute the friction for the 4 kg crate.", answer: "16.6 N", sourceRefs: [REF],
        scenario: "A 4 kg crate rests on a 20 degree incline with coefficient 0.30. An applied force of 6 N acts up the slope.",
        bloomLevel: "application",
      }],
    }, [REF]);
    const result = compilePackage(pkg, ctx);
    expect(result.canvas?.objects.find((object) => object.kind === "question")).toMatchObject({
      prompt: "Compute the friction for the 4 kg crate.",
      scenario: "A 4 kg crate rests on a 20 degree incline with coefficient 0.30. An applied force of 6 N acts up the slope.",
    });
  });

  it("keeps a long objective within the brief figure title limit", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1,
      id: "long-title",
      objective: "A very long objective that repeats many details about distance time graphs and slopes and several other things that would otherwise overflow the figure title field in the brief schema",
      courseId: "c1", lessonId: "l1",
      components: [{ id: "g1", kind: "graph", expression: "5*x", xRange: [0, 4], sourceRefs: [REF] }],
    }, [REF]);
    const result = compilePackage(pkg, ctx);
    expect(result.report.ok).toBe(true);
    expect(result.canvas?.objects.some((object) => object.kind === "graph")).toBe(true);
  });

  it("carries a force application point into the compiled object", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "torque-pos", objective: "Torque", courseId: "c1", lessonId: "l1",
      components: [{
        id: "d1", kind: "diagram", title: "Beam", sourceRefs: [REF],
        forces: [{ label: "applied", components: [0, -10], position: { x: 20, y: 100 } }],
      }],
    }, [REF]);
    const result = compilePackage(pkg, ctx);
    expect(result.canvas?.objects.find((object) => object.kind === "force")).toMatchObject({
      pointOfApplication: { x: 20, y: 100 },
    });
  });
});

describe("compilePackage", () => {
  it("reports a canvas component that cannot fit in the single revision instead of dropping it silently", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "dropped-pkg", objective: "Friction", courseId: "c1", lessonId: "l1",
      components: [
        { id: "q1", kind: "question", prompt: "Which way?", sourceRefs: [REF] },
        { id: "we1", kind: "worked-example", prompt: "Work it out.", steps: ["Step one"], answer: "Uphill.", sourceRefs: [REF] },
      ],
    }, [REF]);
    const result = compilePackage(pkg, ctx);
    expect(result.report.ok).toBe(false);
    expect(result.report.problems.some((problem) => problem.validator === "composition" && problem.message.includes("we1"))).toBe(true);
  });

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

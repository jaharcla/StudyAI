import { describe, expect, it } from "vitest";
import { validateCompiled } from "../src/artifacts/validate";
import { ArtifactValidationError } from "../src/artifacts/contracts";
import { artifactBriefSchema, compileArtifactBrief, DEFAULT_VIEWPORT } from "../src/canvas/ai/teaching-scene";
import { proposeArtifactBrief } from "../src/canvas/tutor";
import type { ScientificObject } from "../src/canvas/model";

const viewport = DEFAULT_VIEWPORT;

const baseBrief = {
  boardId: "board-v",
  topic: "forces on a block",
  artifact: {
    kind: "figure",
    count: 1,
    prompt: "Describe the forces.",
    concepts: ["friction"],
    figure: { kind: "freebody", title: "Forces" },
  },
  placement: { relation: "clear-area" },
  sourceRefs: ["module-1#p4"],
  reason: "Validation fixture.",
};

const briefWithFigure = (figure: Record<string, unknown>, kind = "figure") => artifactBriefSchema.parse({
  ...baseBrief,
  artifact: { ...baseBrief.artifact, kind, figure },
});

const forceObject = (id: string, label: string, components: [number, number, number], x: number): ScientificObject => ({
  id, kind: "force", x, y: 100, width: 24, height: 24, components, units: "N", label,
  provenance: { status: "generated-unverified", sourceRefs: [] },
});

const reportFor = (objects: ScientificObject[], figure: Record<string, unknown>, kind = "figure") =>
  validateCompiled({ objects, brief: briefWithFigure(figure, kind), occupancy: [], viewport });

describe("validateCompiled", () => {
  it("reports a normal force not perpendicular and friction not parallel at the supplied surface angle", () => {
    const report = reportFor([
      forceObject("f-normal", "normal", [100, 0, 0], 100),
      forceObject("f-friction", "friction", [0, 100, 0], 300),
    ], { kind: "freebody", title: "Forces", context: { surfaceAngleDeg: 0 }, forces: [
      { label: "normal", components: [100, 0] },
      { label: "friction", components: [0, 100] },
    ] });
    expect(report.ok).toBe(false);
    const messages = report.problems.filter((problem) => problem.validator === "force-diagram").map((problem) => problem.message).join(" ");
    expect(messages).toMatch(/perpendicular/);
    expect(messages).toMatch(/parallel/);
    for (const problem of report.problems) {
      expect(typeof problem.componentId).toBe("string");
      expect(typeof problem.validator).toBe("string");
      expect(typeof problem.message).toBe("string");
      expect(typeof problem.requestedCorrection).toBe("string");
      expect(problem.requestedCorrection.length).toBeGreaterThan(0);
    }
  });

  it("flags an equation with no finite evaluation", () => {
    const objects: ScientificObject[] = [{ id: "eq", kind: "equation", x: 100, y: 100, width: 300, height: 120, expression: "1/0", variables: {} }];
    const report = reportFor(objects, { kind: "equation", title: "Bad", expression: "1/0" });
    expect(report.problems.some((problem) => problem.validator === "equation" && /finite/i.test(problem.message))).toBe(true);
  });

  it("flags graph points that disagree with the expression", () => {
    const objects: ScientificObject[] = [{
      id: "g", kind: "graph", x: 100, y: 100, width: 340, height: 260,
      expression: "x^2", xRange: [-1, 1], points: [[0, 0], [1, 5]], xLabel: "x", yLabel: "y",
    }];
    const report = reportFor(objects, { kind: "graph", title: "y = x^2", expression: "x^2", xRange: [-1, 1] });
    expect(report.problems.some((problem) => problem.validator === "graph" && /does not match/i.test(problem.message))).toBe(true);
  });

  it("flags an unconnected mind-map node", () => {
    const objects: ScientificObject[] = [{
      id: "m", kind: "mindmap", x: 100, y: 100, width: 340, height: 260, title: "Map",
      nodes: [{ id: "root", label: "Root", x: 100, y: 100 }, { id: "c1", label: "Child", x: 200, y: 100 }],
      edges: [],
    }];
    const report = reportFor(objects, { kind: "mindmap", title: "Map" });
    expect(report.problems.some((problem) => problem.validator === "mind-map" && /unconnected/i.test(problem.message))).toBe(true);
  });

  it("flags an object outside the viewport", () => {
    const objects: ScientificObject[] = [{ id: "q", kind: "question", x: -10, y: 100, width: 100, height: 100, prompt: "P" }];
    const report = reportFor(objects, { kind: "freebody", title: "Forces" }, "question");
    expect(report.problems.some((problem) => problem.validator === "geometry" && /outside/i.test(problem.message))).toBe(true);
  });

  it("accepts a coherent compiled free-body artifact", () => {
    const brief = briefWithFigure({
      kind: "freebody", title: "Forces", context: { surfaceAngleDeg: 0 },
      forces: [
        { label: "gravity", components: [0, -10] },
        { label: "normal", components: [0, 10] },
        { label: "friction", components: [10, 0] },
      ],
    });
    const compiled = compileArtifactBrief(brief, { viewport });
    const report = validateCompiled({ objects: compiled.objects, brief, occupancy: [], viewport });
    expect(report).toEqual({ ok: true, problems: [] });
  });
});

describe("validation at the authoring boundary", () => {
  const context = { boardId: "board-v", courseId: "chem-120", lessonId: "lesson-03", revision: 1, objects: [] as ScientificObject[] };

  it("throws a structured error on an invalid brief and applies nothing", () => {
    const invalid = briefWithFigure({
      kind: "freebody", title: "Bad", context: { surfaceAngleDeg: 0 },
      forces: [
        { label: "normal", components: [100, 0] },
        { label: "friction", components: [0, 100] },
      ],
    });
    expect(() => proposeArtifactBrief(context, invalid, 1)).toThrow(ArtifactValidationError);
    try {
      proposeArtifactBrief(context, invalid, 1);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactValidationError);
      if (error instanceof ArtifactValidationError) {
        expect(error.report.ok).toBe(false);
        expect(error.report.problems.some((problem) => problem.validator === "force-diagram")).toBe(true);
        expect(JSON.stringify(error.report)).toContain("requestedCorrection");
      }
    }
    expect(context.objects).toHaveLength(0);
  });
});

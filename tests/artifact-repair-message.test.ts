import { describe, expect, it } from "vitest";
import { buildRepairResult, computePreserveList } from "../src/artifacts/repair-message";
import { parseArtifactPackage } from "../src/artifacts/package";
import type { ValidationProblem, ValidationReport } from "../src/artifacts/contracts";

const REF = "studyai://document/module-1/text/4?chunk=0";

const frictionPackage = parseArtifactPackage({
  schemaVersion: 1,
  id: "friction-repair",
  objective: "Forces on an incline",
  courseId: "c1",
  lessonId: "l1",
  components: [
    { id: "q1", kind: "question", prompt: "Which way does friction act?", answer: "Uphill.", sourceRefs: [REF] },
    { id: "d1", kind: "diagram", title: "Forces", sourceRefs: [REF], forces: [{ label: "gravity", components: [0, -9.8] }] },
  ],
}, [REF]);

const problem = (validator: string, message: string): ValidationProblem => ({
  componentId: "d1",
  validator,
  message,
  requestedCorrection: `Fix the diagram component: ${message}`,
});

const frictionReport: ValidationReport = {
  ok: false,
  problems: [
    problem("force-diagram", "Friction is not parallel to the incline surface."),
    problem("force-diagram", "Normal force is not perpendicular to the incline surface."),
    problem("geometry", "Object overlaps existing board content."),
  ],
};

describe("computePreserveList", () => {
  it("keeps the unaffected question and its citation, not the failing diagram id", () => {
    const preserve = computePreserveList(frictionPackage, frictionReport);
    expect(preserve.componentIds).toEqual(["q1"]);
    expect(preserve.sourceRefs).toEqual([REF]);
  });
});

describe("buildRepairResult", () => {
  it("returns ok without messages when validation passes", () => {
    expect(buildRepairResult(frictionPackage, { ok: true, problems: [] })).toEqual({ status: "ok" });
  });

  it("groups the three friction problems under their validators", () => {
    const result = buildRepairResult(frictionPackage, frictionReport);
    expect(result.status).toBe("needs_repair");
    if (result.status !== "needs_repair") return;
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      componentId: "d1",
      validator: "force-diagram",
      problems: [
        "Friction is not parallel to the incline surface.",
        "Normal force is not perpendicular to the incline surface.",
      ],
    });
    expect(result.messages[1]).toMatchObject({
      componentId: "d1",
      validator: "geometry",
      problems: ["Object overlaps existing board content."],
    });
    expect(result.preserve.componentIds).toContain("q1");
    expect(result.preserve.sourceRefs).toEqual([REF]);
  });

  it("writes a prose summary that names the problems and the preserved content without internal ids", () => {
    const result = buildRepairResult(frictionPackage, frictionReport);
    if (result.status !== "needs_repair") throw new Error("expected needs_repair");
    expect(result.text).toContain("d1");
    expect(result.text).toContain("Friction is not parallel to the incline surface.");
    expect(result.text).toContain("Normal force is not perpendicular to the incline surface.");
    expect(result.text).toContain("Object overlaps existing board content.");
    expect(result.text).toContain("q1");
    expect(result.text).toContain(REF);
    expect(result.text).not.toMatch(/doc_|sess_|chunk_/);
  });
});

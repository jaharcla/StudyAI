import { describe, expect, it } from "vitest";
import { enforcePreserveList } from "../src/artifacts/preserve";
import { computePreserveList } from "../src/artifacts/repair-message";
import { applyBoundedRepair } from "../server/artifact-intelligence/repair";
import { parseArtifactPackage } from "../src/artifacts/package";
import type { ValidationReport } from "../src/artifacts/contracts";
import type { ArtifactPackage } from "../src/artifacts/package";

const REF = "studyai://document/module-1/text/4?chunk=0";
const OTHER = "studyai://document/module-1/text/5?chunk=0";

const makePackage = (prompt: string, refs: string[] = [REF], title = "Forces"): ArtifactPackage => parseArtifactPackage({
  schemaVersion: 1,
  id: "preserve-pkg",
  objective: "Friction",
  courseId: "c1",
  lessonId: "l1",
  components: [
    { id: "q1", kind: "question", prompt, answer: "Uphill.", sourceRefs: refs },
    { id: "d1", kind: "diagram", title, sourceRefs: [REF], forces: [{ label: "gravity", components: [0, -9.8] }] },
  ],
}, [REF, OTHER]);

const original = makePackage("Which way does friction act?");
const preserve = computePreserveList(original, {
  ok: false,
  problems: [{ componentId: "d1", validator: "geometry", message: "Overlap.", requestedCorrection: "Fix the diagram component: Overlap." }],
});

const clean: ValidationReport = { ok: true, problems: [] };
const failing: ValidationReport = {
  ok: false,
  problems: [{ componentId: "d1", validator: "geometry", message: "Overlap.", requestedCorrection: "Fix the diagram component: Overlap." }],
};

describe("enforcePreserveList", () => {
  it("accepts a candidate that only changes the failing diagram", () => {
    expect(enforcePreserveList(original, makePackage("Which way does friction act?", [REF], "Updated forces"), preserve)).toEqual({ ok: true });
  });

  it("rejects a candidate that changes the preserved question text", () => {
    const result = enforcePreserveList(original, makePackage("What direction is friction?"), preserve);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.changed).toContain("q1");
  });

  it("rejects a candidate that replaces the citation", () => {
    const result = enforcePreserveList(original, makePackage("Which way does friction act?", [OTHER]), preserve);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.changed.some((entry) => entry.includes("studyai://"))).toBe(true);
  });
});

describe("applyBoundedRepair", () => {
  it("rejects a repaired package that changed a preserved question", async () => {
    const outcome = await applyBoundedRepair({
      pkg: original,
      report: failing,
      callsAlreadyUsed: 1,
      maxProviderCalls: 3,
      repair: async () => makePackage("What direction is friction?"),
      validate: () => clean,
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.report.problems.some((problem) => problem.componentId === "q1" && problem.validator === "preserve-list")).toBe(true);
    }
  });
});

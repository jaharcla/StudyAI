import { describe, expect, it } from "vitest";
import { runBoundedRepair } from "../server/artifact-intelligence/repair";
import { parseArtifactPackage } from "../src/artifacts/package";
import type { ValidationReport } from "../src/artifacts/contracts";
import type { ArtifactPackage } from "../src/artifacts/package";

const REF = "studyai://document/module-1/text/4?chunk=0";

const pkg = parseArtifactPackage({
  schemaVersion: 1,
  id: "repair-pkg",
  objective: "Friction",
  courseId: "c1",
  lessonId: "l1",
  components: [{ id: "q1", kind: "question", prompt: "Which way does friction act?", answer: "Uphill.", sourceRefs: [REF] }],
}, [REF]);

const failing: ValidationReport = {
  ok: false,
  problems: [{ componentId: "q1", validator: "question", message: "Answer is unsupported.", requestedCorrection: "Fix the question component: Answer is unsupported." }],
};
const clean: ValidationReport = { ok: true, problems: [] };

const repaired = (): ArtifactPackage => parseArtifactPackage({
  schemaVersion: 1,
  id: "repair-pkg",
  objective: "Friction",
  courseId: "c1",
  lessonId: "l1",
  components: [{ id: "q1", kind: "question", prompt: "Which way does friction act?", answer: "Uphill, opposing the slide.", sourceRefs: [REF] }],
}, [REF]);

const harness = (validateReport: ValidationReport) => {
  let repairCalls = 0;
  let validateCalls = 0;
  return {
    repair: async () => { repairCalls += 1; return repaired(); },
    validate: () => { validateCalls += 1; return validateReport; },
    calls: () => ({ repairCalls, validateCalls }),
  };
};

describe("runBoundedRepair", () => {
  it("accepts a clean report without invoking repair", async () => {
    const h = harness(clean);
    const outcome = await runBoundedRepair({ pkg, report: clean, callsAlreadyUsed: 1, maxProviderCalls: 3, ...h });
    expect(outcome).toMatchObject({ status: "accepted", calls: 1 });
    expect(h.calls()).toEqual({ repairCalls: 0, validateCalls: 0 });
  });

  it("invokes one repair and accepts a clean second validation", async () => {
    const h = harness(clean);
    const outcome = await runBoundedRepair({ pkg, report: failing, callsAlreadyUsed: 1, maxProviderCalls: 3, ...h });
    expect(outcome).toMatchObject({ status: "accepted", calls: 2 });
    expect(h.calls()).toEqual({ repairCalls: 1, validateCalls: 1 });
  });

  it("reports provider_call_limit honestly when the repair still fails", async () => {
    const h = harness(failing);
    const outcome = await runBoundedRepair({ pkg, report: failing, callsAlreadyUsed: 1, maxProviderCalls: 3, ...h });
    expect(outcome.status).toBe("provider_call_limit");
    expect(outcome).not.toHaveProperty("pkg");
    if (outcome.status === "provider_call_limit") expect(outcome.calls).toBe(2);
    expect(h.calls()).toEqual({ repairCalls: 1, validateCalls: 1 });
  });

  it("does not repair when the provider cap is already reached", async () => {
    const h = harness(clean);
    const outcome = await runBoundedRepair({ pkg, report: failing, callsAlreadyUsed: 3, maxProviderCalls: 3, ...h });
    expect(outcome.status).toBe("provider_call_limit");
    expect(h.calls()).toEqual({ repairCalls: 0, validateCalls: 0 });
  });

  it("honours a cap lower than the default", async () => {
    const h = harness(clean);
    const outcome = await runBoundedRepair({ pkg, report: failing, callsAlreadyUsed: 2, maxProviderCalls: 2, ...h });
    expect(outcome.status).toBe("provider_call_limit");
    expect(h.calls()).toEqual({ repairCalls: 0, validateCalls: 0 });
  });
});

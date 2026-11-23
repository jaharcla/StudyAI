import { buildRepairResult, computePreserveList, type RepairResult } from "../../src/artifacts/repair-message";
import { enforcePreserveList } from "../../src/artifacts/preserve";
import type { ValidationReport } from "../../src/artifacts/contracts";
import type { ArtifactPackage } from "../../src/artifacts/package";
import { getTutorProviderSettings } from "../tutor-provider";

export type RepairOutcome =
  | { status: "accepted"; pkg: ArtifactPackage; calls: number }
  | { status: "rejected"; report: ValidationReport; calls: number }
  | { status: "provider_call_limit"; calls: number; maxCalls: number; reason: string };

export type BoundedRepairInput = {
  pkg: ArtifactPackage;
  report: ValidationReport;
  callsAlreadyUsed: number;
  maxProviderCalls?: number;
  repair: (result: Extract<RepairResult, { status: "needs_repair" }>) => Promise<ArtifactPackage>;
  validate: (pkg: ArtifactPackage) => ValidationReport;
};

/** At most one repair call, only on failure, never past the existing provider cap. No board access. */
export async function runBoundedRepair(input: BoundedRepairInput): Promise<RepairOutcome> {
  const { pkg, report, callsAlreadyUsed, repair, validate } = input;
  if (report.ok) return { status: "accepted", pkg, calls: callsAlreadyUsed };

  const maxCalls = input.maxProviderCalls ?? getTutorProviderSettings().maxProviderCalls;
  if (callsAlreadyUsed >= maxCalls) {
    return {
      status: "provider_call_limit",
      calls: callsAlreadyUsed,
      maxCalls,
      reason: `Provider call cap (${maxCalls}) reached before a repair could be requested. No package was applied.`,
    };
  }

  const result = buildRepairResult(pkg, report);
  if (result.status !== "needs_repair") return { status: "accepted", pkg, calls: callsAlreadyUsed };
  const candidate = await repair(result);
  const calls = callsAlreadyUsed + 1;
  const next = validate(candidate);
  if (next.ok) return { status: "accepted", pkg: candidate, calls };
  return {
    status: "provider_call_limit",
    calls,
    maxCalls,
    reason: "The single allowed repair call still failed validation. No package was applied.",
  };
}

/** Apply path: a repaired package never escapes if it changed a preserved component or citation. */
export async function applyBoundedRepair(input: BoundedRepairInput): Promise<RepairOutcome> {
  const outcome = await runBoundedRepair(input);
  if (outcome.status !== "accepted") return outcome;
  const preserve = computePreserveList(input.pkg, input.report);
  const check = enforcePreserveList(input.pkg, outcome.pkg, preserve);
  if (check.ok) return outcome;
  const report: ValidationReport = {
    ok: false,
    problems: [
      ...input.report.problems,
      {
        componentId: check.changed[0] ?? "composition",
        validator: "preserve-list",
        message: `The repair changed preserved content: ${check.changed.join(", ")}.`,
        requestedCorrection: "Restore the preserved question text and citations before applying the repair.",
      },
    ],
  };
  return { status: "rejected", report, calls: outcome.calls };
}

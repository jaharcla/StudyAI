import type { ValidationReport } from "../../src/artifacts/contracts";

export type RepairDecision = {
  needsRepair: boolean;
  report: ValidationReport;
  preserve: string[];
};

/** One generation plus at most one repair; a second failure is never repaired again. */
export function decideRepair(report: ValidationReport, generationsUsed: number): RepairDecision {
  const preserve = (report as ValidationReport & { preserve?: string[] }).preserve ?? [];
  return {
    needsRepair: !report.ok && generationsUsed < 2,
    report,
    preserve,
  };
}

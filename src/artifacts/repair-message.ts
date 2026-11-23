import type { ValidationReport } from "./contracts";
import type { ArtifactPackage } from "./package";

export type PreserveList = { componentIds: string[]; sourceRefs: string[] };

/** Components with no reported problem, plus every distinct citation, are immutable during repair. */
export function computePreserveList(pkg: ArtifactPackage, report: ValidationReport): PreserveList {
  const failing = new Set(report.problems.map((problem) => problem.componentId));
  const sourceRefs = new Set<string>();
  for (const component of pkg.components) for (const ref of component.sourceRefs) sourceRefs.add(ref);
  return {
    componentIds: pkg.components.filter((component) => !failing.has(component.id)).map((component) => component.id),
    sourceRefs: [...sourceRefs],
  };
}

export type RepairMessage = {
  componentId: string;
  validator: string;
  problems: string[];
  requestedCorrection: string;
};

export type RepairResult =
  | { status: "ok" }
  | { status: "needs_repair"; messages: RepairMessage[]; preserve: PreserveList; text: string };

/** A model-facing, bounded report. It carries component ids and citation refs, never document/session ids. */
export function buildRepairResult(pkg: ArtifactPackage, report: ValidationReport): RepairResult {
  if (report.ok) return { status: "ok" };
  const preserve = computePreserveList(pkg, report);
  const messages: RepairMessage[] = [];
  const index = new Map<string, RepairMessage>();
  for (const problem of report.problems) {
    const key = `${problem.componentId}\u0000${problem.validator}`;
    let message = index.get(key);
    if (!message) {
      message = {
        componentId: problem.componentId,
        validator: problem.validator,
        problems: [],
        requestedCorrection: problem.requestedCorrection,
      };
      index.set(key, message);
      messages.push(message);
    }
    message.problems.push(problem.message);
  }
  const lines = messages.map((message) =>
    `- Component ${message.componentId} (${message.validator}): ${message.problems.join("; ")}. ${message.requestedCorrection}`);
  const text = [
    "Deterministic validation found problems. Repair the named components only.",
    ...lines,
    `Preserve these components unchanged: ${preserve.componentIds.join(", ") || "(none)"}.`,
    `Preserve these citations unchanged: ${preserve.sourceRefs.join(", ") || "(none)"}.`,
  ].join("\n");
  return { status: "needs_repair", messages, preserve, text };
}

import type { ArtifactBrief } from "../canvas/ai/teaching-scene";
import type { LayoutRect } from "../canvas/ai/layout";
import type { ScientificObject } from "../canvas/model";

/** A model-actionable validation finding. `requestedCorrection` is always prose, never a boolean. */
export type ValidationProblem = {
  componentId: string;
  validator: string;
  message: string;
  requestedCorrection: string;
};

export type ValidationReport = { ok: boolean; problems: ValidationProblem[] };

export type ValidationContext = {
  objects: readonly ScientificObject[];
  brief: ArtifactBrief;
  occupancy: readonly LayoutRect[];
  viewport: LayoutRect;
};

export type Validator = {
  id: string;
  appliesTo(object: ScientificObject): boolean;
  check(object: ScientificObject, ctx: ValidationContext): string[];
};

/** Thrown by authoring when deterministic validation fails; the JSON report is attached verbatim. */
export class ArtifactValidationError extends Error {
  readonly report: ValidationReport;
  constructor(report: ValidationReport) {
    super(`Artifact validation failed: ${JSON.stringify(report)}`);
    this.name = "ArtifactValidationError";
    this.report = report;
  }
}

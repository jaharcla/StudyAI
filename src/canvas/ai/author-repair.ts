import type { ArtifactBrief } from "./teaching-scene";
import { stableJson } from "../stable-json";
import type { ValidationReport } from "../../artifacts/contracts";
import { buildRepairResult, type PreservableComponent, type PreserveList, type RepairResult } from "../../artifacts/repair-message";
import { enforcePreserveList, type PreserveCheck } from "../../artifacts/preserve";

export type BriefComponent = PreservableComponent & { content: unknown };

const FIGURE_VALIDATORS = new Set(["force-diagram", "graph", "equation", "mind-map", "geometry"]);

/** Brief-level components use stable ids; generated object ids never reach the model as component ids. */
export function briefComponents(brief: ArtifactBrief): BriefComponent[] {
  const artifact = brief.artifact;
  const components: BriefComponent[] = [];
  const refsFor = (sourceRef?: string): string[] => sourceRef ? [sourceRef] : [...brief.sourceRefs];

  if (artifact.figure) components.push({ id: "figure", sourceRefs: [...brief.sourceRefs], content: { figure: artifact.figure } });
  if (artifact.kind === "problem-set" || artifact.kind === "deck") {
    for (const [index, item] of (artifact.items ?? []).entries()) {
      components.push({
        id: `${artifact.kind === "deck" ? "card" : "item"}-${index + 1}`,
        sourceRefs: refsFor(item.sourceRef),
        content: { prompt: item.prompt, ...(item.answer ? { answer: item.answer } : {}), ...(item.citationLabel ? { citationLabel: item.citationLabel } : {}) },
      });
    }
  } else if (artifact.kind === "question") {
    components.push({ id: "question", sourceRefs: [...brief.sourceRefs], content: { prompt: artifact.prompt, ...(artifact.answer ? { answer: artifact.answer } : {}) } });
  } else if (artifact.kind === "worked-example") {
    components.push({ id: "example", sourceRefs: [...brief.sourceRefs], content: { prompt: artifact.prompt, answer: artifact.answer } });
  }
  return components;
}

/**
 * Identity of the authoring intent. It deliberately excludes question text, citations and figure,
 * because those are the fields a repair may not change (or may legitimately fix). Only a different
 * topic/board/kind starts a fresh attempt sequence.
 */
export function briefRepairSignature(brief: ArtifactBrief): string {
  return stableJson({ boardId: brief.boardId, topic: brief.topic, kind: brief.artifact.kind });
}

function mapComponentId(validator: string, components: readonly BriefComponent[]): string {
  if (FIGURE_VALIDATORS.has(validator) && components.some((component) => component.id === "figure")) return "figure";
  if (validator === "canvas-document") return "bundle";
  return components.find((component) => component.id !== "figure")?.id ?? components[0]?.id ?? "question";
}

export function buildBriefRepairResult(brief: ArtifactBrief, report: ValidationReport): RepairResult {
  if (report.ok) return { status: "ok" };
  const components = briefComponents(brief);
  const mapped: ValidationReport = {
    ok: false,
    problems: report.problems.map((problem) => ({ ...problem, componentId: mapComponentId(problem.validator, components) })),
  };
  return buildRepairResult({ components }, mapped);
}

export function checkBriefPreserve(original: ArtifactBrief, candidate: ArtifactBrief, preserve: PreserveList): PreserveCheck {
  return enforcePreserveList({ components: briefComponents(original) }, { components: briefComponents(candidate) }, preserve);
}

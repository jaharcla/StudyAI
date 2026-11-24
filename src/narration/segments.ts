import { isGeneralLabel, objectTitle } from "../canvas/SceneGlyph";
import type { ScientificObject } from "../canvas/model";
import { vectorMagnitude } from "../science";

export type NarrationGrounding = "board" | "general" | "generated" | "no-evidence";

export type NarrationSegment = {
  id: string;
  objectId: string;
  label: string;
  text: string;
  caption: string;
  grounding: NarrationGrounding;
  groundingLabel: string;
  sourceLabels: string[];
  estimatedMs: number;
};

const ID_FRAGMENT = /\b(?:q|s|g|p|u|c|o|m|mw):[A-Za-z0-9_:-]{3,}/g;

/** Human-facing text never carries scene/node identifiers. */
export function redactIds(value: string): string {
  return value.replace(ID_FRAGMENT, "the referenced canvas item").replace(/\s+/g, " ").trim();
}

function speakable(value: string): string {
  return redactIds(value)
    .replace(/\$\$/g, " ")
    .replace(/\$/g, "")
    .replace(/\\(?:cdot|times)/g, " times ")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1 over $2")
    .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/\^/g, " to the power of ")
    .replace(/_/g, " subscript ")
    .replace(/\s+/g, " ")
    .trim();
}

function detail(object: ScientificObject): string {
  switch (object.kind) {
    case "molecule": return `a molecule with ${object.atoms.length} atoms`;
    case "vector": return `a vector of magnitude ${vectorMagnitude(...object.components).toFixed(2)} ${object.units}`.trim();
    case "force": return `a force of magnitude ${vectorMagnitude(...object.components).toFixed(2)} ${object.units}`.trim();
    case "measurement": return `a measurement of ${object.value} ${object.units}`.trim();
    case "equation": return `an equation: ${speakable(object.expression)}`;
    case "graph": return `a graph of ${speakable(object.expression)} against ${speakable(object.xLabel)}`;
    case "concept": return speakable(object.definition);
    case "question": return speakable(object.prompt);
    case "flashcard": return speakable(object.front);
    case "linked-note":
    case "linked-document": return speakable(object.title);
    case "mindmap": return `a mind map with ${object.nodes.length} nodes`;
    case "anatomy": return object.labels.length ? `labelled ${object.labels.map(speakable).join(", ")}` : "an anatomy label";
    case "relationship": return "a relationship between two objects on your board";
    case "bond": return `a bond labelled ${speakable(object.label)}`;
    case "atom": return `an atom labelled ${speakable(object.label)}`;
  }
}

function grounding(object: ScientificObject): Pick<NarrationSegment, "grounding" | "groundingLabel" | "sourceLabels"> {
  const refs = object.provenance?.sourceRefs ?? [];
  if (isGeneralLabel(object)) return { grounding: "general", groundingLabel: "General label", sourceLabels: [] };
  if (object.provenance?.status === "generated-unverified") {
    if (refs.length === 0) return { grounding: "no-evidence", groundingLabel: "No course evidence", sourceLabels: [] };
    return { grounding: "generated", groundingLabel: "Generated · not verified", sourceLabels: refs.map((_, index) => `Source ${index + 1}`) };
  }
  return { grounding: "board", groundingLabel: "From your board", sourceLabels: [] };
}

/** Deterministic, provider-free walkthrough of the student's own structured objects. */
export function buildNarrationSegments(objects: readonly ScientificObject[]): NarrationSegment[] {
  return objects.map((object, index) => {
    const label = redactIds(objectTitle(object));
    const basis = grounding(object);
    const sourceNote = basis.sourceLabels.length ? ` Course source: ${basis.sourceLabels.join(", ")}.` : "";
    const text = redactIds(`${label}. ${detail(object)}. ${basis.groundingLabel}.${sourceNote}`);
    return {
      id: `segment-${index + 1}`,
      objectId: object.id,
      label,
      text,
      caption: text,
      ...basis,
      estimatedMs: Math.min(120_000, Math.max(4_000, Math.round(text.length / 14 * 1000))),
    };
  });
}

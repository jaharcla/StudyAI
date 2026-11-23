import { z } from "zod";

export type ArtifactCapabilities = {
  readOnly: true;
  applyVerb: "author_board";
  componentKinds: Array<{ kind: string; owner: "canvas" | "studio" | "learning" }>;
  validators: string[];
  maxItems: number;
};

export const artifactCapabilitiesSchema = z.object({}).strict();

/** Advisory descriptor for the model. It cannot read a board, apply an artifact, or change routing. */
export function getArtifactCapabilities(): ArtifactCapabilities {
  return {
    readOnly: true,
    applyVerb: "author_board",
    componentKinds: [
      { kind: "explanation", owner: "canvas" },
      { kind: "worked-example", owner: "canvas" },
      { kind: "diagram", owner: "canvas" },
      { kind: "equation", owner: "canvas" },
      { kind: "graph", owner: "canvas" },
      { kind: "question", owner: "canvas" },
      { kind: "flashcard", owner: "canvas" },
      { kind: "mind-map", owner: "canvas" },
      { kind: "summary", owner: "studio" },
      { kind: "interactive-exercise", owner: "learning" },
    ],
    validators: ["force-diagram", "equation", "graph", "mind-map", "geometry", "canvas-document"],
    maxItems: 8,
  };
}

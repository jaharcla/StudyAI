import type { LayoutRect } from "../canvas/ai/layout";
import type { ArtifactPackage } from "./package";

/**
 * Additive shared contract for every artifact format (spec: artifact-breadth, §1).
 * These are inputs only. Intelligence receives them from the existing retrieval,
 * progress and Canvas layout authorities; it never reads a board, a document
 * table or a provider, and it never writes a board (ADR-artifact-intelligence-system).
 */
export type RetrievedEvidence = {
  ref: string;
  text: string;
  documentId?: string;
  location?: string;
};

export type ConceptState = {
  conceptId: string;
  mastery: number;
  dueCount: number;
};

export type ArtifactFormat =
  | "study-guide"
  | "infographic"
  | "interactive"
  | "audio-script"
  | "video-scene";

export type GenerationContext = {
  courseId: string;
  lessonId: string;
  objective: string;
  intent: string;
  format: ArtifactFormat;
  evidence: readonly RetrievedEvidence[];
  concepts: readonly ConceptState[];
  canvasAnchors?: ReadonlyArray<LayoutRect>;
};

export type OutputPreferences = {
  language?: string;
  showCitations?: boolean;
};

export type RenderContext = {
  pkg: ArtifactPackage;
  preferences: OutputPreferences;
};

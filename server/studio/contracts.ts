import { z } from "zod";

export const StudioKindSchema = z.enum(["mind-map", "study-guide", "infographic", "practice"]);
export type StudioKind = z.infer<typeof StudioKindSchema>;

/**
 * A student's direction can shape presentation, never grounding. Reject text that supplies its
 * own refs, tells the model to ignore course material, or asks it to invent or omit evidence.
 */
const DIRECTION_OVERRIDE = /\bstudyai:\/\/|https?:\/\/|canvas:|\b(?:ignore|disregard|forget|skip)\s+(?:the\s+)?(?:sources?|material|excerpts?|evidence|citations?)\b|\b(?:invent|fabricate|make\s+up|fake)\s+(?:a\s+|the\s+|an\s+)?(?:source|ref|citation|answer|number|fact)\b|\b(?:without|no)\s+citations?\b/i;

export const DirectionSchema = z.string().trim().max(500).refine(
  (value) => !DIRECTION_OVERRIDE.test(value),
  "Direction can shape presentation only; it cannot add sources, answers or numbers outside your course material.",
);

export const GenerateSchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  kind: StudioKindSchema,
  focus: z.string().trim().min(1).max(500).optional().default("Key concepts and mechanisms"),
  direction: DirectionSchema.optional().default(""),
  practiceType: z.enum(["cards", "quiz", "both"]).optional().default("both"),
  count: z.number().int().min(2).max(20).optional().default(10),
}).strict();
export type GenerateInput = z.infer<typeof GenerateSchema>;

export const ImportSchema = z.object({
  artifactId: z.string().min(1),
  cards: z.array(z.number().int().nonnegative()).max(20).optional().default([]),
  questions: z.array(z.number().int().nonnegative()).max(20).optional().default([]),
}).strict();
export type ImportInput = z.infer<typeof ImportSchema>;

export type StudioSource = {
  ref: string;
  documentId: string;
  title: string;
  location: string;
  excerpt: string;
  sourcePage: number | null;
};

export type CanvasKnowledge = {
  ref: string;
  label: string;
  kind: string;
  relations: string[];
};

export type Grounding = {
  focus: string;
  sources: StudioSource[];
  concepts: string[];
  canvas: CanvasKnowledge[];
  packet: string;
};

export type MindMapNode = { id: string; label: string; parentId: string | null; detail?: string; sourceRef?: string };
export type MindMapContent = { title: string; nodes: MindMapNode[] };

export type GuideSection = { heading: string; body: string; sourceRefs: string[] };
export type GuideTerm = { term: string; definition: string; sourceRef: string };
export type StudyGuideContent = { title: string; overview: string; sections: GuideSection[]; keyTerms: GuideTerm[] };

export type PracticeCard = {
  front: string; back: string; concept: string; sourceRef: string;
  sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string;
};
export type PracticeQuestion = {
  concept: string; prompt: string;
  choices: Array<{ id: string; text: string }>;
  correctChoice: string; explanation: string;
  sourceRef: string; sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string;
};
export type PracticeContent = {
  cards: PracticeCard[];
  questions: PracticeQuestion[];
  /** Plain note when the sources supported fewer grounded questions than requested. */
  note?: string;
};

/** The deterministic, locally rendered projection of a package `diagram` component. */
export type InfographicDiagram = {
  title: string;
  surfaceAngleDeg?: number;
  forces: Array<{ label: string; components: [number, number]; position?: { x: number; y: number } }>;
};
export type InfographicContent = {
  title: string;
  objective: string;
  diagram: InfographicDiagram;
  sourceRefs: string[];
};

export type StudioContent = MindMapContent | StudyGuideContent | InfographicContent | PracticeContent;
export type AcceptanceDecision = "pending" | "accept" | "correct" | "decline";

export type StudioArtifact = {
  id: string;
  courseId: string;
  lessonId: string;
  kind: StudioKind;
  title: string;
  content: StudioContent;
  sourceRefs: string[];
  createdAt: string;
  acceptance?: AcceptanceDecision;
  /** Plain-text prompt actually used, so a student can read it back and regenerate. */
  prompt?: string;
};

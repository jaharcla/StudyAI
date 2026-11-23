import { z } from "zod";

export const StudioKindSchema = z.enum(["mind-map", "study-guide", "practice"]);
export type StudioKind = z.infer<typeof StudioKindSchema>;

export const GenerateSchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  kind: StudioKindSchema,
  focus: z.string().trim().min(1).max(500).optional().default("Key concepts and mechanisms"),
  practiceType: z.enum(["cards", "quiz", "both"]).optional().default("both"),
  count: z.number().int().min(2).max(8).optional().default(4),
}).strict();
export type GenerateInput = z.infer<typeof GenerateSchema>;

export const ImportSchema = z.object({
  artifactId: z.string().min(1),
  cards: z.array(z.number().int().nonnegative()).max(8).optional().default([]),
  questions: z.array(z.number().int().nonnegative()).max(8).optional().default([]),
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
export type PracticeContent = { cards: PracticeCard[]; questions: PracticeQuestion[] };

export type StudioContent = MindMapContent | StudyGuideContent | PracticeContent;

export type StudioArtifact = {
  id: string;
  courseId: string;
  lessonId: string;
  kind: StudioKind;
  title: string;
  content: StudioContent;
  sourceRefs: string[];
  createdAt: string;
};

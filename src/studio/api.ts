export type StudioKind = "mind-map" | "study-guide" | "infographic" | "practice";
export type PracticeType = "cards" | "quiz" | "both";

export type MindMapNode = {
  id: string; label: string; parentId: string | null; detail?: string; sourceRef?: string;
  /** Optional: course concept graph adds truthful mastery and a practice action. */
  mastery?: number; lessonId?: string; lessonTitle?: string; canPractice?: boolean; sourceLabel?: string;
};
export type MindMapContent = { title: string; nodes: MindMapNode[]; edges?: Array<{ source: string; target: string; label?: string }> };
export type GuideSection = { heading: string; body: string; sourceRefs: string[] };
export type GuideTerm = { term: string; definition: string; sourceRef: string };
export type StudyGuideContent = { title: string; overview: string; sections: GuideSection[]; keyTerms: GuideTerm[] };
export type PracticeCard = { front: string; back: string; concept: string; sourceRef: string; sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string };
export type PracticeQuestion = {
  concept: string; prompt: string; choices: Array<{ id: string; text: string }>;
  correctChoice: string; explanation: string; sourceRef: string;
  sourceDocumentId: string; sourcePage: number | null; sourceExcerpt: string;
};
export type PracticeContent = { cards: PracticeCard[]; questions: PracticeQuestion[] };

export type InfographicDiagram = {
  title: string;
  surfaceAngleDeg?: number;
  forces: Array<{ label: string; components: [number, number]; position?: { x: number; y: number } }>;
};
export type InfographicContent = { title: string; objective: string; diagram: InfographicDiagram; sourceRefs: string[] };

export type AcceptanceDecision = "pending" | "accept" | "correct" | "decline";

export type StudioArtifact = {
  id: string; courseId: string; lessonId: string; kind: StudioKind; title: string;
  content: MindMapContent | StudyGuideContent | InfographicContent | PracticeContent;
  sourceRefs: string[]; createdAt: string; acceptance?: AcceptanceDecision;
};

export type GenerateRequest = {
  courseId: string; lessonId: string; kind: StudioKind;
  focus: string; practiceType: PracticeType; count: number;
};

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const err = new Error(value.error || "Studio request failed.");
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  return value;
}

export function generateArtifact(input: GenerateRequest): Promise<StudioArtifact> {
  return requestJson<StudioArtifact>("/api/studio/generate", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
}

export function listArtifacts(courseId: string, lessonId: string, kind?: StudioKind): Promise<StudioArtifact[]> {
  const query = new URLSearchParams({ course: courseId, lesson: lessonId });
  if (kind) query.set("kind", kind);
  return requestJson<StudioArtifact[]>(`/api/studio/artifacts?${query}`);
}

export function importPractice(artifactId: string, cards: number[], questions: number[]): Promise<{ cardsAdded: number; questionsAdded: number; errors: string[] }> {
  return requestJson("/api/studio/import", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ artifactId, cards, questions }),
  });
}

/** One accept/correct/decline transaction for the shared studio artifact store. */
export function acceptArtifact(id: string, decision: AcceptanceDecision): Promise<StudioArtifact> {
  return requestJson<StudioArtifact>("/api/studio/accept", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, decision }),
  });
}

export function sourceLabel(ref: string, label?: string): string {
  if (label) return label;
  const match = ref.match(/^studyai:\/\/document\/[^/]+\/(page|slide|text)\/(\d+)/);
  if (!match) return "Canvas knowledge";
  return `${match[1]} ${match[2]}`;
}

export type SlideDeckArtifact = {
  id: string;
  courseId: string;
  lessonId: string;
  kind: "slide_deck";
  title: string;
  content: {
    id: string;
    kind: "slide_deck";
    sourceRefs: string[];
    objective: string;
    templateId: string;
    language: "en";
    slides: Array<{
      role: string;
      title: string;
      claims: Array<{ claim: string; sourceRef: string; excerpt: string; relationship: string }>;
      visual?: { kind: string; altText: string };
      notes?: string;
    }>;
  };
  sourceRefs: string[];
  createdAt: string;
  collection: string;
  filePath: string;
};

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || "Artifact request failed.");
  return value;
}

export function listSlideDecks(courseId: string): Promise<SlideDeckArtifact[]> {
  return requestJson<SlideDeckArtifact[]>(`/api/slide-decks?course=${encodeURIComponent(courseId)}`);
}

export function getSlideDeck(id: string, courseId: string): Promise<SlideDeckArtifact> {
  const query = new URLSearchParams({ id, course: courseId });
  return requestJson<SlideDeckArtifact>(`/api/slide-decks/artifact?${query}`);
}

export function downloadSlideDeckUrl(id: string, courseId: string): string {
  const query = new URLSearchParams({ id, course: courseId });
  return `/api/slide-decks/download?${query}`;
}

export function updateSlideDeck(id: string, courseId: string, patch: { title: string; collection: string }): Promise<SlideDeckArtifact> {
  return requestJson<SlideDeckArtifact>("/api/slide-decks/artifact", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, courseId, ...patch }),
  });
}

export function deleteSlideDeck(id: string, courseId: string): Promise<{ deleted: boolean }> {
  const query = new URLSearchParams({ id, course: courseId });
  return requestJson<{ deleted: boolean }>(`/api/slide-decks/artifact?${query}`, { method: "DELETE" });
}

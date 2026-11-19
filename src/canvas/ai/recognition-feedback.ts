export type RecognitionFeedbackDecision = "accept" | "reject" | "correct";

export type RecognitionScope = { boardId: string; courseId: string; lessonId: string };

export type TeachDrawingResult = { label: string; examples: number };

export type RecognitionFeedbackResult = {
  status: "saved";
  decision: RecognitionFeedbackDecision;
  groupKey: string;
  prototype: "updated" | "skipped";
  warnings: string[];
};

/** Stable key for one stroke group: sorted unique Quickdraw stroke IDs. */
export function recognitionSourceKey(sourceIds: readonly string[]): string {
  return [...new Set(sourceIds)].filter(Boolean).sort().join("|");
}

async function post<T>(url: string, payload: unknown, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Recognition request failed with HTTP ${response.status}.`);
  return body as T;
}

export async function teachSelectedDrawing(scope: RecognitionScope, strokeIds: readonly string[], label: string, fetcher: typeof fetch = fetch): Promise<TeachDrawingResult> {
  return post(`/api/canvases/${encodeURIComponent(scope.boardId)}/recognition/teach`, { courseId: scope.courseId, lessonId: scope.lessonId, strokeIds: [...strokeIds], label }, fetcher);
}

export async function submitRecognitionFeedback(scope: RecognitionScope, input: { strokeIds: readonly string[]; decision: RecognitionFeedbackDecision; label?: string }, fetcher: typeof fetch = fetch): Promise<RecognitionFeedbackResult> {
  return post(`/api/canvases/${encodeURIComponent(scope.boardId)}/recognition/feedback`, { courseId: scope.courseId, lessonId: scope.lessonId, strokeIds: [...input.strokeIds], decision: input.decision, ...(input.label ? { label: input.label } : {}) }, fetcher);
}

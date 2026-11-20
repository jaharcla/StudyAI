import type { CanvasChunk, CanvasReasoningState } from "./types.js";

const DELTA_SHAPE = `{
  "coveredChunkId": string,
  "entitiesToAdd": [{ "label": string, "kind": string, "regionId": string, "evidence": string[] }],
  "claimsToAdd": [{ "subject": string, "relation": string, "object": string, "value": string, "status": "observed"|"inferred"|"user", "confidence": number, "evidence": string[] }],
  "contradictions": [{ "claimIds": string[], "reason": string }],
  "unresolved": [{ "question": string, "relatedIds": string[] }],
  "confidence": number
}`;

export const REASONING_SYSTEM_PROMPT = [
  "You maintain a tutor's structured understanding of a hand-drawn canvas.",
  "You receive the current understanding and exactly one region of the board.",
  "Revise the understanding freely. Do not repeat a prior claim unless this region's evidence supports it.",
  "Never invent canvas ids. Every claim and entity must cite ids from this region's sourceIds list.",
  "An absence claim (\"there is no X here\") is allowed only for the region you were given, never for the whole board.",
  "Keep observed, inferred, and user-confirmed claims distinct in the status field.",
  "Record a contradiction instead of overwriting an earlier claim you now doubt.",
  "Reply with only JSON, no prose and no code fence, matching this shape:",
  DELTA_SHAPE,
].join("\n");

function parseDetail(detail: string): unknown {
  try {
    return JSON.parse(detail);
  } catch {
    return detail;
  }
}

export function buildReasoningPrompt(state: CanvasReasoningState, chunk: CanvasChunk): string {
  return JSON.stringify({
    boardId: state.boardId,
    revisionHash: state.revisionHash,
    question: state.question,
    chunk: {
      id: chunk.id,
      bounds: chunk.bounds,
      labels: chunk.labels,
      sourceIds: chunk.sourceIds,
      detail: parseDetail(chunk.detail),
    },
    currentUnderstanding: {
      entities: state.entities.slice(0, 100),
      claims: state.claims.slice(0, 200),
      contradictions: state.contradictions,
      unresolved: state.unresolved,
      coveredChunks: state.coveredChunks,
    },
  });
}

export function repairPrompt(prompt: string, message: string): string {
  return `${prompt}\n\nYour previous reply could not be parsed as the required JSON: ${message}\nReturn only the JSON object.`;
}

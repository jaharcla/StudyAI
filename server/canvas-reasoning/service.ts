import { z } from "zod";
import { buildReasoningPrompt, REASONING_SYSTEM_PROMPT, repairPrompt } from "./prompts.js";
import { mergeDelta } from "./state.js";
import { CanvasReasoningDeltaSchema, type CanvasChunk, type CanvasReasoningDelta, type CanvasReasoningState } from "./types.js";

export type ReasoningCall = (input: { system: string; prompt: string }) => Promise<unknown>;

export type ReasoningPassResult = { delta: CanvasReasoningDelta; callCount: number };

/** The model never chooses the covered chunk, so the field is optional on the wire. */
const ResponseSchema = CanvasReasoningDeltaSchema.extend({ coveredChunkId: z.string().optional() });

class DeltaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeltaParseError";
  }
}

function extractJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(value);
  return JSON.parse((fenced ? fenced[1] : value).trim()) as unknown;
}

/**
 * Keeps only what the region can support: evidence must be drawn from this chunk,
 * and the chunk id is assigned here rather than trusted from the model.
 */
function sanitize(data: z.infer<typeof ResponseSchema>, chunk: CanvasChunk): CanvasReasoningDelta {
  const sourceIds = new Set(chunk.sourceIds);
  const supported = (evidence: readonly string[]) => evidence.length > 0 && evidence.every((id) => sourceIds.has(id));

  return {
    coveredChunkId: chunk.id,
    entitiesToAdd: data.entitiesToAdd.filter((entity) => supported(entity.evidence)),
    claimsToAdd: data.claimsToAdd.filter((claim) => supported(claim.evidence)),
    contradictions: data.contradictions.filter((entry) => entry.claimIds.length >= 2),
    unresolved: data.unresolved.map((item) => ({ ...item, relatedIds: item.relatedIds.filter((id) => sourceIds.has(id)) })),
    confidence: data.confidence,
  };
}

async function requestDelta(input: { call: ReasoningCall; chunk: CanvasChunk; prompt: string }): Promise<CanvasReasoningDelta> {
  const raw = await input.call({ system: REASONING_SYSTEM_PROMPT, prompt: input.prompt });
  let extracted: unknown;
  try {
    extracted = extractJson(raw);
  } catch (error) {
    throw new DeltaParseError(error instanceof Error ? error.message : "The reply was not JSON.");
  }
  const parsed = ResponseSchema.safeParse(extracted);
  if (!parsed.success) throw new DeltaParseError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; "));
  return sanitize(parsed.data, input.chunk);
}

/**
 * Runs one reasoning pass against one chunk.
 *
 * A malformed reply is repaired once; a second malformed reply is an error the
 * caller falls back from. Transport failures are never retried here.
 */
export async function runReasoningPass(input: { state: CanvasReasoningState; chunk: CanvasChunk; call: ReasoningCall; signal?: AbortSignal }): Promise<ReasoningPassResult> {
  if (input.signal?.aborted) throw new Error("Canvas reasoning aborted before the pass started.");
  const prompt = buildReasoningPrompt(input.state, input.chunk);

  try {
    return { delta: await requestDelta({ call: input.call, chunk: input.chunk, prompt }), callCount: 1 };
  } catch (error) {
    if (!(error instanceof DeltaParseError)) throw error;
    if (input.signal?.aborted) throw new Error("Canvas reasoning aborted before the repair pass.");
    const repaired = repairPrompt(prompt, error.message);
    try {
      return { delta: await requestDelta({ call: input.call, chunk: input.chunk, prompt: repaired }), callCount: 2 };
    } catch (retryError) {
      if (retryError instanceof DeltaParseError) throw new DeltaParseError("The reasoning reply could not be parsed as the required JSON after one repair attempt.");
      throw retryError;
    }
  }
}


/** Chunks below this relevance are optional context and never force another pass. */
export const RELEVANCE_FLOOR = 0.5;
export const DEFAULT_MAX_PASSES = 6;
const MAX_ANSWER_CONTEXT_CHARS = 6_000;

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length > 1));
}

function criticalUnresolved(state: CanvasReasoningState, chunks: readonly CanvasChunk[], covered: ReadonlySet<string>) {
  const questionTokens = tokenSet(state.question);
  const pendingSources = new Set(chunks.filter((chunk) => !covered.has(chunk.id) && (chunk.relevance ?? 0) >= RELEVANCE_FLOOR).flatMap((chunk) => chunk.sourceIds));
  return state.unresolved.filter((item) => {
    if (item.relatedIds.some((id) => pendingSources.has(id))) return true;
    return [...tokenSet(item.question)].some((token) => questionTokens.has(token));
  });
}

/** Compact projection of the state, bounded to the tutor's context allowance. */
export function buildAnswerContext(state: CanvasReasoningState): string {
  const claims = state.claims.map((claim) => ({
    subject: claim.subject,
    relation: claim.relation,
    object: claim.object,
    value: claim.value,
    status: claim.status,
    confidence: claim.confidence,
    evidence: claim.evidence.slice(0, 8),
  }));
  const confidence = claims.length ? Math.round((claims.reduce((total, claim) => total + claim.confidence, 0) / claims.length) * 100) / 100 : 0;
  const payload = {
    boardId: state.boardId,
    revisionHash: state.revisionHash,
    question: state.question,
    claims,
    contradictions: state.contradictions,
    unresolved: state.unresolved,
    confidence,
    needsUser: state.needsUser === true,
  };
  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_ANSWER_CONTEXT_CHARS && payload.claims.length > 0) {
    payload.claims.pop();
    serialized = JSON.stringify(payload);
  }
  return serialized;
}

/**
 * Reads the board one chunk at a time, merging each pass into the state.
 *
 * Runs sequentially: the local provider queues calls anyway, and a shared state
 * is the point of the design. Stops when no relevant chunk is left and no
 * question-critical item is open.
 */
export async function reasonOverCanvas(input: {
  boardId: string;
  revisionHash: string;
  question: string;
  chunks: readonly CanvasChunk[];
  call: ReasoningCall;
  maxPasses?: number;
  signal?: AbortSignal;
}): Promise<{ state: CanvasReasoningState; answerContext: string; calls: number; exhausted: boolean }> {
  const maxPasses = input.maxPasses ?? DEFAULT_MAX_PASSES;
  const ranked = input.chunks.map((chunk, index) => ({ chunk, index })).sort((left, right) => (right.chunk.relevance ?? 0) - (left.chunk.relevance ?? 0) || left.index - right.index);
  // A generic question ("explain this board") matches no labels. Rather than doing
  // nothing on a large board, always reason about at least the best chunk.
  const targets = ranked.some((entry) => (entry.chunk.relevance ?? 0) >= RELEVANCE_FLOOR)
    ? ranked.filter((entry) => (entry.chunk.relevance ?? 0) >= RELEVANCE_FLOOR)
    : ranked.slice(0, 1);

  let state: CanvasReasoningState = {
    schemaVersion: 1,
    boardId: input.boardId,
    revisionHash: input.revisionHash,
    question: input.question,
    entities: [],
    claims: [],
    contradictions: [],
    unresolved: [],
    coveredChunks: [],
    calls: 0,
  };
  let calls = 0;
  let budgetHit = false;

  for (;;) {
    if (input.signal?.aborted) throw new Error("Canvas reasoning aborted.");
    const covered = new Set(state.coveredChunks);
    const next = targets.find((entry) => !covered.has(entry.chunk.id));
    if (!next) break;
    if (calls >= maxPasses) {
      budgetHit = true;
      break;
    }
    const result = await runReasoningPass({ state, chunk: next.chunk, call: input.call, signal: input.signal });
    calls += result.callCount;
    state = mergeDelta(state, result.delta, new Set(next.chunk.sourceIds));
  }

  const coveredAfter = new Set(state.coveredChunks);
  const critical = criticalUnresolved(state, input.chunks, coveredAfter);
  const relevantUncovered = targets.some((entry) => !coveredAfter.has(entry.chunk.id));

  state = { ...state, calls, needsUser: critical.length > 0 };
  return { state, answerContext: buildAnswerContext(state), calls, exhausted: budgetHit || relevantUncovered || critical.length > 0 };
}


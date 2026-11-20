import { z } from "zod";
import { buildReasoningPrompt, REASONING_SYSTEM_PROMPT, repairPrompt } from "./prompts.js";
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


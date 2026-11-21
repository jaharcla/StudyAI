/**
 * Typed failure and provider contract for Canvas Intelligence.
 *
 * Additive only: this module re-expresses the observed provider chain and
 * failure taxonomy as testable domain types. It does not replace the OCR,
 * structure, fusion, or scene authorities, and it does not change any
 * existing provider resolver.
 */
import {
  providerConfigured,
  resolveCompletionProviders,
  resolveMathOCRProviders,
  resolveVisionProviders,
  type CanvasProviderId,
} from "./providers.js";

export type FailureKind =
  | "auth" | "quota" | "rate_limit" | "network" | "model_missing"
  | "unsupported" | "credit" | "truncated" | "incomplete" | "unknown";

export type StageId = "ocr" | "structure" | "fusion" | "recognition";
export type Tier = "fast" | "strong";

export type FailureDetail = {
  partialText: string | null;
  reasoning: boolean;
  finishReason: string | null;
  upstreamProvider: string | null;
  cappedTo: number | null;
  retryAfterSeconds: number | null;
  topUpUrl: string | null;
};

export type CanvasFailure = {
  kind: FailureKind;
  stage: StageId;
  message: string;
  detail: FailureDetail;
  retryable: boolean;
};

export type ProviderCapabilities = {
  completion: boolean;
  vision: boolean;
  structuredOutput: boolean;
  streaming: boolean;
};

export type StageInvocation = {
  stage: StageId;
  provider: CanvasProviderId | "local";
  model: string;
  tier: Tier;
  capabilities: ProviderCapabilities;
  fallbacksUsed: string[];
  failure: CanvasFailure | null;
};

const DEFAULT_CAPABILITIES: ProviderCapabilities = { completion: true, vision: true, structuredOutput: true, streaming: true };

export function providerCapabilities(provider: CanvasProviderId | "local"): ProviderCapabilities {
  if (provider === "ollama" || provider === "local") return { completion: true, vision: true, structuredOutput: false, streaming: false };
  return { ...DEFAULT_CAPABILITIES };
}

export function failure(kind: FailureKind, stage: StageId, message: string, detail: Partial<FailureDetail> = {}): CanvasFailure {
  const full: FailureDetail = {
    partialText: null, reasoning: false, finishReason: null, upstreamProvider: null,
    cappedTo: null, retryAfterSeconds: null, topUpUrl: null, ...detail,
  };
  return { kind, stage, message, detail: full, retryable: isRetryableKind(kind) };
}

function isRetryableKind(kind: FailureKind): boolean {
  return kind === "rate_limit" || kind === "network";
}

export function isRetryableFailure(value: CanvasFailure): boolean {
  return value.retryable;
}

/** Only a clean stop is a whole answer. Every other finish reason is typed. */
export function mapFinishReason(
  finishReason: string | null | undefined,
  detail: Partial<FailureDetail> = {},
): CanvasFailure | null {
  if (finishReason === "stop" || finishReason === "end_turn") return null;
  if (finishReason === "length" || finishReason === "max_tokens") {
    return failure("truncated", "fusion", "The model stopped at the output cap.", { ...detail, finishReason: finishReason ?? null, reasoning: true });
  }
  return failure("incomplete", "fusion", `The model did not finish cleanly (${finishReason ?? "no finish reason"}).`, { ...detail, finishReason: finishReason ?? null });
}

export function mapHttpStatus(status: number, retryAfterSeconds: number | null = null): CanvasFailure | null {
  if (status >= 200 && status < 300) return null;
  const detail = { retryAfterSeconds };
  if (status === 401 || status === 403) return failure("auth", "ocr", `Provider rejected the credential (HTTP ${status}).`, detail);
  if (status === 402) return failure("credit", "ocr", `Provider requires credit (HTTP ${status}).`, { ...detail, topUpUrl: null });
  if (status === 404) return failure("model_missing", "ocr", `Provider does not expose the requested model (HTTP ${status}).`, detail);
  if (status === 429) return failure("rate_limit", "ocr", `Provider rate limit reached (HTTP ${status}).`, detail);
  if (status === 408 || status >= 500) return failure("network", "ocr", `Provider temporarily unavailable (HTTP ${status}).`, detail);
  if (status === 400) return failure("unsupported", "ocr", `Provider rejected the request (HTTP ${status}).`, detail);
  return failure("unknown", "ocr", `Unexpected provider status ${status}.`, detail);
}

export type StageResolutionOptions = {
  stage: StageId;
  tier?: Tier;
  env?: NodeJS.ProcessEnv;
  capabilities?: Partial<Record<CanvasProviderId | "local", ProviderCapabilities>>;
};

/**
 * One facade over the four existing resolvers. Capability filtering is
 * explicit and testable instead of being a side effect of resolver order.
 */
export function resolveStageProviders(options: StageResolutionOptions): CanvasProviderId[] {
  const env = options.env ?? process.env;
  const base = options.stage === "ocr" ? resolveMathOCRProviders(env)
    : options.stage === "recognition" ? []
    : resolveCompletionProviders(env);
  const needs = (id: CanvasProviderId) => {
    const caps = options.capabilities?.[id] ?? providerCapabilities(id);
    if (options.stage === "ocr") return caps.vision;
    if (options.stage === "structure" || options.stage === "fusion") return caps.completion;
    return true;
  };
  const filtered = base.filter(needs);
  if (filtered.length) return filtered;
  if (options.stage === "ocr") {
    const vision = resolveVisionProviders(env).filter((id) => providerConfigured(id, env) && needs(id));
    if (vision.length) return vision;
  }
  return filtered;
}

export type StageProvenance = {
  provider: "quickdraw" | "local" | "groq" | "system" | "opencode-go" | "openrouter" | "gemini" | "openai-compatible";
  model: string | null;
  method: string;
};

/** Replace the "system" placeholder with the effective provider of the stage. */
export function provenanceForStage(stage: StageId, invocations: readonly StageInvocation[]): StageProvenance {
  const invocation = [...invocations].reverse().find((item) => item.stage === stage);
  if (!invocation) return { provider: "system", model: null, method: `Canvas Intelligence ${stage} stage; no provider invocation was recorded` };
  const provider = invocation.provider === "ollama" || invocation.provider === "local" ? "local" : invocation.provider;
  return {
    provider,
    model: invocation.model || null,
    method: `Canvas Intelligence ${stage} stage via ${invocation.provider}${invocation.fallbacksUsed.length ? ` (fallback: ${invocation.fallbacksUsed.join(", ")})` : ""}`,
  };
}

/** A partial result must always carry at least one typed failure with a reason. */
export function failureForWarning(stage: StageId, warning: string): CanvasFailure {
  const lower = warning.toLowerCase();
  const kind: FailureKind = lower.includes("rate") || lower.includes("429") ? "rate_limit"
    : lower.includes("unavailable") || lower.includes("network") || lower.includes("503") ? "network"
    : lower.includes("cap") || lower.includes("truncat") ? "truncated"
    : lower.includes("auth") || lower.includes("401") || lower.includes("403") ? "auth"
    : "incomplete";
  return failure(kind, stage, warning, { partialText: null });
}

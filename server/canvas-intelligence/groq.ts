import { normalizeOCRResponse, normalizeOCRText } from "./ocr.js";
import { ollamaJson, ollamaText } from "./ollama.js";
import { openAiCompatibleJson, openAiCompatibleOCR } from "./openai-compatible.js";
import { allowProviderRequest } from "./provider-budget.js";
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess, recordProviderUsage } from "./provider-usage.js";
import {
  canvasInferenceMode,
  canvasOCRMode,
  cloudOCRTimeoutMs,
  diagramOCRModelFor,
  geminiBaseUrl,
  geminiModel,
  mathOCRModelFor,
  canvasOmnirouteModel,
  omnirouteApiKey,
  omnirouteBaseUrl,
  opencodeGoBaseUrl,
  opencodeGoModel,
  opencodeGoOCRModel,
  opencodeGoSession,
  openRouterBaseUrl,
  openRouterModel,
  openRouterOCRModel,
  resolveCompletionProviders,
  resolveDiagramOCRProviders,
  resolveMathOCRProviders,
  resolveVisionProviders,
  type CanvasProviderId,
} from "./providers.js";
import type { OCRResult } from "./types.js";
import { z } from "zod";

export type CanvasOCRProvider = ReturnType<typeof canvasOCRMode>;
export type CanvasInferenceProvider = ReturnType<typeof canvasInferenceMode>;

export function canvasOCRProvider(env: NodeJS.ProcessEnv = process.env): CanvasOCRProvider {
  return canvasOCRMode(env);
}

export function canvasInferenceProvider(env: NodeJS.ProcessEnv = process.env): CanvasInferenceProvider {
  return canvasInferenceMode(env);
}

export const groqOCRModel = (env: NodeJS.ProcessEnv = process.env) => env.CANVAS_GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
export const groqInferenceModel = (env: NodeJS.ProcessEnv = process.env) => env.CANVAS_GROQ_MODEL || env.GROQ_MODEL || "openai/gpt-oss-120b";
const issued: number[] = [];
const fallbackEvents: string[] = [];

export function resetProviderFallbacks() { fallbackEvents.length = 0; }
export function consumeProviderFallbacks() { return fallbackEvents.splice(0, 8); }

type GroqInferenceOptions = { model: string; system: string; prompt: string; baseUrl?: string; signal?: AbortSignal; fetcher?: typeof fetch; onFallback?: () => void };

const OCR_SYSTEM = "Transcribe visible handwritten scientific text only. Return JSON {items:[{text,kind,confidence,alternatives}],uncertain:boolean}. Each kind is word, symbol, number, equation, or unknown. Use null for uncalibrated confidence. Do NOT infer a label's arrow or position. Do NOT fabricate pixel coordinates or object IDs.";
const DIAGRAM_OCR_SYSTEM = OCR_SYSTEM + " When two symbols are stacked with a visible horizontal bar between them, transcribe the pair as a fraction of the two symbols (for example F/N), reading the symbol above the bar first; do not insert unrelated letters between the symbol and the bar.";
const OCR_PROMPT = "Extract actual visible characters, one JSON item per label or expression. Return only JSON.";
const MATH_OCR_SYSTEM = "Transcribe the handwritten mathematical expression in the image as LaTeX. Preserve fractions, roots, sums, integrals, subscripts, superscripts, Greek letters, delimiters, and grouping. This expression is mathematical handwriting, not prose: Greek letters are common and Latin lookalikes are rare. Read a u-shaped glyph with a descender as \\mu, and an epsilon-like or o-like glyph in a fraction as \\sigma. Prefer the Greek reading whenever the glyph is ambiguous. Return only the LaTeX expression, with no explanation or markdown fences.";
const MATH_OCR_PROMPT = "Write the visible handwritten mathematical expression as one LaTeX string. Do not describe the image.";

function providerLabel(provider: CanvasProviderId) {
  return provider === "opencode-go" ? "OpenCode Go" : provider === "openrouter" ? "OpenRouter" : provider === "gemini" ? "Google AI Studio" : provider === "groq" ? "Groq" : provider === "openai-compatible" ? "OpenAI-compatible" : "Ollama";
}

function cloudHeaders(provider: CanvasProviderId): Record<string, string> {
  if (provider === "opencode-go") return { "x-opencode-session": opencodeGoSession() };
  if (provider === "openrouter") return { "HTTP-Referer": "http://127.0.0.1:5183", "X-Title": "StudyAI MK3" };
  return {};
}

function cloudBaseUrl(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoBaseUrl();
  if (provider === "gemini") return geminiBaseUrl();
  if (provider === "openai-compatible") return omnirouteBaseUrl();
  return openRouterBaseUrl();
}

function cloudApiKey(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return process.env.OPENCODE_GO_API_KEY ?? "";
  if (provider === "gemini") return process.env.GOOGLE_AI_API_KEY ?? "";
  if (provider === "openai-compatible") return omnirouteApiKey();
  return process.env.OPENROUTER_API_KEY ?? "";
}

function cloudModel(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoModel();
  if (provider === "gemini") return geminiModel();
  if (provider === "openai-compatible") return canvasOmnirouteModel();
  return openRouterModel();
}

function cloudOCRModel(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoOCRModel();
  if (provider === "gemini") return geminiModel();
  if (provider === "openai-compatible") return canvasOmnirouteModel();
  return openRouterOCRModel();
}

export async function canvasInferenceJson<T>(options: GroqInferenceOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  const providers = resolveCompletionProviders();
  if (!providers.length) throw new Error("No canvas provider is configured. Set GROQ_API_KEY, OPENCODE_GO_API_KEY, or OPENROUTER_API_KEY.");
  const attempts: string[] = [];
  let fellBack = false;
  // A result produced after an earlier provider failed is a fallback result:
  // callers must not cache it under the healthy provider's key (canvas-recovery).
  const settle = <V>(value: V): V => { if (fellBack) options.onFallback?.(); return value; };
  for (const provider of providers) {
    if (providers.length > 1 && isProviderCircuitOpen(provider)) {
      attempts.push(`${providerLabel(provider)}: circuit breaker open`);
      logFallback("text", provider, new Error("circuit breaker open"));
      fellBack = true;
      continue;
    }
    const callStarted = Date.now();
    if (provider === "groq") {
      try {
        const result = await groqJson({ ...options, model: groqInferenceModel() }, schema, normalize);
        recordProviderSuccess("groq");
        logProviderCall("text", "groq", groqInferenceModel(), Date.now() - callStarted, "ok");
        return settle(result);
      } catch (error) {
        recordProviderFailure("groq", message(error));
        logProviderCall("text", "groq", groqInferenceModel(), Date.now() - callStarted, "error", message(error));
        if (providers.length === 1) throw error;
        attempts.push(`Groq: ${message(error)}`);
        logFallback("text", "groq", error);
        fellBack = true;
        continue;
      }
    }
    if (provider === "ollama") {
      try {
        const result = await ollamaJson(options, schema, normalize);
        recordProviderSuccess("ollama");
        logProviderCall("text", "ollama", options.model, Date.now() - callStarted, "ok");
        return settle(result);
      } catch (error) {
        recordProviderFailure("ollama", message(error));
        logProviderCall("text", "ollama", options.model, Date.now() - callStarted, "error", message(error));
        if (providers.length === 1) throw error;
        attempts.push(`Ollama: ${message(error)}`);
        logFallback("text", "ollama", error);
        fellBack = true;
        continue;
      }
    }
    if (!allowProviderRequest(provider)) { attempts.push(`${providerLabel(provider)}: daily request budget exhausted`); logFallback("text", provider, new Error("daily request budget exhausted")); fellBack = true; continue; }
    const model = cloudModel(provider);
    try {
      const result = await openAiCompatibleJson({
        baseUrl: cloudBaseUrl(provider),
        apiKey: cloudApiKey(provider),
        model,
        provider,
        headers: cloudHeaders(provider),
        system: options.system,
        prompt: options.prompt,
        fetcher: options.fetcher,
        signal: options.signal,
      }, schema, normalize);
      recordProviderSuccess(provider);
      logProviderCall("text", provider, model, Date.now() - callStarted, "ok");
      return settle(result);
    } catch (error) {
      recordProviderFailure(provider, message(error));
      logProviderCall("text", provider, model, Date.now() - callStarted, "error", message(error));
      if (providers.length === 1) throw error;
      attempts.push(`${providerLabel(provider)}: ${message(error)}`);
      logFallback("text", provider, error);
      fellBack = true;
    }
  }
  throw new Error(`All canvas providers failed: ${attempts.join("; ")}`);
}

export function isImageEgressAllowed(allowImageEgress?: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (allowImageEgress === false) return false;
  const raw = (env.CANVAS_ALLOW_IMAGE_EGRESS ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

export async function canvasOCR(input: { base64: string; mimeType?: string; model?: string; profile?: "general" | "math" | "diagram"; allowImageEgress?: boolean; fetcher?: typeof fetch; signal?: AbortSignal; onFallback?: () => void }): Promise<OCRResult> {
  const profile = input.profile ?? "general";
  const math = profile === "math";
  const diagram = profile === "diagram";
  const allowEgress = isImageEgressAllowed(input.allowImageEgress);
  const rawProviders = math ? resolveMathOCRProviders() : diagram ? resolveDiagramOCRProviders() : resolveVisionProviders();
  const providers = allowEgress ? rawProviders : rawProviders.filter((provider) => provider === "ollama");
  if (!providers.length) {
    if (!allowEgress) throw new Error("Cloud canvas image egress is disabled (CANVAS_ALLOW_IMAGE_EGRESS=0 or user opt-out) and no local OCR provider is configured.");
    throw new Error("No canvas OCR provider is configured. Set GROQ_API_KEY, OPENCODE_GO_API_KEY, OPENROUTER_API_KEY, or configure OMNIROUTE_BASE_URL.");
  }
  const system = math ? MATH_OCR_SYSTEM : diagram ? DIAGRAM_OCR_SYSTEM : OCR_SYSTEM;
  const prompt = math ? MATH_OCR_PROMPT : OCR_PROMPT;
  const format = math ? "latex" as const : "json" as const;
  const attempts: string[] = [];
  let fellBack = false;
  // Same rule as canvasInferenceJson: a fallback result must not be cached as
  // if it came from the preferred provider.
  const settle = <V>(value: V): V => { if (fellBack) input.onFallback?.(); return value; };
  for (const provider of providers) {
    if (providers.length > 1 && isProviderCircuitOpen(provider)) {
      attempts.push(`${providerLabel(provider)}: circuit breaker open`);
      logFallback("ocr", provider, new Error("circuit breaker open"));
      fellBack = true;
      continue;
    }
    const callStarted = Date.now();
    if (provider === "groq") {
      const model = math ? mathOCRModelFor("groq") : diagram ? diagramOCRModelFor("groq") : groqOCRModel();
      try {
        const result = await groqOCR({ base64: input.base64, mimeType: input.mimeType, fetcher: input.fetcher, signal: input.signal, system, prompt, format, ...(model ? { model } : {}) });
        recordProviderSuccess("groq");
        logProviderCall("ocr", "groq", model, Date.now() - callStarted, "ok");
        return settle(result);
      } catch (error) {
        recordProviderFailure("groq", message(error));
        logProviderCall("ocr", "groq", model, Date.now() - callStarted, "error", message(error));
        if (providers.length === 1) throw error;
        attempts.push(`Groq: ${message(error)}`);
        logFallback("ocr", "groq", error);
        fellBack = true;
        continue;
      }
    }
    if (provider === "ollama") {
      const model = math ? mathOCRModelFor("ollama") : diagram ? diagramOCRModelFor("ollama") : input.model || process.env.CANVAS_OCR_MODEL || "glm-ocr:q8_0";
      try {
        const text = await ollamaText({ model, image: input.base64, system, prompt, fetcher: input.fetcher, signal: input.signal });
        recordProviderSuccess("ollama");
        logProviderCall("ocr", "ollama", model, Date.now() - callStarted, "ok");
        return settle(math ? latexOCRResult(text) : normalizeOCRText(text));
      } catch (error) {
        recordProviderFailure("ollama", message(error));
        logProviderCall("ocr", "ollama", model, Date.now() - callStarted, "error", message(error));
        if (providers.length === 1) throw error;
        attempts.push(`Ollama: ${message(error)}`);
        logFallback("ocr", "ollama", error);
        fellBack = true;
        continue;
      }
    }
    if (!allowProviderRequest(provider)) { attempts.push(`${providerLabel(provider)}: daily request budget exhausted`); logFallback("ocr", provider, new Error("daily request budget exhausted")); fellBack = true; continue; }
    const model = math ? mathOCRModelFor(provider) : diagram ? diagramOCRModelFor(provider) : cloudOCRModel(provider);
    try {
      const result = await openAiCompatibleOCR({
        baseUrl: cloudBaseUrl(provider),
        apiKey: cloudApiKey(provider),
        model,
        provider,
        timeoutMs: cloudOCRTimeoutMs(),
        headers: cloudHeaders(provider),
        system,
        prompt,
        format,
        base64: input.base64,
        mimeType: input.mimeType,
        fetcher: input.fetcher,
        signal: input.signal,
      });
      recordProviderSuccess(provider);
      logProviderCall("ocr", provider, model, Date.now() - callStarted, "ok");
      return settle(result);
    } catch (error) {
      recordProviderFailure(provider, message(error));
      logProviderCall("ocr", provider, model, Date.now() - callStarted, "error", message(error));
      if (providers.length === 1) throw error;
      attempts.push(`${providerLabel(provider)}: ${message(error)}`);
      logFallback("ocr", provider, error);
      fellBack = true;
    }
  }
  throw new Error(`All canvas OCR providers failed: ${attempts.join("; ")}`);
}

function latexOCRResult(text: string): OCRResult {
  const cleaned = text.replace(/```(?:latex|tex)?/gi, "").replace(/\$\$?/g, "").replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  if (!cleaned) throw new Error("Canvas provider returned no LaTeX");
  return { items: [{ text: cleaned, kind: "equation", confidence: null, alternatives: [], sourceIds: [], imageRegion: null, sourceRegionId: null, worldRegion: null, locationPrecision: "unknown", uncertain: true }], uncertain: true, raw: text };
}

async function groqJson<T>(options: GroqInferenceOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const timeout = Math.min(60_000, Number(process.env.CANVAS_GROQ_TIMEOUT_MS || 20_000));
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]);
  const response = await (options.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal,
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: options.model, temperature: 0, max_completion_tokens: Number(process.env.CANVAS_GROQ_MAX_COMPLETION_TOKENS || 4096), response_format: { type: "json_object" }, ...(options.model.startsWith("openai/gpt-oss-") ? { include_reasoning: false } : {}),
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.prompt }],
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { type?: unknown; code?: unknown; param?: unknown; message?: unknown } } | undefined;
    const providerError = payload?.error;
    const details = [providerError?.type, providerError?.code, providerError?.param, providerError?.message]
      .filter((value): value is string => typeof value === "string")
      .join(": ")
      .slice(0, 300);
    if (process.env.AI_DIAGNOSTICS === "1" && details) console.warn(JSON.stringify({ type: "canvas_groq_error", status: response.status, model: options.model, details }));
    throw new Error(`Groq inference HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}${details ? `: ${details}` : ""}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  recordProviderUsage("groq", { promptTokens: payload.usage?.prompt_tokens, completionTokens: payload.usage?.completion_tokens });
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty Groq inference response");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Invalid Groq inference JSON"); }
  return schema.parse(normalize ? normalize(parsed, content) : parsed);
}

export async function groqOCR(input: { base64: string; mimeType?: string; fetcher?: typeof fetch; signal?: AbortSignal; model?: string; apiKey?: string; system?: string; prompt?: string; format?: "json" | "latex" }): Promise<OCRResult> {
  const apiKey = input.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const mimeType = input.mimeType ?? "image/png";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new Error("Unsupported Groq OCR image type");
  const image = input.base64.replace(/^data:image\/[^;]+;base64,/, "");
  if (!image || !/^[A-Za-z0-9+/]*={0,2}$/.test(image)) throw new Error("Invalid base64 image");
  const maxBytes = Number(process.env.CANVAS_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  if (image.length * 0.75 > maxBytes) throw new Error("Groq OCR image too large");
  const maxPerMinute = Math.max(0, Math.floor(Number(process.env.CANVAS_GROQ_MAX_REQUESTS_PER_MINUTE || 4)));
  const now = Date.now();
  while (issued.length && issued[0] <= now - 60_000) issued.shift();
  if (issued.length >= maxPerMinute) throw new Error("Groq OCR request cap reached");
  issued.push(now);
  const latex = input.format === "latex";
  const system = input.system ?? OCR_SYSTEM;
  const prompt = input.prompt ?? OCR_PROMPT;
  const timeout = Math.min(60_000, Number(process.env.CANVAS_GROQ_TIMEOUT_MS || 20_000));
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(input.signal ? [input.signal] : [])]);
  const response = await (input.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal,
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model || groqOCRModel(), temperature: 0, max_completion_tokens: latex ? 700 : 900, ...(latex ? {} : { response_format: { type: "json_object" } }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } }] },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq OCR HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  recordProviderUsage("groq", { promptTokens: payload.usage?.prompt_tokens, completionTokens: payload.usage?.completion_tokens });
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty Groq OCR response");
  if (latex) return latexOCRResult(content);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Invalid Groq OCR JSON"); }
  const result = normalizeOCRResponse(parsed, content);
  return { ...result, items: result.items.map((item) => ({ ...item, confidence: null, sourceIds: [], imageRegion: null, worldRegion: null, locationPrecision: "unknown" as const, uncertain: true })), uncertain: true };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}

function redactSecrets(text: string): string {
  let sanitized = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[REDACTED_IMAGE]");
  for (const key of [process.env.GROQ_API_KEY, process.env.OPENCODE_GO_API_KEY, process.env.OPENROUTER_API_KEY, process.env.GOOGLE_AI_API_KEY, process.env.OMNIROUTE_API_KEY]) {
    if (key && key.length >= 4) sanitized = sanitized.split(key).join("[REDACTED_KEY]");
  }
  return sanitized.slice(0, 300);
}

function logProviderCall(stage: "text" | "ocr", provider: CanvasProviderId, model: string, latencyMs: number, status: "ok" | "error", error?: string) {
  if (process.env.AI_DIAGNOSTICS !== "1") return;
  const entry = { type: "canvas_provider_call", stage, provider, model, latencyMs: Math.max(0, Math.round(latencyMs)), status, ...(error ? { error: redactSecrets(error) } : {}) };
  if (status === "error") console.warn(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}

function logFallback(stage: "text" | "ocr", provider: CanvasProviderId, error: unknown) {
  const errText = redactSecrets(message(error));
  const label = `${providerLabel(provider)} ${stage === "ocr" ? "OCR" : "inference"} failed: ${errText}`;
  fallbackEvents.push(label);
  if (fallbackEvents.length > 8) fallbackEvents.shift();
  if (process.env.AI_DIAGNOSTICS === "1") console.warn(JSON.stringify({ type: "canvas_provider_fallback", stage, failedProvider: provider, error: errText }));
}

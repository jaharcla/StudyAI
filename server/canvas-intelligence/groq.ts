import { normalizeOCRResponse, normalizeOCRText } from "./ocr.js";
import { ollamaJson, ollamaText } from "./ollama.js";
import { openAiCompatibleJson, openAiCompatibleOCR } from "./openai-compatible.js";
import { allowProviderRequest } from "./provider-budget.js";
import { recordProviderUsage } from "./provider-usage.js";
import {
  canvasInferenceMode,
  canvasOCRMode,
  diagramOCRModelFor,
  geminiBaseUrl,
  geminiModel,
  mathOCRModelFor,
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

type GroqInferenceOptions = { model: string; system: string; prompt: string; baseUrl?: string; signal?: AbortSignal; fetcher?: typeof fetch };

const OCR_SYSTEM = "Transcribe visible handwritten scientific text only. Return JSON {items:[{text,kind,confidence,alternatives}],uncertain:boolean}. Each kind is word, symbol, number, equation, or unknown. Use null for uncalibrated confidence. Do NOT infer a label's arrow or position. Do NOT fabricate pixel coordinates or object IDs.";
const OCR_PROMPT = "Extract actual visible characters, one JSON item per label or expression. Return only JSON.";
const MATH_OCR_SYSTEM = "Transcribe the handwritten mathematical expression in the image as LaTeX. Preserve fractions, roots, sums, integrals, subscripts, superscripts, Greek letters, delimiters, and grouping. Return only the LaTeX expression, with no explanation or markdown fences.";
const MATH_OCR_PROMPT = "Write the visible handwritten mathematical expression as one LaTeX string. Do not describe the image.";

function providerLabel(provider: CanvasProviderId) {
  return provider === "opencode-go" ? "OpenCode Go" : provider === "openrouter" ? "OpenRouter" : provider === "gemini" ? "Google AI Studio" : provider === "groq" ? "Groq" : "Ollama";
}

function cloudHeaders(provider: CanvasProviderId): Record<string, string> {
  if (provider === "opencode-go") return { "x-opencode-session": opencodeGoSession() };
  if (provider === "openrouter") return { "HTTP-Referer": "http://127.0.0.1:5183", "X-Title": "StudyAI MK3" };
  return {};
}

function cloudBaseUrl(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoBaseUrl();
  if (provider === "gemini") return geminiBaseUrl();
  return openRouterBaseUrl();
}

function cloudApiKey(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return process.env.OPENCODE_GO_API_KEY ?? "";
  if (provider === "gemini") return process.env.GOOGLE_AI_API_KEY ?? "";
  return process.env.OPENROUTER_API_KEY ?? "";
}

function cloudModel(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoModel();
  if (provider === "gemini") return geminiModel();
  return openRouterModel();
}

function cloudOCRModel(provider: CanvasProviderId): string {
  if (provider === "opencode-go") return opencodeGoOCRModel();
  if (provider === "gemini") return geminiModel();
  return openRouterOCRModel();
}

export async function canvasInferenceJson<T>(options: GroqInferenceOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  const providers = resolveCompletionProviders();
  if (!providers.length) throw new Error("No canvas provider is configured. Set GROQ_API_KEY, OPENCODE_GO_API_KEY, or OPENROUTER_API_KEY.");
  const attempts: string[] = [];
  for (const provider of providers) {
    if (provider === "groq") {
      try { return await groqJson({ ...options, model: groqInferenceModel() }, schema, normalize); }
      catch (error) { if (providers.length === 1) throw error; attempts.push(`Groq: ${message(error)}`); logFallback("text", "groq", error); continue; }
    }
    if (provider === "ollama") {
      try { return await ollamaJson(options, schema, normalize); }
      catch (error) { if (providers.length === 1) throw error; attempts.push(`Ollama: ${message(error)}`); logFallback("text", "ollama", error); continue; }
    }
    if (!allowProviderRequest(provider)) { attempts.push(`${providerLabel(provider)}: daily request budget exhausted`); logFallback("text", provider, new Error("daily request budget exhausted")); continue; }
    try {
      return await openAiCompatibleJson({
        baseUrl: cloudBaseUrl(provider),
        apiKey: cloudApiKey(provider),
        model: cloudModel(provider),
        provider,
        headers: cloudHeaders(provider),
        system: options.system,
        prompt: options.prompt,
        fetcher: options.fetcher,
        signal: options.signal,
      }, schema, normalize);
    } catch (error) {
      if (providers.length === 1) throw error;
      attempts.push(`${providerLabel(provider)}: ${message(error)}`);
      logFallback("text", provider, error);
    }
  }
  throw new Error(`All canvas providers failed: ${attempts.join("; ")}`);
}

export async function canvasOCR(input: { base64: string; mimeType?: string; model?: string; profile?: "general" | "math" | "diagram"; fetcher?: typeof fetch; signal?: AbortSignal }): Promise<OCRResult> {
  const profile = input.profile ?? "general";
  const math = profile === "math";
  const diagram = profile === "diagram";
  const providers = math ? resolveMathOCRProviders() : diagram ? resolveDiagramOCRProviders() : resolveVisionProviders();
  if (!providers.length) throw new Error("No canvas OCR provider is configured. Set GROQ_API_KEY, OPENCODE_GO_API_KEY, or OPENROUTER_API_KEY.");
  const system = math ? MATH_OCR_SYSTEM : OCR_SYSTEM;
  const prompt = math ? MATH_OCR_PROMPT : OCR_PROMPT;
  const format = math ? "latex" as const : "json" as const;
  const attempts: string[] = [];
  for (const provider of providers) {
    if (provider === "groq") {
      try {
        const model = math ? mathOCRModelFor("groq") : diagram ? diagramOCRModelFor("groq") : undefined;
        return await groqOCR({ base64: input.base64, mimeType: input.mimeType, fetcher: input.fetcher, signal: input.signal, system, prompt, format, ...(model ? { model } : {}) });
      }
      catch (error) { if (providers.length === 1) throw error; attempts.push(`Groq: ${message(error)}`); logFallback("ocr", "groq", error); continue; }
    }
    if (provider === "ollama") {
      try {
        const model = math ? mathOCRModelFor("ollama") : diagram ? diagramOCRModelFor("ollama") : input.model || process.env.CANVAS_OCR_MODEL || "glm-ocr:q8_0";
        const text = await ollamaText({ model, image: input.base64, system, prompt, fetcher: input.fetcher, signal: input.signal });
        return math ? latexOCRResult(text) : normalizeOCRText(text);
      } catch (error) { if (providers.length === 1) throw error; attempts.push(`Ollama: ${message(error)}`); logFallback("ocr", "ollama", error); continue; }
    }
    if (!allowProviderRequest(provider)) { attempts.push(`${providerLabel(provider)}: daily request budget exhausted`); logFallback("ocr", provider, new Error("daily request budget exhausted")); continue; }
    try {
      return await openAiCompatibleOCR({
        baseUrl: cloudBaseUrl(provider),
        apiKey: cloudApiKey(provider),
        model: math ? mathOCRModelFor(provider) : diagram ? diagramOCRModelFor(provider) : cloudOCRModel(provider),
        provider,
        headers: cloudHeaders(provider),
        system,
        prompt,
        format,
        base64: input.base64,
        mimeType: input.mimeType,
        fetcher: input.fetcher,
        signal: input.signal,
      });
    } catch (error) {
      if (providers.length === 1) throw error;
      attempts.push(`${providerLabel(provider)}: ${message(error)}`);
      logFallback("ocr", provider, error);
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

function logFallback(stage: "text" | "ocr", provider: CanvasProviderId, error: unknown) {
  const label = `${providerLabel(provider)} ${stage === "ocr" ? "OCR" : "inference"} failed: ${message(error)}`;
  fallbackEvents.push(label);
  if (fallbackEvents.length > 8) fallbackEvents.shift();
  if (process.env.AI_DIAGNOSTICS === "1") console.warn(JSON.stringify({ type: "canvas_provider_fallback", stage, failedProvider: provider, error: message(error) }));
}

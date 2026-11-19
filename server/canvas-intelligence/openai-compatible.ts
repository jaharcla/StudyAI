import { z } from "zod";
import { normalizeOCRResponse, normalizeOCRText } from "./ocr.js";
import { recordProviderUsage } from "./provider-usage.js";
import type { CanvasProviderId } from "./providers.js";
import { OCRResultSchema, type OCRResult } from "./types.js";

export type OpenAICompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  provider?: CanvasProviderId;
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
};

function timeoutSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  return AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
}

const providerQueues = new Map<string, Promise<unknown>>();
const providerWindows = new Map<string, number[]>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = providerQueues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  providerQueues.set(key, run.then(() => undefined, () => undefined));
  return run;
}

async function rateLimit(provider: string | undefined) {
  if (provider !== "gemini") return;
  const limit = Math.max(1, Math.floor(Number(process.env.CANVAS_GEMINI_MAX_REQUESTS_PER_MINUTE || 15)));
  const now = Date.now();
  const window = (providerWindows.get(provider) ?? []).filter((time) => time > now - 60_000);
  if (window.length >= limit) {
    const wait = Math.max(0, window[0] + 60_000 - now + 50);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, wait));
  }
  window.push(Date.now());
  providerWindows.set(provider, window);
}

async function chat(options: OpenAICompatibleOptions, messages: unknown[], extra: Record<string, unknown> = {}) {
  if (!options.apiKey) throw new Error("A provider API key is not configured");
  const run = async () => {
    await rateLimit(options.provider);
    const request = () => (options.fetcher ?? fetch)(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      signal: timeoutSignal(options.signal, options.timeoutMs ?? 60_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}`, ...options.headers },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        max_tokens: options.maxTokens ?? 4096,
        messages,
        ...extra,
      }),
    });
    let response = await request();
    const retryable = new Set([402, 429, 500, 502, 503, 504]);
    for (let attempt = 1; attempt <= 3 && retryable.has(response.status) && !options.signal?.aborted; attempt++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500 * attempt));
      response = await request();
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Canvas provider HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}${detail ? `: ${detail}` : ""}`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
    if (options.provider) recordProviderUsage(options.provider, {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      costUsd: payload.usage?.cost,
    });
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Canvas provider returned an empty response");
    return content;
  };
  return options.provider === "openrouter" || options.provider === "gemini" ? enqueue(options.provider, run) : run();
}

export async function openAiCompatibleJson<T>(options: OpenAICompatibleOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  const content = await chat(options, [{ role: "system", content: options.system }, { role: "user", content: options.prompt }], { response_format: { type: "json_object" } });
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Canvas provider returned invalid JSON");
  }
  return schema.parse(normalize ? normalize(parsed, content) : parsed);
}

export async function openAiCompatibleOCR(options: OpenAICompatibleOptions & { base64: string; mimeType?: string; format?: "json" | "latex" }): Promise<OCRResult> {
  const mimeType = options.mimeType ?? "image/png";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new Error("Unsupported canvas OCR image type");
  const image = options.base64.replace(/^data:image\/[^;]+;base64,/, "");
  if (!image || !/^[A-Za-z0-9+/]*={0,2}$/.test(image)) throw new Error("Invalid base64 image");
  const messages = [
    { role: "system", content: options.system },
    { role: "user", content: [
      { type: "text", text: options.prompt },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } },
    ] },
  ];
  if (options.format === "latex") {
    const raw = await chat(options, messages, { max_tokens: options.maxTokens ?? 700 });
    const text = raw.replace(/```(?:latex|tex)?/gi, "").replace(/\$\$?/g, "").replace(/^\s*\\\[|\\\]\s*$/g, "").trim();
    if (!text) throw new Error("Canvas provider returned no LaTeX");
    return OCRResultSchema.parse({
      items: [{ text, kind: "equation", confidence: null, alternatives: [], sourceIds: [], imageRegion: null, sourceRegionId: null, worldRegion: null, locationPrecision: "unknown", uncertain: true }],
      uncertain: true,
      raw,
    });
  }
  const content = await chat(options, messages, { response_format: { type: "json_object" }, max_tokens: options.maxTokens ?? 900 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return normalizeOCRText(content);
  }
  const result = normalizeOCRResponse(parsed, content);
  return {
    ...result,
    items: result.items.map((item) => ({ ...item, confidence: null, sourceIds: [], imageRegion: null, worldRegion: null, locationPrecision: "unknown" as const, uncertain: true })),
    uncertain: true,
  };
}

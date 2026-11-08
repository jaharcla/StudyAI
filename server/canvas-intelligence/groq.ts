import { normalizeOCRResponse } from "./ocr.js";
import { ollamaJson } from "./ollama.js";
import type { OCRResult } from "./types.js";
import { z } from "zod";

export type CanvasOCRProvider = "local" | "groq" | "auto";
export type CanvasInferenceProvider = "groq" | "ollama";

export function canvasOCRProvider(env: NodeJS.ProcessEnv = process.env): CanvasOCRProvider {
  const mode = env.CANVAS_OCR_PROVIDER || "auto";
  if (mode !== "local" && mode !== "groq" && mode !== "auto") throw new Error("CANVAS_OCR_PROVIDER must be local, groq, or auto");
  return mode;
}

export function canvasInferenceProvider(env: NodeJS.ProcessEnv = process.env): CanvasInferenceProvider {
  const mode = env.CANVAS_INFERENCE_PROVIDER || "groq";
  if (mode !== "groq" && mode !== "ollama") throw new Error("CANVAS_INFERENCE_PROVIDER must be groq or ollama");
  return mode === "groq" && env.GROQ_API_KEY ? "groq" : "ollama";
}

export const groqOCRModel = (env: NodeJS.ProcessEnv = process.env) => env.CANVAS_GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
export const groqInferenceModel = (env: NodeJS.ProcessEnv = process.env) => env.CANVAS_GROQ_MODEL || env.GROQ_MODEL || "openai/gpt-oss-120b";
const issued: number[] = [];

type GroqInferenceOptions = { model: string; system: string; prompt: string; baseUrl?: string; signal?: AbortSignal; fetcher?: typeof fetch };

export async function canvasInferenceJson<T>(options: GroqInferenceOptions, schema: z.ZodType<T>, normalize?: (value: unknown, raw: string) => unknown): Promise<T> {
  if (canvasInferenceProvider() !== "groq") return ollamaJson(options, schema, normalize);
  try {
    return await groqJson({ ...options, model: groqInferenceModel() }, schema, normalize);
  } catch (groqError) {
    if (options.signal?.aborted) throw groqError;
    try { return await ollamaJson(options, schema, normalize); }
    catch (ollamaError) {
      const reason = (error: unknown) => error instanceof Error ? error.message : "request failed";
      throw new Error(`Groq inference failed (${reason(groqError)}); Ollama fallback failed (${reason(ollamaError)})`);
    }
  }
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
      model: options.model, temperature: 0, max_completion_tokens: Number(process.env.CANVAS_GROQ_MAX_COMPLETION_TOKENS || 4096), response_format: { type: "json_object" },
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Groq inference HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty Groq inference response");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Invalid Groq inference JSON"); }
  return schema.parse(normalize ? normalize(parsed, content) : parsed);
}

export async function groqOCR(input: { base64: string; mimeType?: string; fetcher?: typeof fetch; signal?: AbortSignal; model?: string; apiKey?: string }): Promise<OCRResult> {
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
  const timeout = Math.min(60_000, Number(process.env.CANVAS_GROQ_TIMEOUT_MS || 20_000));
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(input.signal ? [input.signal] : [])]);
  const response = await (input.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal,
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model || groqOCRModel(), temperature: 0, max_completion_tokens: 900, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Transcribe visible handwritten scientific text only. Return JSON {items:[{text,kind,confidence,alternatives}],uncertain:boolean}. Each kind is word, symbol, number, equation, or unknown. Use null for uncalibrated confidence. Do NOT infer a label's arrow or position. Do NOT fabricate pixel coordinates or object IDs." },
        { role: "user", content: [{ type: "text", text: "Extract actual visible characters, one JSON item per label or expression. Return only JSON." }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } }] },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq OCR HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty Groq OCR response");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Invalid Groq OCR JSON"); }
  const result = normalizeOCRResponse(parsed, content);
  return { ...result, items: result.items.map((item) => ({ ...item, confidence: null, sourceIds: [], imageRegion: null, worldRegion: null, locationPrecision: "unknown" as const, uncertain: true })), uncertain: true };
}

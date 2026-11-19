import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { canvasInferenceJson, canvasOCR, consumeProviderFallbacks, resetProviderFallbacks } from "../server/canvas-intelligence/groq.js";
import { resetProviderBudgetsForTests } from "../server/canvas-intelligence/provider-budget.js";
import { providerChain, resolveCompletionProviders, resolveVisionProviders } from "../server/canvas-intelligence/providers.js";

const schema = z.object({ value: z.string() });
const options = { model: "local:test", system: "Return JSON.", prompt: "Return {value:string}." };

beforeEach(() => {
  resetProviderBudgetsForTests();
  resetProviderFallbacks();
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.stubEnv("OPENCODE_GO_API_KEY", "test-opencode");
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter");
  vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "auto");
  vi.stubEnv("CANVAS_OCR_PROVIDER", "auto");
  vi.stubEnv("CANVAS_PROVIDER_CHAIN", "groq,opencode-go,openrouter");
  vi.stubEnv("CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY", "20");
  vi.stubEnv("CANVAS_OPENROUTER_MAX_REQUESTS_PER_DAY", "50");
  vi.stubEnv("CANVAS_GROQ_MAX_REQUESTS_PER_MINUTE", "100");
});

afterEach(() => vi.unstubAllEnvs());

describe("canvas provider chain", () => {
  it("parses the configured chain and rejects unknown providers", () => {
    expect(providerChain({ CANVAS_PROVIDER_CHAIN: "groq,opencode-go" } as NodeJS.ProcessEnv)).toEqual(["groq", "opencode-go"]);
    expect(() => providerChain({ CANVAS_PROVIDER_CHAIN: "groq,unknown" } as NodeJS.ProcessEnv)).toThrow("Unknown canvas provider");
  });

  it("filters auto by configured keys", () => {
    expect(resolveCompletionProviders({ CANVAS_INFERENCE_PROVIDER: "groq" } as NodeJS.ProcessEnv)).toEqual(["groq"]);
    expect(resolveCompletionProviders({ CANVAS_INFERENCE_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,opencode-go,openrouter", GROQ_API_KEY: "g", OPENCODE_GO_API_KEY: "o" } as NodeJS.ProcessEnv)).toEqual(["groq", "opencode-go"]);
    expect(resolveVisionProviders({ CANVAS_OCR_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,opencode-go,openrouter" } as NodeJS.ProcessEnv)).toEqual([]);
    expect(resolveCompletionProviders({ CANVAS_INFERENCE_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,gemini", GROQ_API_KEY: "g", GOOGLE_AI_API_KEY: "gem" } as NodeJS.ProcessEnv)).toEqual(["groq", "gemini"]);
  });

  it("falls back from Groq to OpenCode Go with the session header and JSON mode", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) });
      if (String(url).includes("api.groq.com")) return new Response("unavailable", { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "opencode" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "opencode" });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.groq.com/openai/v1/chat/completions",
      "https://opencode.ai/inference/go/openai/v1/chat/completions",
    ]);
    expect(calls[1].headers.get("x-opencode-session")).toBeTruthy();
    expect(calls[1].body).toMatchObject({ model: "qwen3.8-flash", response_format: { type: "json_object" } });
    expect(consumeProviderFallbacks().join(" ")).toContain("Groq inference failed");
  });

  it("falls back from Groq OCR to OpenCode Go vision OCR", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      if (String(url).includes("api.groq.com")) return new Response("unavailable", { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ text: "F = 5 N", kind: "equation" }], uncertain: false }) } }] });
    }) as typeof fetch;

    const result = await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", fetcher });
    expect(result.items[0]).toMatchObject({ text: "F = 5 N", confidence: null, sourceIds: [], uncertain: true });
    expect(result.uncertain).toBe(true);
    expect(calls[1].body).toMatchObject({ model: "qwen3.8-flash" });
    expect(JSON.stringify(calls[1].body)).toContain("image_url");
  });

  it("routes math OCR through Google AI Studio when configured", async () => {
    vi.stubEnv("CANVAS_MATH_OCR_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-gemini");
    vi.stubEnv("CANVAS_GEMINI_MODEL", "gemini-3.1-flash-lite");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return Response.json({ choices: [{ message: { content: "\\nabla I = (I_x, I_y)" } }] });
    }) as typeof fetch;

    const result = await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", profile: "math", fetcher });
    expect(result.items[0]).toMatchObject({ kind: "equation", text: "\\nabla I = (I_x, I_y)" });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "gemini-3.1-flash-lite" });
  });

  it("uses a LaTeX math OCR profile with the configured math model", async () => {
    vi.stubEnv("CANVAS_MATH_OCR_PROVIDER", "openrouter");
    vi.stubEnv("CANVAS_MATH_OCR_MODEL", "google/gemini-3.1-flash-lite");
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ message: { content: "\\nabla I = (I_x, I_y)" } }] });
    }) as typeof fetch;

    const result = await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", profile: "math", fetcher });
    expect(result.items[0]).toMatchObject({ kind: "equation", text: "\\nabla I = (I_x, I_y)", uncertain: true });
    expect(bodies[0]).toMatchObject({ model: "google/gemini-3.1-flash-lite" });
    expect(bodies[0].response_format).toBeUndefined();
    expect(JSON.stringify(bodies[0].messages)).toContain("LaTeX");
  });

  it("uses the Groq OCR model rather than an Ollama model name", async () => {
    vi.stubEnv("CANVAS_OCR_PROVIDER", "groq");
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ text: "F = 5 N" }] }) } }] });
    }) as typeof fetch;

    await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", model: "glm-ocr:q8_0", fetcher });
    expect(bodies[0]).toMatchObject({ model: "qwen/qwen3.8-27b" });
  });

  it("honors the daily provider budget by moving to the next provider", async () => {
    vi.stubEnv("CANVAS_PROVIDER_CHAIN", "opencode-go,openrouter");
    vi.stubEnv("CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY", "1");
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      const target = String(url);
      calls.push(target);
      const value = target.includes("opencode.ai") ? "opencode" : "openrouter";
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "opencode" });
    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "openrouter" });
    expect(calls).toEqual([
      "https://opencode.ai/inference/go/openai/v1/chat/completions",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
  });

  it("keeps an explicit Groq mode from silently using another provider", async () => {
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "groq");
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).includes("api.groq.com")) return new Response("unavailable", { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "opencode" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).rejects.toThrow("Groq inference HTTP 503");
    expect(calls).toEqual(["https://api.groq.com/openai/v1/chat/completions"]);
  });
});

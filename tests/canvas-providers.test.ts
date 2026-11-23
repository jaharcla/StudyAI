import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { z } from "zod";
import { canvasInferenceJson, canvasOCR, consumeProviderFallbacks, resetProviderFallbacks } from "../server/canvas-intelligence/groq.js";
import { allowProviderRequest, configureProviderBudgetDatabase, providerBudgetRemaining, providerBudgetSnapshot, resetProviderBudgetsForTests } from "../server/canvas-intelligence/provider-budget.js";
import { configureProviderUsageDatabase, consumeProviderUsage, persistedProviderUsageSnapshot, providerCircuitSnapshot, providerUsageSnapshot, recordProviderBackoff, recordProviderFailure, recordProviderSuccess, recordProviderUsage, resetProviderCircuitsForTests, resetProviderUsageForTests } from "../server/canvas-intelligence/provider-usage.js";
import { cloudOCRTimeoutMs, providerChain, resolveCompletionProviders, resolveVisionProviders } from "../server/canvas-intelligence/providers.js";

const schema = z.object({ value: z.string() });
const options = { model: "local:test", system: "Return JSON.", prompt: "Return {value:string}." };

beforeEach(() => {
  configureProviderBudgetDatabase(null);
  configureProviderUsageDatabase(null);
  resetProviderBudgetsForTests();
  resetProviderUsageForTests();
  resetProviderCircuitsForTests();
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

  it("asks math OCR to disambiguate Greek letters from Latin lookalikes", async () => {
    vi.stubEnv("CANVAS_MATH_OCR_PROVIDER", "openrouter");
    vi.stubEnv("CANVAS_MATH_OCR_MODEL", "google/gemini-3.1-flash-lite");
    const bodies: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as { messages?: Array<{ role: string; content: unknown }> });
      return Response.json({ choices: [{ message: { content: "\\frac{1}{1+e^{-\\frac{x_i-\\mu_i}{\\sigma_i}}}" } }] });
    }) as typeof fetch;

    await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", profile: "math", fetcher });
    const system = String(bodies[0].messages?.[0]?.content ?? "");
    expect(system).toContain("\\mu");
    expect(system).toContain("\\sigma");
    expect(system).toMatch(/ambiguous/i);
  });

  it("reads and clamps the cloud OCR timeout from configuration", () => {
    expect(cloudOCRTimeoutMs({} as NodeJS.ProcessEnv)).toBe(30_000);
    expect(cloudOCRTimeoutMs({ CANVAS_OCR_TIMEOUT_MS: "45000" } as NodeJS.ProcessEnv)).toBe(45_000);
    expect(cloudOCRTimeoutMs({ CANVAS_OCR_TIMEOUT_MS: "1" } as NodeJS.ProcessEnv)).toBe(1_000);
    expect(cloudOCRTimeoutMs({ CANVAS_OCR_TIMEOUT_MS: "999999" } as NodeJS.ProcessEnv)).toBe(60_000);
    expect(cloudOCRTimeoutMs({ CANVAS_OCR_TIMEOUT_MS: "abc" } as NodeJS.ProcessEnv)).toBe(30_000);
  });

  it("aborts a hung cloud OCR request at the configured timeout and falls back", async () => {
    vi.stubEnv("CANVAS_OCR_PROVIDER", "auto");
    vi.stubEnv("CANVAS_PROVIDER_CHAIN", "openrouter,groq");
    vi.stubEnv("CANVAS_OCR_TIMEOUT_MS", "1000");
    const urls: string[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).includes("openrouter")) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ text: "F/N", kind: "symbol", confidence: null, alternatives: [] }], uncertain: false }) } }] });
    }) as typeof fetch;

    const started = Date.now();
    const result = await canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", fetcher });
    const elapsed = Date.now() - started;
    expect(result.items[0]).toMatchObject({ text: "F/N" });
    expect(elapsed).toBeLessThan(5_000);
    expect(urls.some((url) => url.includes("openrouter"))).toBe(true);
    expect(urls.some((url) => url.includes("api.groq.com"))).toBe(true);
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

  it("persists daily provider budgets and usage in SQLite across restarts", () => {
    const db = new Database(":memory:");
    configureProviderBudgetDatabase(db);
    configureProviderUsageDatabase(db);
    vi.stubEnv("CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY", "2");

    expect(allowProviderRequest("opencode-go")).toBe(true);
    expect(providerBudgetRemaining("opencode-go")).toBe(1);
    recordProviderUsage("opencode-go", { promptTokens: 120, completionTokens: 30, costUsd: 0.00025 });
    recordProviderBackoff("opencode-go", 1500);

    // Simulate process restart by re-binding to the same SQLite DB
    configureProviderBudgetDatabase(db);
    configureProviderUsageDatabase(db);
    expect(providerBudgetRemaining("opencode-go")).toBe(1);
    expect(providerBudgetSnapshot()["opencode-go"]).toEqual({ used: 1, limit: 2 });
    expect(allowProviderRequest("opencode-go")).toBe(true);
    expect(allowProviderRequest("opencode-go")).toBe(false);

    const persistedUsage = persistedProviderUsageSnapshot();
    expect(persistedUsage.find((entry) => entry.provider === "opencode-go")).toMatchObject({
      provider: "opencode-go",
      calls: 1,
      promptTokens: 120,
      completionTokens: 30,
      costUsd: 0.00025,
      backoffs: 1,
      backoffMs: 1500,
    });
    db.close();
  });

  it("trips the provider circuit breaker after consecutive failures and skips open circuits in chains", async () => {
    vi.stubEnv("CANVAS_PROVIDER_CIRCUIT_THRESHOLD", "2");
    vi.stubEnv("CANVAS_PROVIDER_CIRCUIT_COOLDOWN_MS", "30000");

    recordProviderFailure("groq", "HTTP 503");
    expect(providerCircuitSnapshot().groq.state).toBe("closed");
    recordProviderFailure("groq", "HTTP 503");
    expect(providerCircuitSnapshot().groq).toMatchObject({
      state: "open",
      consecutiveFailures: 2,
      totalFailures: 2,
      tripCount: 1,
      lastError: "HTTP 503",
    });

    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "opencode" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "opencode" });
    expect(calls).toEqual(["https://opencode.ai/inference/go/openai/v1/chat/completions"]);
    expect(consumeProviderFallbacks().join(" ")).toContain("circuit breaker open");

    recordProviderSuccess("groq");
    expect(providerCircuitSnapshot().groq.state).toBe("closed");
  });

  it("blocks cloud image egress when CANVAS_ALLOW_IMAGE_EGRESS=0 or opt-out is set", async () => {
    vi.stubEnv("CANVAS_ALLOW_IMAGE_EGRESS", "0");
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }] });
    }) as typeof fetch;

    await expect(canvasOCR({ base64: "aW1hZ2U=", mimeType: "image/png", fetcher })).rejects.toThrow(/image egress/i);
    expect(calls).toEqual([]);
  });

  it("emits structured diagnostics logs without raw images or API keys", async () => {
    vi.stubEnv("AI_DIAGNOSTICS", "1");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args) => { logs.push(args.map(String).join(" ")); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => { logs.push(args.map(String).join(" ")); });
    const secretImage = "c2VjcmV0LWltYWdlLWJhc2U2NC1wYXlsb2Fk";
    const fetcher = (async () => Response.json({
      choices: [{ message: { content: JSON.stringify({ items: [{ text: "x = 1", kind: "equation" }], uncertain: false }) } }],
      usage: { prompt_tokens: 40, completion_tokens: 10 },
    })) as typeof fetch;

    try {
      await canvasOCR({ base64: secretImage, mimeType: "image/png", fetcher });
      const combined = logs.join("\n");
      expect(combined).toContain("canvas_provider_call");
      expect(combined).not.toContain(secretImage);
      expect(combined).not.toContain("test-groq");
      expect(combined).not.toContain("test-opencode");
    } finally {
      spy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

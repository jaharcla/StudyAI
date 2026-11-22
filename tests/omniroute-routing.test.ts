import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { canvasInferenceJson } from "../server/canvas-intelligence/groq.js";
import { resetProviderFallbacks } from "../server/canvas-intelligence/groq.js";
import { resetProviderBudgetsForTests } from "../server/canvas-intelligence/provider-budget.js";
import { resetProviderCircuitsForTests, resetProviderUsageForTests } from "../server/canvas-intelligence/provider-usage.js";
import { getTutorProviderSettings } from "../server/tutor-provider";
import { createTutorChatModel } from "../server/tutor-chat-model";

const schema = z.object({ value: z.string() });
const options = { model: "ignored", system: "Return JSON.", prompt: "Return {value:string}." };

beforeEach(() => {
  resetProviderBudgetsForTests();
  resetProviderUsageForTests();
  resetProviderCircuitsForTests();
  resetProviderFallbacks();
  vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "omniroute");
  vi.stubEnv("CANVAS_OCR_PROVIDER", "omniroute");
  vi.stubEnv("OMNIROUTE_BASE_URL", "http://localhost:20128/v1/");
  vi.stubEnv("OMNIROUTE_API_KEY", "");
  vi.stubEnv("OMNIROUTE_MODEL", "gateway-model");
  vi.stubEnv("CANVAS_OMNIROUTE_MODEL", "canvas-model");
});

afterEach(() => vi.unstubAllEnvs());

describe("OpenAI-compatible base URL routing", () => {
  it("routes canvas inference to the local gateway with the canvas model", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "gateway" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "gateway" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:20128/v1/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "canvas-model", response_format: { type: "json_object" } });
    expect(calls[0].headers.get("authorization")).toBe("Bearer studyai-local-gateway");
  });

  it("uses the configured gateway key when one is supplied", async () => {
    vi.stubEnv("OMNIROUTE_API_KEY", "placeholder-key");
    let authorization = "";
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "ok" });
    expect(authorization).toBe("Bearer placeholder-key");
  });

  it("falls back from Groq to the local gateway with a mocked fetcher", async () => {
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "auto");
    vi.stubEnv("CANVAS_PROVIDER_CHAIN", "groq,omniroute");
    vi.stubEnv("GROQ_API_KEY", "mock-groq");
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).includes("api.groq.com")) return new Response("unavailable", { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "gateway" }) } }] });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "gateway" });
    expect(calls).toEqual([
      "https://api.groq.com/openai/v1/chat/completions",
      "http://localhost:20128/v1/chat/completions",
    ]);
  });

  it("redacts the gateway key from AI_DIAGNOSTICS logs", async () => {
    vi.stubEnv("AI_DIAGNOSTICS", "1");
    vi.stubEnv("OMNIROUTE_API_KEY", "super-secret-gateway-key");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args) => { logs.push(args.map(String).join(" ")); });
    const fetcher = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }] })) as typeof fetch;
    try {
      await canvasInferenceJson({ ...options, fetcher }, schema);
      const combined = logs.join("\n");
      expect(combined).toContain("canvas_provider_call");
      expect(combined).not.toContain("super-secret-gateway-key");
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps an explicit gateway mode from silently using another provider", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;

    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).rejects.toThrow(/HTTP 400/);
    expect(calls).toEqual(["http://localhost:20128/v1/chat/completions"]);
  });
});

describe("Tutor OpenAI-compatible model routing", () => {
  it("builds a ChatOpenAI client pointed at the local gateway", () => {
    const settings = getTutorProviderSettings({ TUTOR_PROVIDER: "omniroute", OMNIROUTE_MODEL: "gateway-model" } as NodeJS.ProcessEnv);
    const model = createTutorChatModel("openai-compatible", "gateway-model", settings);
    if (!(model instanceof ChatOpenAI)) throw new Error("expected a ChatOpenAI model");

    expect(model.clientConfig.baseURL).toBe("http://localhost:20128/v1");
    expect(model.model).toBe("gateway-model");
    expect(model.apiKey).toBe("studyai-local-gateway");
  });

  it("does not alter Groq or Ollama model construction", () => {
    // ChatGroq reads the key from process.env (production behaviour); stub it so this
    // construction test is hermetic in CI, where no .env/GROQ_API_KEY is present.
    vi.stubEnv("GROQ_API_KEY", "mock-groq");
    const settings = getTutorProviderSettings({ GROQ_API_KEY: "mock-groq", GROQ_MODEL: "custom-groq-model" } as NodeJS.ProcessEnv);
    const groq = createTutorChatModel("groq", "unused", settings);
    expect(groq).not.toBeInstanceOf(ChatOpenAI);
    expect(groq.model).toBe("custom-groq-model");

    const ollama = createTutorChatModel("ollama", "local-model", settings);
    expect(ollama).not.toBeInstanceOf(ChatOpenAI);
    expect(ollama.model).toBe("local-model");
  });
});

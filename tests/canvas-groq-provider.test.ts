import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { canvasInferenceJson, canvasInferenceProvider, groqInferenceModel } from "../server/canvas-intelligence/groq.js";

const schema = z.object({ value: z.string() });
const options = { model: "local:test", system: "Return JSON.", prompt: "Return {value:string}." };

afterEach(() => vi.unstubAllEnvs());

describe("Canvas inference provider preference", () => {
  it("defaults to the current Groq tool-calling model and allows scoped overrides", () => {
    expect(groqInferenceModel({} as NodeJS.ProcessEnv)).toBe("openai/gpt-oss-120b");
    expect(groqInferenceModel({ GROQ_MODEL: "custom/model" } as NodeJS.ProcessEnv)).toBe("custom/model");
    expect(groqInferenceModel({ GROQ_MODEL: "custom/model", CANVAS_GROQ_MODEL: "canvas/model" } as NodeJS.ProcessEnv)).toBe("canvas/model");
  });

  it("prefers Groq when configured and allows an explicit Ollama override", () => {
    expect(canvasInferenceProvider({ GROQ_API_KEY: "test-key" } as NodeJS.ProcessEnv)).toBe("groq");
    expect(canvasInferenceProvider({ GROQ_API_KEY: "test-key", CANVAS_INFERENCE_PROVIDER: "ollama" } as NodeJS.ProcessEnv)).toBe("ollama");
    expect(canvasInferenceProvider({ CANVAS_INFERENCE_PROVIDER: "groq" } as NodeJS.ProcessEnv)).toBe("ollama");
  });

  it("uses Groq first when the response validates", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "groq");
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ value: "groq" }) } }] });
    }) as typeof fetch;
    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "groq" });
    expect(calls).toEqual(["https://api.groq.com/openai/v1/chat/completions"]);
  });

  it("falls back to the selected Ollama model when Groq fails", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "groq");
    const calls: Array<{ url: string; model?: string }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url), request = init?.body ? JSON.parse(String(init.body)) as { model?: string } : undefined;
      calls.push({ url: target, model: request?.model });
      if (target.includes("api.groq.com")) return new Response("unavailable", { status: 503 });
      if (target.endsWith("/api/tags")) return Response.json({ models: [{ name: options.model }] });
      return Response.json({ message: { content: JSON.stringify({ value: "ollama" }) } });
    }) as typeof fetch;
    await expect(canvasInferenceJson({ ...options, fetcher }, schema)).resolves.toEqual({ value: "ollama" });
    expect(calls.map(({ url }) => url)).toEqual([
      "https://api.groq.com/openai/v1/chat/completions",
      "http://127.0.0.1:11434/api/tags",
      "http://127.0.0.1:11434/api/chat",
    ]);
    expect(calls.at(-1)?.model).toBe(options.model);
  });
});

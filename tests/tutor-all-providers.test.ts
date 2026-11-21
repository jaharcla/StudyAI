import { describe, expect, it } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { getTutorProviderSettings, nextTutorFallbackProvider, tutorModelForProvider } from "../server/tutor-provider";
import { createTutorChatModel } from "../server/tutor-chat-model";

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe("every inference provider can be the Tutor", () => {
  it("selects each explicit provider and resolves its model", () => {
    const cases: Array<{ mode: string; env: Record<string, string>; provider: string; model: string }> = [
      { mode: "groq", env: { GROQ_API_KEY: "k" }, provider: "groq", model: "openai/gpt-oss-120b" },
      { mode: "ollama", env: {}, provider: "ollama", model: "qwen3:latest" },
      { mode: "omniroute", env: {}, provider: "openai-compatible", model: "agnes/agnes-2.5-flash-high" },
      { mode: "opencode-go", env: { OPENCODE_GO_API_KEY: "k" }, provider: "opencode-go", model: "qwen3.8-flash" },
      { mode: "openrouter", env: { OPENROUTER_API_KEY: "k" }, provider: "openrouter", model: "qwen/qwen3-vl-8b-instruct" },
      { mode: "gemini", env: { GOOGLE_AI_API_KEY: "k" }, provider: "gemini", model: "gemini-3.1-flash-lite" },
    ];
    for (const item of cases) {
      const settings = getTutorProviderSettings(env({ TUTOR_PROVIDER: item.mode, ...item.env }));
      expect(settings.mode).toBe(item.mode === "omniroute" ? "openai-compatible" : item.mode);
      expect(settings.provider).toBe(item.provider);
      const selected = settings.provider === "ollama" ? "" : "selected-local";
      expect(tutorModelForProvider(settings.provider, settings, selected)).toBe(item.model);
    }
  });

  it("requires the matching key for explicit cloud providers", () => {
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "opencode-go" }))).toThrow(/requires OPENCODE_GO_API_KEY/);
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "openrouter" }))).toThrow(/requires OPENROUTER_API_KEY/);
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "gemini" }))).toThrow(/requires GOOGLE_AI_API_KEY/);
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "omniroute" }))).not.toThrow();
  });

  it("routes each cloud provider to its own base URL and headers", () => {
    const cases: Array<{ provider: "openai-compatible" | "opencode-go" | "openrouter" | "gemini"; env: Record<string, string>; url: string; header: string }> = [
      { provider: "openai-compatible", env: {}, url: "http://localhost:20128/v1", header: "" },
      { provider: "opencode-go", env: { OPENCODE_GO_API_KEY: "k" }, url: "https://opencode.ai/inference/go/openai/v1", header: "x-opencode-session" },
      { provider: "openrouter", env: { OPENROUTER_API_KEY: "k" }, url: "https://openrouter.ai/api/v1", header: "HTTP-Referer" },
      { provider: "gemini", env: { GOOGLE_AI_API_KEY: "k" }, url: "https://generativelanguage.googleapis.com/v1beta/openai", header: "" },
    ];
    for (const item of cases) {
      const settings = getTutorProviderSettings(env({ TUTOR_PROVIDER: item.provider, ...item.env }));
      const model = createTutorChatModel(item.provider, tutorModelForProvider(item.provider, settings), settings);
      if (!(model instanceof ChatOpenAI)) throw new Error(`expected ChatOpenAI for ${item.provider}`);
      expect(model.clientConfig.baseURL).toBe(item.url);
      expect(JSON.stringify(model.clientConfig.defaultHeaders ?? {})).toContain(item.header || "{}");
    }
  });

  it("keeps auto fallback unchanged for the newly selectable providers", () => {
    const withGateway = getTutorProviderSettings(env({ GROQ_API_KEY: "g", OMNIROUTE_MODEL: "m" }));
    expect(nextTutorFallbackProvider(withGateway, "groq")).toBe("openai-compatible");
    expect(nextTutorFallbackProvider(withGateway, "openai-compatible")).toBe("ollama");
    const explicitEnvs: Array<{ provider: "opencode-go" | "openrouter" | "gemini"; keyEnv: string }> = [
      { provider: "opencode-go", keyEnv: "OPENCODE_GO_API_KEY" },
      { provider: "openrouter", keyEnv: "OPENROUTER_API_KEY" },
      { provider: "gemini", keyEnv: "GOOGLE_AI_API_KEY" },
    ];
    for (const item of explicitEnvs) {
      const values: Record<string, string> = { TUTOR_PROVIDER: item.provider };
      values[item.keyEnv] = "k";
      const explicit = getTutorProviderSettings(env(values));
      expect(nextTutorFallbackProvider(explicit, item.provider)).toBeUndefined();
    }
  });
});

import { describe, expect, it } from "vitest";
import { getTutorProviderSettings } from "../server/tutor-provider";

describe("Tutor inference controls", () => {
  it("prefers configured Groq and defaults to no automatic retry", () => {
    expect(getTutorProviderSettings({ GROQ_API_KEY: "mock-key" } as NodeJS.ProcessEnv)).toMatchObject({ provider: "groq", groqModel: "openai/gpt-oss-120b", groqRetries: 0, maxCompletionTokens: 2048, maxProviderCalls: 3, groqInputUsdPerMillion: 0.15, groqOutputUsdPerMillion: 0.6, maxGroqCostUsd: 0.02 });
    expect(getTutorProviderSettings({} as NodeJS.ProcessEnv).maxGroqCostPerCallUsd).toBeCloseTo(0.0036864);
  });

  it("honors local-only selection, configured models, completion limit, and one mocked retry", () => {
    expect(getTutorProviderSettings({ TUTOR_PROVIDER: "ollama", GROQ_API_KEY: "mock-key", OLLAMA_MODEL: "qwen3:8b", GROQ_MODEL: "llama-custom", TUTOR_MAX_COMPLETION_TOKENS: "1024", TUTOR_GROQ_RETRIES: "1", TUTOR_MAX_PROVIDER_CALLS: "4", TUTOR_GROQ_INPUT_USD_PER_1M: "0.2", TUTOR_GROQ_OUTPUT_USD_PER_1M: "0.8" } as NodeJS.ProcessEnv)).toMatchObject({ provider: "ollama", ollamaModel: "qwen3:8b", groqModel: "llama-custom", maxCompletionTokens: 1024, groqRetries: 1, maxProviderCalls: 4, groqInputUsdPerMillion: 0.2, groqOutputUsdPerMillion: 0.8 });
  });

  it("uses Ollama when Groq has no configured key and rejects unsafe limits", () => {
    expect(getTutorProviderSettings({} as NodeJS.ProcessEnv).provider).toBe("ollama");
    expect(() => getTutorProviderSettings({ TUTOR_GROQ_RETRIES: "2" } as NodeJS.ProcessEnv)).toThrow(/0 or 1/);
    expect(() => getTutorProviderSettings({ TUTOR_MAX_COMPLETION_TOKENS: "0" } as NodeJS.ProcessEnv)).toThrow(/1 through 32768/);
    expect(() => getTutorProviderSettings({ TUTOR_GROQ_INPUT_USD_PER_1M: "invalid" } as NodeJS.ProcessEnv)).toThrow(/positive number/);
    expect(() => getTutorProviderSettings({ TUTOR_MAX_PROVIDER_CALLS: "11" } as NodeJS.ProcessEnv)).toThrow(/1 through 10/);
  });
});

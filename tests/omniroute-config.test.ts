import { describe, expect, it } from "vitest";
import { getStudyAIConfig } from "../server/config";
import {
  getTutorProviderSettings,
  nextTutorFallbackProvider,
  tutorModelForProvider,
  type TutorProviderSettings,
} from "../server/tutor-provider";
import {
  canvasInferenceMode,
  canvasOCRMode,
  canvasOmnirouteModel,
  omnirouteApiKey,
  omnirouteBaseUrl,
  omnirouteModel,
  providerChain,
  resolveCompletionProviders,
  resolveVisionProviders,
} from "../server/canvas-intelligence/providers";

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe("OpenAI-compatible gateway configuration", () => {
  it("defaults to the local OmniRoute gateway without a real key", () => {
    expect(getStudyAIConfig({})).toMatchObject({
      omnirouteBaseUrl: "http://localhost:20128/v1",
      omnirouteApiKey: "",
      omnirouteModel: "agnes/agnes-2.5-flash-high",
      canvasOmnirouteModel: "agnes/agnes-2.5-flash-high",
    });
    expect(omnirouteBaseUrl({})).toBe("http://localhost:20128/v1");
    expect(omnirouteModel({})).toBe("agnes/agnes-2.5-flash-high");
    expect(canvasOmnirouteModel({})).toBe("agnes/agnes-2.5-flash-high");
    expect(omnirouteApiKey({})).toBe("studyai-local-gateway");
  });

  it("reads, trims and normalizes gateway env vars", () => {
    const configured = env({
      OMNIROUTE_BASE_URL: "http://gateway.local/v1/",
      OMNIROUTE_API_KEY: "placeholder",
      OMNIROUTE_MODEL: "gateway-model",
      CANVAS_OMNIROUTE_MODEL: "canvas-model",
    });
    expect(getStudyAIConfig(configured)).toMatchObject({
      omnirouteBaseUrl: "http://gateway.local/v1",
      omnirouteApiKey: "placeholder",
      omnirouteModel: "gateway-model",
      canvasOmnirouteModel: "canvas-model",
    });
    expect(omnirouteBaseUrl(configured)).toBe("http://gateway.local/v1");
    expect(omnirouteModel(configured)).toBe("gateway-model");
    expect(canvasOmnirouteModel(configured)).toBe("canvas-model");
    expect(omnirouteApiKey(configured)).toBe("placeholder");
  });
});

describe("Tutor provider selection", () => {
  it("selects openai-compatible mode and accepts omniroute as an alias", () => {
    const settings = getTutorProviderSettings(env({ TUTOR_PROVIDER: "openai-compatible", OMNIROUTE_MODEL: "gateway-model" }));
    expect(settings).toMatchObject({
      mode: "openai-compatible",
      provider: "openai-compatible",
      omnirouteBaseUrl: "http://localhost:20128/v1",
      omnirouteApiKey: "",
      omnirouteModel: "gateway-model",
    });
    expect(getTutorProviderSettings(env({ TUTOR_PROVIDER: "omniroute" })).mode).toBe("openai-compatible");
  });

  it("preserves existing groq, ollama and auto behaviour when the gateway is not configured", () => {
    expect(getTutorProviderSettings(env({ GROQ_API_KEY: "mock-key" })).provider).toBe("groq");
    expect(getTutorProviderSettings(env({})).provider).toBe("ollama");
    expect(getTutorProviderSettings(env({ TUTOR_PROVIDER: "groq", GROQ_API_KEY: "mock-key" })).mode).toBe("groq");
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "groq" }))).toThrow(/requires GROQ_API_KEY/);
    expect(() => getTutorProviderSettings(env({ TUTOR_PROVIDER: "ollama", OMNIROUTE_MODEL: "m" }))).not.toThrow();
  });

  it("uses omniroute in auto mode only when the user explicitly configures the gateway", () => {
    expect(getTutorProviderSettings(env({ GROQ_API_KEY: "mock-key", OMNIROUTE_MODEL: "m" })).provider).toBe("groq");
    expect(getTutorProviderSettings(env({ OMNIROUTE_MODEL: "m" })).provider).toBe("openai-compatible");
    expect(getTutorProviderSettings(env({ OMNIROUTE_API_KEY: "placeholder" })).provider).toBe("openai-compatible");
    expect(getTutorProviderSettings(env({ OMNIROUTE_BASE_URL: "http://gateway/v1" })).provider).toBe("openai-compatible");
  });

  it("keeps Groq -> Ollama fallback and inserts the gateway only when configured", () => {
    const groqOnly = getTutorProviderSettings(env({ GROQ_API_KEY: "mock-key" }));
    expect(nextTutorFallbackProvider(groqOnly, "groq")).toBe("ollama");

    const withGateway = getTutorProviderSettings(env({ GROQ_API_KEY: "mock-key", OMNIROUTE_MODEL: "m" }));
    expect(nextTutorFallbackProvider(withGateway, "groq")).toBe("openai-compatible");
    expect(nextTutorFallbackProvider(withGateway, "openai-compatible")).toBe("ollama");
    expect(nextTutorFallbackProvider(withGateway, "ollama")).toBeUndefined();

    const gatewayPrimary = getTutorProviderSettings(env({ OMNIROUTE_MODEL: "m" }));
    expect(nextTutorFallbackProvider(gatewayPrimary, "openai-compatible")).toBe("ollama");

    const explicit: TutorProviderSettings = getTutorProviderSettings(env({ TUTOR_PROVIDER: "omniroute", OMNIROUTE_MODEL: "m" }));
    expect(nextTutorFallbackProvider(explicit, "openai-compatible")).toBeUndefined();
  });

  it("resolves the model per provider without depending on the gateway key", () => {
    const settings = getTutorProviderSettings(env({ GROQ_API_KEY: "mock-key", OMNIROUTE_MODEL: "gateway-model" }));
    expect(tutorModelForProvider("groq", settings, "selected-local")).toBe("openai/gpt-oss-120b");
    expect(tutorModelForProvider("openai-compatible", settings, "selected-local")).toBe("gateway-model");
    expect(tutorModelForProvider("ollama", settings, "selected-local")).toBe("selected-local");
    expect(tutorModelForProvider("ollama", settings, "")).toBe("qwen3:latest");
  });
});

describe("Canvas provider selection", () => {
  it("accepts openai-compatible and the omniroute alias for inference and OCR", () => {
    expect(canvasInferenceMode(env({ CANVAS_INFERENCE_PROVIDER: "openai-compatible" }))).toBe("openai-compatible");
    expect(canvasInferenceMode(env({ CANVAS_INFERENCE_PROVIDER: "omniroute" }))).toBe("openai-compatible");
    expect(canvasOCRMode(env({ CANVAS_OCR_PROVIDER: "omniroute" }))).toBe("openai-compatible");
    expect(providerChain(env({ CANVAS_PROVIDER_CHAIN: "groq,omniroute" }))).toEqual(["groq", "openai-compatible"]);
    expect(resolveCompletionProviders(env({ CANVAS_INFERENCE_PROVIDER: "omniroute" }))).toEqual(["openai-compatible"]);
    expect(resolveVisionProviders(env({ CANVAS_OCR_PROVIDER: "omniroute" }))).toEqual(["openai-compatible"]);
  });

  it("leaves the default canvas chain and modes unchanged", () => {
    expect(providerChain({})).toEqual(["groq", "opencode-go", "openrouter", "gemini"]);
    expect(canvasInferenceMode({})).toBe("groq");
    expect(resolveCompletionProviders(env({ CANVAS_INFERENCE_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,opencode-go,openrouter,gemini", GROQ_API_KEY: "g" }))).toEqual(["groq"]);
  });
});

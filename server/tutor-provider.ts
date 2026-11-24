import { DEFAULT_OMNIROUTE_BASE_URL, DEFAULT_OMNIROUTE_MODEL } from "./config.js";
import { geminiBaseUrl, geminiModel, opencodeGoBaseUrl, opencodeGoModel, opencodeGoSession, openRouterBaseUrl, openRouterModel } from "./canvas-intelligence/providers.js";

export type TutorProvider = "groq" | "ollama" | "openai-compatible" | "opencode-go" | "openrouter" | "gemini";
export type TutorProviderMode = "auto" | TutorProvider;

const EXPLICIT_MODES: readonly string[] = ["groq", "ollama", "openai-compatible", "opencode-go", "openrouter", "gemini"];

function requestedMode(env: NodeJS.ProcessEnv): TutorProviderMode {
  const requested = env.TUTOR_PROVIDER?.trim().toLowerCase();
  const normalized = requested === "omniroute" ? "openai-compatible" : requested;
  return normalized && EXPLICIT_MODES.includes(normalized) ? normalized as TutorProviderMode : "auto";
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const result = value === undefined || value.trim() === "" ? fallback : Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${name} must be a positive number.`);
  return result;
}

export function getTutorProviderSettings(env: NodeJS.ProcessEnv = process.env) {
  const mode = requestedMode(env);
  const groqConfigured = Boolean(env.GROQ_API_KEY?.trim());
  // A local gateway needs no key; any explicit OMNIROUTE_* setting opts it into auto mode.
  const omnirouteConfigured = Boolean(env.OMNIROUTE_BASE_URL?.trim() || env.OMNIROUTE_API_KEY?.trim() || env.OMNIROUTE_MODEL?.trim());
  const requiredKeys: Partial<Record<TutorProviderMode, { env: string; key: string }>> = {
    groq: { env: "GROQ_API_KEY", key: env.GROQ_API_KEY ?? "" },
    "opencode-go": { env: "OPENCODE_GO_API_KEY", key: env.OPENCODE_GO_API_KEY ?? "" },
    openrouter: { env: "OPENROUTER_API_KEY", key: env.OPENROUTER_API_KEY ?? "" },
    gemini: { env: "GOOGLE_AI_API_KEY", key: env.GOOGLE_AI_API_KEY ?? "" },
  };
  const required = requiredKeys[mode];
  if (required && !required.key.trim()) throw new Error(`TUTOR_PROVIDER=${mode} requires ${required.env}.`);
  const retries = Number(env.TUTOR_GROQ_RETRIES ?? 0);
  if (!Number.isInteger(retries) || retries < 0 || retries > 1) throw new Error("TUTOR_GROQ_RETRIES must be 0 or 1.");
  const maxCompletionTokens = Number(env.TUTOR_MAX_COMPLETION_TOKENS ?? 2048);
  if (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens < 1 || maxCompletionTokens > 32_768) throw new Error("TUTOR_MAX_COMPLETION_TOKENS must be an integer from 1 through 32768.");
  const maxProviderCalls = Number(env.TUTOR_MAX_PROVIDER_CALLS ?? 3);
  if (!Number.isInteger(maxProviderCalls) || maxProviderCalls < 1 || maxProviderCalls > 10) throw new Error("TUTOR_MAX_PROVIDER_CALLS must be an integer from 1 through 10.");
  const groqInputUsdPerMillion = positiveNumber(env.TUTOR_GROQ_INPUT_USD_PER_1M, 0.15, "TUTOR_GROQ_INPUT_USD_PER_1M");
  const groqOutputUsdPerMillion = positiveNumber(env.TUTOR_GROQ_OUTPUT_USD_PER_1M, 0.6, "TUTOR_GROQ_OUTPUT_USD_PER_1M");
  const maxGroqCostUsd = positiveNumber(env.TUTOR_MAX_GROQ_COST_USD, 0.02, "TUTOR_MAX_GROQ_COST_USD");
  const maxGroqCostPerCallUsd = (getContextBudget(env) * groqInputUsdPerMillion + maxCompletionTokens * groqOutputUsdPerMillion) / 1_000_000;
  const provider: TutorProvider = mode !== "auto" ? mode
    : groqConfigured ? "groq"
    : omnirouteConfigured ? "openai-compatible"
    : "ollama";
  return {
    mode,
    provider,
    groqConfigured,
    omnirouteConfigured,
    omnirouteBaseUrl: (env.OMNIROUTE_BASE_URL || DEFAULT_OMNIROUTE_BASE_URL).replace(/\/$/, ""),
    omnirouteApiKey: env.OMNIROUTE_API_KEY?.trim() || "",
    omnirouteModel: env.OMNIROUTE_MODEL?.trim() || DEFAULT_OMNIROUTE_MODEL,
    groqRetries: retries,
    maxCompletionTokens,
    maxProviderCalls,
    groqInputUsdPerMillion,
    groqOutputUsdPerMillion,
    maxGroqCostUsd,
    maxGroqCostPerCallUsd,
    groqModel: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    ollamaModel: env.OLLAMA_MODEL?.trim() || "qwen3:latest",
    opencodeGoBaseUrl: opencodeGoBaseUrl(env),
    opencodeGoApiKey: env.OPENCODE_GO_API_KEY?.trim() || "",
    opencodeGoModel: opencodeGoModel(env),
    opencodeGoSession: opencodeGoSession(env),
    openRouterBaseUrl: openRouterBaseUrl(env),
    openRouterApiKey: env.OPENROUTER_API_KEY?.trim() || "",
    openRouterModel: openRouterModel(env),
    geminiBaseUrl: geminiBaseUrl(env),
    geminiApiKey: env.GOOGLE_AI_API_KEY?.trim() || "",
    geminiModel: geminiModel(env),
  };
}

export type TutorProviderSettings = ReturnType<typeof getTutorProviderSettings>;

export function tutorModelForProvider(provider: TutorProvider, settings: TutorProviderSettings, selectedModel = ""): string {
  if (provider === "groq") return settings.groqModel;
  if (provider === "openai-compatible") return settings.omnirouteModel;
  if (provider === "opencode-go") return settings.opencodeGoModel;
  if (provider === "openrouter") return settings.openRouterModel;
  if (provider === "gemini") return settings.geminiModel;
  return selectedModel || settings.ollamaModel;
}

/**
 * Config-only view of the active Tutor provider, safe to show in the UI. Reads no key value,
 * makes no provider call, and never lets the disabled local picker stand in for the real model.
 */
export function tutorProviderStatus(env: NodeJS.ProcessEnv = process.env) {
  const mode = requestedMode(env);
  try {
    const settings = getTutorProviderSettings(env);
    const provider = settings.provider;
    const model = tutorModelForProvider(provider, settings);
    return {
      mode,
      provider,
      model,
      pickerActive: provider === "ollama",
      note: provider === "ollama"
        ? "The local model picker sets the Ollama model used by the Tutor."
        : `The local model picker is inactive: the Tutor uses ${provider} with ${model} from configuration (TUTOR_PROVIDER=${mode}).`,
    };
  } catch (error) {
    const provider: TutorProvider = mode !== "auto" ? mode as TutorProvider : "ollama";
    return {
      mode,
      provider,
      model: "",
      pickerActive: provider === "ollama",
      note: error instanceof Error ? error.message : "The Tutor provider is not configured.",
    };
  }
}

// Explicit modes are single-provider, like groq/ollama today. Only auto falls back.
export function nextTutorFallbackProvider(settings: TutorProviderSettings, current: TutorProvider): TutorProvider | undefined {
  if (settings.mode !== "auto") return undefined;
  if (current === "groq") return settings.omnirouteConfigured ? "openai-compatible" : "ollama";
  if (current === "openai-compatible") return "ollama";
  return undefined;
}

function getContextBudget(env: NodeJS.ProcessEnv): number {
  const raw = env.TUTOR_CONTEXT_BUDGET;
  if (raw === undefined || raw.trim() === "") return 16_384;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 512 || value > 131_072) throw new Error("TUTOR_CONTEXT_BUDGET must be an integer from 512 through 131072.");
  return value;
}

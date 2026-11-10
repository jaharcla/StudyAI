export type TutorProvider = "groq" | "ollama";
export type TutorProviderMode = "auto" | "groq" | "ollama";

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const result = value === undefined || value.trim() === "" ? fallback : Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${name} must be a positive number.`);
  return result;
}

export function getTutorProviderSettings(env: NodeJS.ProcessEnv = process.env) {
  const requestedMode = env.TUTOR_PROVIDER?.trim().toLowerCase();
  const mode: TutorProviderMode = requestedMode === "ollama" || requestedMode === "groq" ? requestedMode : "auto";
  const groqConfigured = Boolean(env.GROQ_API_KEY?.trim());
  if (mode === "groq" && !groqConfigured) throw new Error("TUTOR_PROVIDER=groq requires GROQ_API_KEY.");
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
  return {
    mode,
    provider: mode === "ollama" || (mode === "auto" && !groqConfigured) ? "ollama" as const : "groq" as const,
    groqConfigured,
    groqRetries: retries,
    maxCompletionTokens,
    maxProviderCalls,
    groqInputUsdPerMillion,
    groqOutputUsdPerMillion,
    maxGroqCostUsd,
    maxGroqCostPerCallUsd,
    groqModel: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    ollamaModel: env.OLLAMA_MODEL?.trim() || "qwen3:latest",
  };
}

function getContextBudget(env: NodeJS.ProcessEnv): number {
  const raw = env.TUTOR_CONTEXT_BUDGET;
  if (raw === undefined || raw.trim() === "") return 16_384;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 512 || value > 131_072) throw new Error("TUTOR_CONTEXT_BUDGET must be an integer from 512 through 131072.");
  return value;
}

import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { OMNIROUTE_PLACEHOLDER_API_KEY } from "./config.js";
import type { TutorProvider, TutorProviderSettings } from "./tutor-provider.js";

export type TutorChatModel = ChatOllama | ChatGroq | ChatOpenAI;

function openAICompatibleConnection(provider: Exclude<TutorProvider, "groq" | "ollama">, settings: TutorProviderSettings) {
  if (provider === "opencode-go") return { baseUrl: settings.opencodeGoBaseUrl, apiKey: settings.opencodeGoApiKey, headers: { "x-opencode-session": settings.opencodeGoSession } };
  if (provider === "openrouter") return { baseUrl: settings.openRouterBaseUrl, apiKey: settings.openRouterApiKey, headers: { "HTTP-Referer": "http://127.0.0.1:5183", "X-Title": "StudyAI MK3" } };
  if (provider === "gemini") return { baseUrl: settings.geminiBaseUrl, apiKey: settings.geminiApiKey, headers: {} };
  return { baseUrl: settings.omnirouteBaseUrl, apiKey: settings.omnirouteApiKey, headers: {} };
}

export function createTutorChatModel(provider: TutorProvider, model: string, settings: TutorProviderSettings): TutorChatModel {
  if (provider === "groq") return new ChatGroq({ apiKey: process.env.GROQ_API_KEY, model: settings.groqModel, temperature: 0.2, maxRetries: 0, maxTokens: settings.maxCompletionTokens, ...(settings.groqModel.startsWith("openai/gpt-oss-") ? { reasoningEffort: "low" as const } : {}) });
  if (provider !== "ollama") {
    const connection = openAICompatibleConnection(provider, settings);
    return new ChatOpenAI({
      apiKey: connection.apiKey || OMNIROUTE_PLACEHOLDER_API_KEY,
      model,
      temperature: 0.2,
      maxRetries: 0,
      maxTokens: settings.maxCompletionTokens,
      configuration: { baseURL: connection.baseUrl, defaultHeaders: connection.headers },
    });
  }
  const requestedContext = Number(process.env.TUTOR_OLLAMA_NUM_CTX || process.env.TUTOR_CONTEXT_BUDGET || 16384);
  const numCtx = Number.isFinite(requestedContext) ? Math.max(4096, Math.min(32768, Math.floor(requestedContext))) : 16384;
  return new ChatOllama({ baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434", model, temperature: 0.2, think: false, numCtx, numPredict: settings.maxCompletionTokens });
}

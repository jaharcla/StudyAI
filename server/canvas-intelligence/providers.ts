export type CanvasProviderId = "groq" | "opencode-go" | "openrouter" | "gemini" | "ollama";

export const DEFAULT_PROVIDER_CHAIN: CanvasProviderId[] = ["groq", "opencode-go", "openrouter", "gemini"];
const KNOWN_PROVIDERS = new Set<CanvasProviderId>(["groq", "opencode-go", "openrouter", "gemini", "ollama"]);

export function providerChain(env: NodeJS.ProcessEnv = process.env): CanvasProviderId[] {
  const raw = (env.CANVAS_PROVIDER_CHAIN || DEFAULT_PROVIDER_CHAIN.join(",")).trim();
  const ids = raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const chain: CanvasProviderId[] = [];
  for (const id of ids) {
    if (!KNOWN_PROVIDERS.has(id as CanvasProviderId)) throw new Error(`Unknown canvas provider in CANVAS_PROVIDER_CHAIN: ${id}`);
    if (!chain.includes(id as CanvasProviderId)) chain.push(id as CanvasProviderId);
  }
  if (!chain.length) throw new Error("CANVAS_PROVIDER_CHAIN must contain at least one provider.");
  return chain;
}

export function canvasInferenceMode(env: NodeJS.ProcessEnv = process.env): "groq" | "ollama" | "opencode-go" | "openrouter" | "auto" {
  const mode = (env.CANVAS_INFERENCE_PROVIDER || "groq").trim().toLowerCase();
  if (!["groq", "ollama", "opencode-go", "openrouter", "auto"].includes(mode)) throw new Error("CANVAS_INFERENCE_PROVIDER must be groq, ollama, opencode-go, openrouter, or auto");
  return mode as "groq" | "ollama" | "opencode-go" | "openrouter" | "auto";
}

export function canvasOCRMode(env: NodeJS.ProcessEnv = process.env): "groq" | "local" | "opencode-go" | "openrouter" | "auto" {
  const mode = (env.CANVAS_OCR_PROVIDER || "groq").trim().toLowerCase();
  if (!["groq", "local", "opencode-go", "openrouter", "auto"].includes(mode)) throw new Error("CANVAS_OCR_PROVIDER must be groq, local, opencode-go, openrouter, or auto");
  return mode as "groq" | "local" | "opencode-go" | "openrouter" | "auto";
}

export function providerConfigured(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  if (provider === "groq") return Boolean(env.GROQ_API_KEY);
  if (provider === "opencode-go") return Boolean(env.OPENCODE_GO_API_KEY);
  if (provider === "openrouter") return Boolean(env.OPENROUTER_API_KEY);
  if (provider === "gemini") return Boolean(env.GOOGLE_AI_API_KEY);
  return true;
}

export function resolveCompletionProviders(env: NodeJS.ProcessEnv = process.env): CanvasProviderId[] {
  const mode = canvasInferenceMode(env);
  if (mode === "ollama") return ["ollama"];
  if (mode !== "auto") return [mode];
  return providerChain(env).filter((provider) => provider !== "ollama" && providerConfigured(provider, env));
}

export function resolveVisionProviders(env: NodeJS.ProcessEnv = process.env): CanvasProviderId[] {
  const mode = canvasOCRMode(env);
  if (mode === "local") return ["ollama"];
  if (mode !== "auto") return [mode];
  return providerChain(env).filter((provider) => providerConfigured(provider, env));
}

export function resolveMathOCRProviders(env: NodeJS.ProcessEnv = process.env): CanvasProviderId[] {
  const configured = (env.CANVAS_MATH_OCR_PROVIDER || "").trim().toLowerCase();
  if (configured) {
    if (!KNOWN_PROVIDERS.has(configured as CanvasProviderId)) throw new Error(`Unknown CANVAS_MATH_OCR_PROVIDER: ${configured}`);
    return [configured as CanvasProviderId];
  }
  const chain: CanvasProviderId[] = [];
  if (env.GOOGLE_AI_API_KEY) chain.push("gemini");
  if (env.OPENROUTER_API_KEY) chain.push("openrouter");
  if (env.GROQ_API_KEY) chain.push("groq");
  return chain.length ? chain : resolveVisionProviders(env);
}

export function resolveDiagramOCRProviders(env: NodeJS.ProcessEnv = process.env): CanvasProviderId[] {
  const configured = (env.CANVAS_DIAGRAM_OCR_PROVIDER || "").trim().toLowerCase();
  if (configured) {
    if (!KNOWN_PROVIDERS.has(configured as CanvasProviderId)) throw new Error(`Unknown CANVAS_DIAGRAM_OCR_PROVIDER: ${configured}`);
    return [configured as CanvasProviderId];
  }
  const chain: CanvasProviderId[] = [];
  if (env.GOOGLE_AI_API_KEY) chain.push("gemini");
  if (env.OPENROUTER_API_KEY) chain.push("openrouter");
  if (env.GROQ_API_KEY) chain.push("groq");
  return chain.length ? chain : resolveVisionProviders(env);
}

export function mathOCRModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_MATH_OCR_MODEL || "google/gemini-3.1-flash-lite";
}

export function diagramOCRModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_DIAGRAM_OCR_MODEL || "google/gemini-3.1-flash-lite";
}

export function mathOCRModelFor(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): string {
  if (provider === "opencode-go") return env.CANVAS_OPENCODE_GO_MATH_OCR_MODEL || env.CANVAS_OPENCODE_GO_OCR_MODEL || "qwen3.8-flash";
  if (provider === "groq") return env.CANVAS_GROQ_MATH_OCR_MODEL || env.CANVAS_GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
  if (provider === "gemini") return env.CANVAS_GEMINI_MATH_OCR_MODEL || geminiModel(env);
  if (provider === "ollama") return env.CANVAS_OCR_MODEL || "glm-ocr:q8_0";
  return mathOCRModel(env);
}

export function diagramOCRModelFor(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): string {
  if (provider === "opencode-go") return env.CANVAS_OPENCODE_GO_OCR_MODEL || "qwen3.8-flash";
  if (provider === "groq") return env.CANVAS_GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
  if (provider === "gemini") return env.CANVAS_GEMINI_OCR_MODEL || geminiModel(env);
  if (provider === "ollama") return env.CANVAS_OCR_MODEL || "glm-ocr:q8_0";
  return diagramOCRModel(env);
}

export function opencodeGoBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPENCODE_GO_BASE_URL || "https://opencode.ai/inference/go/openai/v1").replace(/\/$/, "");
}

export function opencodeGoModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_OPENCODE_GO_MODEL || "qwen3.8-flash";
}

export function opencodeGoOCRModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_OPENCODE_GO_OCR_MODEL || "qwen3.8-flash";
}

export function opencodeGoSession(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENCODE_GO_SESSION || env.OPENCODE_SESSION_ID || "study-canvas";
}

export function openRouterBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

export function openRouterModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_OPENROUTER_MODEL || "qwen/qwen3-vl-8b-instruct";
}

export function openRouterOCRModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_OPENROUTER_OCR_MODEL || openRouterModel(env);
}

export function geminiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
}

export function geminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_GEMINI_MODEL || env.GEMINI_MODEL || "gemini-3.1-flash-lite";
}

export function geminiOCRModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CANVAS_GEMINI_OCR_MODEL || geminiModel(env);
}

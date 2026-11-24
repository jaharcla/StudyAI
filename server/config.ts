import "dotenv/config";

export const LOOPBACK_HOST = "127.0.0.1";

// Local OpenAI-compatible gateway (OmniRoute). The default is a gateway routing
// combo, not one fixed model; gateways that require auth need OMNIROUTE_API_KEY.
export const DEFAULT_OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
export const DEFAULT_OMNIROUTE_MODEL = "agnes/agnes-2.5-flash-high";
export const OMNIROUTE_PLACEHOLDER_API_KEY = "studyai-local-gateway";

export type StudyAIConfig = {
  webPort: number;
  runtimePort: number;
  dataPort: number;
  agentPort: number;
  webOrigin: string;
  tunnelOrigin?: string;
  allowedOrigins: string[];
  ollamaBaseUrl: string;
  ollamaModel: string;
  langgraphDeploymentUrl: string;
  omnirouteBaseUrl: string;
  omnirouteApiKey: string;
  omnirouteModel: string;
  canvasOmnirouteModel: string;
};

export function getStudyAIConfig(env: NodeJS.ProcessEnv = process.env): StudyAIConfig {
  const webPort = port(env.WEB_PORT, 5183);
  const runtimePort = port(env.RUNTIME_PORT ?? env.PORT, 8210);
  const dataPort = port(env.DATA_PORT, 8211);
  const agentPort = port(env.AGENT_PORT, 8133);
  const webOrigin = `http://${LOOPBACK_HOST}:${webPort}`;
  const tunnelOrigin = tunnelOriginFromEnv(env.KIMAKI_TUNNEL_URL);
  const allowedOrigins = [webOrigin, ...(tunnelOrigin ? [tunnelOrigin] : [])];
  return {
    webPort,
    runtimePort,
    dataPort,
    agentPort,
    webOrigin,
    ...(tunnelOrigin ? { tunnelOrigin } : {}),
    allowedOrigins,
    ollamaBaseUrl: (env.OLLAMA_BASE_URL || `http://${LOOPBACK_HOST}:11434`).replace(/\/$/, ""),
    ollamaModel: env.OLLAMA_MODEL || "qwen3:latest",
    langgraphDeploymentUrl: env.LANGGRAPH_DEPLOYMENT_URL || `http://${LOOPBACK_HOST}:${agentPort}`,
    omnirouteBaseUrl: (env.OMNIROUTE_BASE_URL || DEFAULT_OMNIROUTE_BASE_URL).replace(/\/$/, ""),
    omnirouteApiKey: env.OMNIROUTE_API_KEY?.trim() || "",
    omnirouteModel: env.OMNIROUTE_MODEL?.trim() || DEFAULT_OMNIROUTE_MODEL,
    canvasOmnirouteModel: env.CANVAS_OMNIROUTE_MODEL?.trim() || env.OMNIROUTE_MODEL?.trim() || DEFAULT_OMNIROUTE_MODEL,
  };
}

export function tunnelOriginFromEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function isAllowedOrigin(origin: string | undefined, config: StudyAIConfig): boolean {
  if (!origin) return true;
  return config.allowedOrigins.includes(origin);
}

export function rejectUntrustedRequest(
  req: { method?: string; headers?: { host?: string; origin?: string } },
  config: StudyAIConfig = getStudyAIConfig(),
): string | null {
  const port = config.dataPort;
  const allowedHosts = new Set([`${LOOPBACK_HOST}:${port}`, `localhost:${port}`]);
  const readOnlyMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  if (!allowedHosts.has(req.headers?.host ?? "")) return "Request host is not allowed.";
  const origin = req.headers?.origin;
  if (!readOnlyMethods.has(req.method ?? "GET") && origin !== undefined && !config.allowedOrigins.includes(origin)) return "Request origin is not allowed.";
  return null;
}

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error(`Invalid service port: ${value}`);
  return parsed;
}

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
  return {
    webPort,
    runtimePort,
    dataPort,
    agentPort,
    webOrigin: `http://${LOOPBACK_HOST}:${webPort}`,
    ollamaBaseUrl: (env.OLLAMA_BASE_URL || `http://${LOOPBACK_HOST}:11434`).replace(/\/$/, ""),
    ollamaModel: env.OLLAMA_MODEL || "qwen3:latest",
    langgraphDeploymentUrl: env.LANGGRAPH_DEPLOYMENT_URL || `http://${LOOPBACK_HOST}:${agentPort}`,
    omnirouteBaseUrl: (env.OMNIROUTE_BASE_URL || DEFAULT_OMNIROUTE_BASE_URL).replace(/\/$/, ""),
    omnirouteApiKey: env.OMNIROUTE_API_KEY?.trim() || "",
    omnirouteModel: env.OMNIROUTE_MODEL?.trim() || DEFAULT_OMNIROUTE_MODEL,
    canvasOmnirouteModel: env.CANVAS_OMNIROUTE_MODEL?.trim() || env.OMNIROUTE_MODEL?.trim() || DEFAULT_OMNIROUTE_MODEL,
  };
}

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error(`Invalid service port: ${value}`);
  return parsed;
}

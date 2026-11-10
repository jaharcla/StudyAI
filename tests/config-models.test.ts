import { describe, expect, it, vi } from "vitest";
import { getStudyAIConfig } from "../server/config";
import { getActiveModelStatus, getModelStatus } from "../server/models";
import { getTutorProviderSettings } from "../server/tutor-provider";

describe("configuration defaults", () => {
  it("retains the local development defaults", () => {
    expect(getStudyAIConfig({} as NodeJS.ProcessEnv)).toMatchObject({ webPort: 5183, runtimePort: 8210, dataPort: 8211, agentPort: 8133, webOrigin: "http://127.0.0.1:5183", ollamaModel: "qwen3:latest", langgraphDeploymentUrl: "http://127.0.0.1:8133" });
  });

  it("uses configured ports and service URLs", () => {
    expect(getStudyAIConfig({ WEB_PORT: "5190", RUNTIME_PORT: "8220", DATA_PORT: "8221", AGENT_PORT: "8140", OLLAMA_BASE_URL: "http://ollama.local/", LANGGRAPH_DEPLOYMENT_URL: "http://graph.local" } as NodeJS.ProcessEnv)).toMatchObject({ webPort: 5190, runtimePort: 8220, dataPort: 8221, agentPort: 8140, webOrigin: "http://127.0.0.1:5190", ollamaBaseUrl: "http://ollama.local", langgraphDeploymentUrl: "http://graph.local" });
  });

  it("rejects invalid service ports", () => {
    expect(() => getStudyAIConfig({ WEB_PORT: "80" } as NodeJS.ProcessEnv)).toThrow("Invalid service port");
  });
});

describe("Ollama availability", () => {
  it("reports a missing service without claiming a connection", async () => {
    const status = await getModelStatus("http://ollama", "local-model", vi.fn(async () => { throw new Error("offline"); }) as typeof fetch);
    expect(status).toMatchObject({ status: 503, body: { connected: false, models: [], configuredModel: "local-model", error: "Ollama is unavailable" } });
  });

  it("reports a configured but empty model list accurately", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const status = await getModelStatus("http://ollama", "local-model", fetcher as typeof fetch);
    expect(status).toMatchObject({ status: 200, body: { connected: true, models: [], configuredModel: "local-model" } });
  });
});

describe("active model provider", () => {
  it("reports configured Groq without probing Ollama", async () => {
    const settings = getTutorProviderSettings({ TUTOR_PROVIDER: "groq", GROQ_API_KEY: "test-key", GROQ_MODEL: "groq-model" } as NodeJS.ProcessEnv);
    const fetcher = vi.fn();
    const status = await getActiveModelStatus(settings, "http://ollama", fetcher as typeof fetch);

    expect(status).toEqual({
      status: 200,
      body: {
        provider: "Groq",
        connected: true,
        models: [{ name: "groq-model", size: 0 }],
        configuredModel: "groq-model",
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the Ollama health check when Ollama is selected", async () => {
    const settings = getTutorProviderSettings({ TUTOR_PROVIDER: "ollama", OLLAMA_MODEL: "local-model" } as NodeJS.ProcessEnv);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "local-model", size: 42 }] }), { status: 200 }));
    const status = await getActiveModelStatus(settings, "http://ollama", fetcher as typeof fetch);

    expect(status.body).toMatchObject({ provider: "Ollama", connected: true, configuredModel: "local-model" });
    expect(fetcher).toHaveBeenCalledWith("http://ollama/api/tags");
  });
});

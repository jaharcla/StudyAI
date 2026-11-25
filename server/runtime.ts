import "dotenv/config";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { CopilotKitIntelligence, CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { createCopilotNodeHandler } from "@copilotkit/runtime/v2/node";
import type { AbstractAgent } from "@ag-ui/client";
import { getStudyAIConfig, LOOPBACK_HOST } from "./config.js";
import { StudentSafeLangGraphAgent } from "./tutor-event-filter.js";

process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";

export function createRuntime(env: NodeJS.ProcessEnv = process.env): CopilotRuntime {
  const config = getStudyAIConfig(env);
  const apiKey = env.CPK_INTELLIGENCE_API_KEY?.trim() || "";
  const intelligence = apiKey
    ? new CopilotKitIntelligence({
        apiKey,
        getLearningContainerId: ({ agentId }) => (agentId === "studyai" ? "studyai-mk3" : undefined),
      })
    : undefined;

  const options = {
    identifyUser: () => ({ id: "local-single-user", name: "Local user" }),
    // Expose the read-only memory proxy so the client gets a clean response
    // instead of a 403/404, while the local app never writes study data to the
    // Intelligence platform.
    memory: { access: () => ({ user: "read", project: "read" } as const) },
    agents: {
      studyai: new StudentSafeLangGraphAgent({
        deploymentUrl: config.langgraphDeploymentUrl,
        graphId: "studyai",
        langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
      }) as unknown as AbstractAgent,
    },
  };
  return intelligence ? new CopilotRuntime({ ...options, intelligence }) : new CopilotRuntime(options);
}

const isMainModule = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const config = getStudyAIConfig();
  const handler = createCopilotRuntimeHandler({ runtime: createRuntime(), basePath: "/api/copilotkit" });
  const server = createServer(createCopilotNodeHandler(handler));
  server.listen(config.runtimePort, LOOPBACK_HOST, () => console.log(`StudyAI runtime on http://${LOOPBACK_HOST}:${config.runtimePort}`));
}

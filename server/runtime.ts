import "dotenv/config";
import { createServer } from "node:http";
import { CopilotKitIntelligence, CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { createCopilotNodeHandler } from "@copilotkit/runtime/v2/node";
import type { AbstractAgent } from "@ag-ui/client";
import { getStudyAIConfig, LOOPBACK_HOST } from "./config.js";

process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
const config = getStudyAIConfig();

const intelligence = new CopilotKitIntelligence({
  apiKey: process.env.CPK_INTELLIGENCE_API_KEY!,
  getLearningContainerId: ({ agentId }) => (agentId === "studyai" ? "studyai-mk3" : undefined),
});

const runtime = new CopilotRuntime({
  intelligence,
  identifyUser: () => ({ id: "local-single-user", name: "Local user" }),
  // Expose the read-only memory proxy so the client gets a clean response
  // instead of a 403/404, while the local app never writes study data to the
  // Intelligence platform.
  memory: { access: () => ({ user: "read", project: "read" }) },
  agents: {
    studyai: new LangGraphAgent({
      deploymentUrl: config.langgraphDeploymentUrl,
      graphId: "studyai",
      langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
    }) as unknown as AbstractAgent,
  },
});
const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });
const server = createServer(createCopilotNodeHandler(handler));
server.listen(config.runtimePort, LOOPBACK_HOST, () => console.log(`StudyAI runtime on http://${LOOPBACK_HOST}:${config.runtimePort}`));

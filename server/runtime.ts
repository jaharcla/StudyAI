import "dotenv/config";
import { createServer } from "node:http";
import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { createCopilotNodeHandler } from "@copilotkit/runtime/v2/node";
import type { AbstractAgent } from "@ag-ui/client";

process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";

const runtime = new CopilotRuntime({
  identifyUser: () => ({ id: "local-single-user", name: "Local user" }),
  agents: {
    studyai: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://127.0.0.1:8123",
      graphId: "studyai",
      langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
    }) as unknown as AbstractAgent,
  },
});
const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });
const server = createServer(createCopilotNodeHandler(handler));
server.listen(Number(process.env.PORT ?? 8200), "127.0.0.1", () => console.log(`StudyAI runtime on http://127.0.0.1:${process.env.PORT ?? 8200}`));

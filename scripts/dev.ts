import "dotenv/config";
import concurrently from "concurrently";
import { getStudyAIConfig, LOOPBACK_HOST } from "../server/config.js";

const config = getStudyAIConfig();
const ports = { WEB_PORT: config.webPort, RUNTIME_PORT: config.runtimePort, DATA_PORT: config.dataPort, AGENT_PORT: config.agentPort };
if (new Set(Object.values(ports)).size !== 4) throw new Error("Service ports must be distinct");
for (const [key, value] of Object.entries(ports)) process.env[key] = String(value);
process.env.LANGGRAPH_DEPLOYMENT_URL ??= config.langgraphDeploymentUrl;
const { result } = concurrently([
  { name: "agent", command: `langgraphjs dev --host ${LOOPBACK_HOST} --port ${config.agentPort} --no-browser --no-reload` },
  { name: "runtime", command: "tsx server/runtime.ts" },
  { name: "data", command: "tsx server/api.ts" },
  { name: "web", command: process.env.STUDYAI_E2E_PRODUCTION === "1" ? `vite preview --host ${LOOPBACK_HOST}` : `vite --host ${LOOPBACK_HOST}` },
], { killOthersOn: ["failure", "success"] });
await result.catch(() => { process.exitCode = 1; });

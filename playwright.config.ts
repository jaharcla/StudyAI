import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { getStudyAIConfig } from "./server/config.js";

const config = getStudyAIConfig();
const webPort = String(config.webPort);
const testData = resolve(`data/e2e-${Date.now()}`);

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: config.webOrigin, ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  webServer: {
    command: "npm run dev", url: `${config.webOrigin}/api/courses`, reuseExistingServer: false, timeout: 120_000,
    env: { WEB_PORT: webPort, RUNTIME_PORT: String(config.runtimePort), DATA_PORT: String(config.dataPort), AGENT_PORT: String(config.agentPort), STUDYAI_DB: resolve(testData, "studyai.sqlite"), STUDYAI_DOCUMENTS: resolve(testData, "documents"), LANGGRAPH_DEPLOYMENT_URL: config.langgraphDeploymentUrl },
  },
});

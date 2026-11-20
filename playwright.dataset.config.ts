import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { getStudyAIConfig } from "./server/config.js";

const servicePorts = { WEB_PORT: "5193", RUNTIME_PORT: "8201", DATA_PORT: "8212", AGENT_PORT: "8134" };
const deploymentUrl = `http://127.0.0.1:${servicePorts.AGENT_PORT}`;
const config = getStudyAIConfig({ ...process.env, ...servicePorts, LANGGRAPH_DEPLOYMENT_URL: deploymentUrl });
const dataDir = resolve("data/canvas-dataset-benchmark");
const databasePath = process.env.STUDYAI_E2E_DB ?? resolve(dataDir, "studyai.sqlite");

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: config.webOrigin, ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["json", { outputFile: "test-results/canvas-dataset-results.json" }]],
  webServer: {
    command: "npm run dev",
    url: `${config.webOrigin}/api/courses`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...servicePorts, STUDYAI_DB: databasePath, STUDYAI_DOCUMENTS: resolve(dataDir, "documents"), STUDYAI_E2E_PRODUCTION: "0", LANGGRAPH_DEPLOYMENT_URL: deploymentUrl },
  },
});

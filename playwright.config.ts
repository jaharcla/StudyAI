import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { getStudyAIConfig } from "./server/config.js";

const config = getStudyAIConfig();
const webPort = String(config.webPort);
const testData = resolve(`data/e2e-${Date.now()}`);
const databasePath = process.env.STUDYAI_E2E_DB ? resolve(process.env.STUDYAI_E2E_DB) : resolve(testData, "studyai.sqlite");
const wholeBoardExperiment = process.env.STUDYAI_WHOLE_BOARD_SCENE_EXPERIMENT === "1";
const outputDir = wholeBoardExperiment ? ".experiment-artifacts/whole-board-scene/playwright" : "test-results";

export default defineConfig({
  testDir: "./tests/e2e",
  // The dataset benchmark needs its seeded database and dedicated ports; run it with playwright.dataset.config.ts.
  testIgnore: "**/canvas-dataset-benchmark.spec.ts",
  outputDir,
  workers: 1,
  // One server and one SQLite database are shared by every spec. Slow saves and
  // in-flight analysis requests can outlive a test; give assertions enough time
  // and retry transient cross-test interference rather than failing the chain.
  retries: 2,
  expect: { timeout: 15_000 },
  use: { baseURL: config.webOrigin, ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure", actionTimeout: 15_000, navigationTimeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: `${outputDir}/results.json` }]],
  webServer: {
    command: "npm run dev", url: `${config.webOrigin}/api/copilotkit/info`, reuseExistingServer: !process.env.CI, timeout: 120_000,
    env: { WEB_PORT: webPort, RUNTIME_PORT: String(config.runtimePort), DATA_PORT: String(config.dataPort), AGENT_PORT: String(config.agentPort), STUDYAI_DB: databasePath, STUDYAI_DOCUMENTS: resolve(testData, "documents"), STUDYAI_E2E_PRODUCTION: process.env.STUDYAI_E2E_PRODUCTION ?? "0", LANGGRAPH_DEPLOYMENT_URL: config.langgraphDeploymentUrl },
  },
});

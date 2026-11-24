import { defineConfig, devices } from "@playwright/test";

// Opt-in chart renderer spec only: this boots Vite, with no data API,
// runtime, or CopilotKit Intelligence key required.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "vega-chart-tool.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5313", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5313",
    url: "http://127.0.0.1:5313",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

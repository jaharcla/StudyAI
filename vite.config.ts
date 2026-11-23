import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { getStudyAIConfig, LOOPBACK_HOST } from "./server/config.js";

const config = getStudyAIConfig();
const proxy = {
  "/api/copilotkit": { target: `http://${LOOPBACK_HOST}:${config.runtimePort}`, changeOrigin: true },
  "/api": { target: `http://${LOOPBACK_HOST}:${config.dataPort}`, changeOrigin: true },
};
export default defineConfig({
  plugins: [react()],
  server: { host: LOOPBACK_HOST, port: config.webPort, strictPort: true, proxy, watch: { ignored: ["**/data/**", "**/.worktrees/**"] } },
  preview: { host: LOOPBACK_HOST, port: config.webPort, strictPort: true, proxy },
  test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup/node-offscreen-canvas.ts"], env: { CANVAS_RECOGNITION: "baseline", CANVAS_RECOGNITION_ALLOW_DOWNLOAD: "0" } },
});

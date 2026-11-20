import { setTimeout as delay } from "node:timers/promises";
import { getStudyAIConfig, LOOPBACK_HOST } from "../server/config.js";

const config = getStudyAIConfig();
const endpoints = [
  `http://${LOOPBACK_HOST}:${config.dataPort}/api/courses`,
  `http://${LOOPBACK_HOST}:${config.runtimePort}/api/copilotkit/info`,
  `http://${LOOPBACK_HOST}:${config.agentPort}/ok`,
];
const deadline = Date.now() + 120_000;

while (Date.now() < deadline) {
  const ready = await Promise.all(endpoints.map(async (url) => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok; }
    catch { return false; }
  }));
  if (ready.every(Boolean)) process.exit(0);
  await delay(250);
}

throw new Error("StudyAI local services did not become ready within 120 seconds.");

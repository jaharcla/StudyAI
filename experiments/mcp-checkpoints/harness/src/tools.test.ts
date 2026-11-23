import { describe, expect, it } from "vitest";
import { toolEfficiency, type ToolTrace } from "./tools";

const completed: ToolTrace = {
  surface: "current",
  taskId: "signup-flow",
  calls: 6,
  inputTokens: 1000,
  outputTokens: 500,
  invalidCalls: 1,
  retries: 2,
  durationMs: 3000,
  artifactQuality: 0.8,
  completed: true,
};

describe("toolEfficiency", () => {
  it("reports calls, tokens, invalid calls, retries and latency per successful task", () => {
    const m = toolEfficiency(completed);
    expect(m.callsPerSuccess).toBe(6);
    expect(m.inputTokensPerSuccess).toBe(1000);
    expect(m.outputTokensPerSuccess).toBe(500);
    expect(m.invalidCallsPerSuccess).toBe(1);
    expect(m.retriesPerSuccess).toBe(2);
    expect(m.latencyMsPerSuccess).toBe(3000);
    expect(m.artifactQuality).toBe(0.8);
    expect(m.completed).toBe(true);
  });

  it("does not divide by zero when a task failed", () => {
    const m = toolEfficiency({ ...completed, completed: false, calls: 9 });
    expect(m.callsPerSuccess).toBeNull();
    expect(m.inputTokensPerSuccess).toBeNull();
    expect(m.completed).toBe(false);
    expect(m.artifactQuality).toBe(0.8);
  });
});

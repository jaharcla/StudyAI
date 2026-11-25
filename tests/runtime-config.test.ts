import { afterEach, describe, expect, it, vi } from "vitest";
import { isIntelligenceRuntime } from "@copilotkit/runtime/v2";

const originalKey = process.env.CPK_INTELLIGENCE_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  if (originalKey === undefined) delete process.env.CPK_INTELLIGENCE_API_KEY;
  else process.env.CPK_INTELLIGENCE_API_KEY = originalKey;
});

describe("CopilotKit Intelligence is opt-in", () => {
  it("boots in local SSE mode with no API key", async () => {
    process.env.CPK_INTELLIGENCE_API_KEY = "";
    await expect(import("../server/runtime")).resolves.toBeDefined();
    const { createRuntime } = await import("../server/runtime");
    expect(isIntelligenceRuntime(createRuntime({ CPK_INTELLIGENCE_API_KEY: "" } as NodeJS.ProcessEnv))).toBe(false);
  });

  it("treats a blank API key as local SSE mode", async () => {
    process.env.CPK_INTELLIGENCE_API_KEY = "   ";
    const { createRuntime } = await import("../server/runtime");
    expect(isIntelligenceRuntime(createRuntime({ CPK_INTELLIGENCE_API_KEY: "   " } as NodeJS.ProcessEnv))).toBe(false);
  });

  it("selects Intelligence wiring for a configured key without a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.CPK_INTELLIGENCE_API_KEY = "dummy-key";
    const { createRuntime } = await import("../server/runtime");
    expect(isIntelligenceRuntime(createRuntime({ CPK_INTELLIGENCE_API_KEY: "dummy-key" } as NodeJS.ProcessEnv))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

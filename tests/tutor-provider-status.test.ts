import { describe, expect, it } from "vitest";
import { tutorProviderStatus } from "../server/tutor-provider.js";

describe("tutor provider status for the UI", () => {
  it("shows the configured opencode-go model and explains the inactive local picker without a provider call", () => {
    const status = tutorProviderStatus({
      TUTOR_PROVIDER: "opencode-go",
      OPENCODE_GO_API_KEY: "not-a-real-key",
      CANVAS_OPENCODE_GO_MODEL: "hy4-flash-free",
    } as NodeJS.ProcessEnv);
    expect(status).toMatchObject({ mode: "opencode-go", provider: "opencode-go", model: "hy4-flash-free", pickerActive: false });
    expect(status.note).toContain("inactive");
    expect(status.note).toContain("hy4-flash-free");
  });

  it("keeps the picker active only for Ollama", () => {
    const status = tutorProviderStatus({ TUTOR_PROVIDER: "ollama", OLLAMA_MODEL: "qwen3:latest" } as NodeJS.ProcessEnv);
    expect(status).toMatchObject({ provider: "ollama", model: "qwen3:latest", pickerActive: true });
  });

  it("reports a missing explicit key plainly instead of blaming Ollama", () => {
    const status = tutorProviderStatus({ TUTOR_PROVIDER: "opencode-go" } as NodeJS.ProcessEnv);
    expect(status.pickerActive).toBe(false);
    expect(status.model).toBe("");
    expect(status.note).toContain("OPENCODE_GO_API_KEY");
  });
});

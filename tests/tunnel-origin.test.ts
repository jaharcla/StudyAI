import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tunnel origin guard", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("accepts a tunnel-origin POST and rejects an arbitrary origin", async () => {
    vi.stubEnv("KIMAKI_TUNNEL_URL", "https://abc123.opentunnel.xyz");
    const { getStudyAIConfig, rejectUntrustedRequest } = await import("../server/config.js");
    const config = getStudyAIConfig(process.env);
    expect(config.tunnelOrigin).toBe("https://abc123.opentunnel.xyz");
    expect(config.allowedOrigins).toContain("https://abc123.opentunnel.xyz");

    const dataPort = config.dataPort;
    const host = `127.0.0.1:${dataPort}`;
    const accepted = rejectUntrustedRequest({
      method: "POST",
      headers: { host, origin: "https://abc123.opentunnel.xyz" },
    });
    expect(accepted).toBeNull();

    const rejected = rejectUntrustedRequest({
      method: "POST",
      headers: { host, origin: "https://evil.example" },
    });
    expect(rejected).toBe("Request origin is not allowed.");
  });

  it("preserves loopback defaults when no tunnel env is set", async () => {
    vi.stubEnv("KIMAKI_TUNNEL_URL", "");
    const { getStudyAIConfig } = await import("../server/config.js");
    const config = getStudyAIConfig(process.env);
    expect(config.webOrigin).toBe("http://127.0.0.1:5183");
    expect(config.tunnelOrigin).toBeUndefined();
    expect(config.allowedOrigins).toEqual(["http://127.0.0.1:5183"]);
  });
});
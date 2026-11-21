import { describe, expect, it } from "vitest";
import {
  isRetryableFailure,
  mapFinishReason,
  mapHttpStatus,
  provenanceForStage,
  resolveStageProviders,
} from "../server/canvas-intelligence/failure-contract.js";

describe("mapFinishReason", () => {
  it("treats only a clean stop as a whole answer", () => {
    expect(mapFinishReason("stop")).toBeNull();
    expect(mapFinishReason("end_turn")).toBeNull();
  });

  it("maps an output cap to truncated with the cap recorded", () => {
    const failure = mapFinishReason("length", { cappedTo: 2048, partialText: "partial" });
    expect(failure?.kind).toBe("truncated");
    expect(failure?.detail.cappedTo).toBe(2048);
    expect(failure?.detail.partialText).toBe("partial");
    expect(failure?.retryable).toBe(false);
  });

  it("maps filter endings and missing reasons to incomplete", () => {
    expect(mapFinishReason("content_filter")?.kind).toBe("incomplete");
    expect(mapFinishReason("tool_calls")?.kind).toBe("incomplete");
    expect(mapFinishReason(null)?.kind).toBe("incomplete");
    expect(mapFinishReason("something_new")?.kind).toBe("incomplete");
  });
});

describe("mapHttpStatus", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "credit"],
    [404, "model_missing"],
    [400, "unsupported"],
  ])("maps %i to %s and never retries it", (status, kind) => {
    const failure = mapHttpStatus(status);
    expect(failure?.kind).toBe(kind);
    expect(isRetryableFailure(failure!)).toBe(false);
  });

  it("maps rate limits and transient server errors to retryable failures", () => {
    const rate = mapHttpStatus(429, 12);
    expect(rate?.kind).toBe("rate_limit");
    expect(rate?.detail.retryAfterSeconds).toBe(12);
    expect(isRetryableFailure(rate!)).toBe(true);
    for (const status of [500, 502, 503, 504]) {
      expect(mapHttpStatus(status)?.kind).toBe("network");
      expect(isRetryableFailure(mapHttpStatus(status)!)).toBe(true);
    }
  });

  it("returns null for a successful status", () => {
    expect(mapHttpStatus(200)).toBeNull();
  });
});

describe("resolveStageProviders", () => {
  it("never selects a provider without the capability the stage needs", () => {
    const chain = resolveStageProviders({
      stage: "ocr",
      env: { CANVAS_OCR_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,ollama", GROQ_API_KEY: "k" },
      capabilities: { groq: { completion: true, vision: false, structuredOutput: true, streaming: true }, ollama: { completion: true, vision: true, structuredOutput: false, streaming: false } },
    });
    expect(chain).toEqual(["ollama"]);
  });

  it("keeps chain order for a completion stage", () => {
    const chain = resolveStageProviders({
      stage: "structure",
      env: { CANVAS_INFERENCE_PROVIDER: "auto", CANVAS_PROVIDER_CHAIN: "groq,ollama", GROQ_API_KEY: "k" },
    });
    expect(chain).toEqual(["groq"]);
  });
});

describe("provenanceForStage", () => {
  it("reports the effective provider and model instead of the system placeholder", () => {
    const result = provenanceForStage("ocr", [{
      stage: "ocr",
      provider: "groq",
      model: "qwen/qwen3.8-27b",
      tier: "strong",
      capabilities: { completion: true, vision: true, structuredOutput: true, streaming: true },
      fallbacksUsed: [],
      failure: null,
    }]);
    expect(result.provider).toBe("groq");
    expect(result.model).toBe("qwen/qwen3.8-27b");
    expect(result.method).toContain("groq");
    expect(result.provider).not.toBe("system");
  });

  it("falls back to system only when no invocation was recorded", () => {
    expect(provenanceForStage("fusion", []).provider).toBe("system");
  });
});

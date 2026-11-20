import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCanvasRecognitionCache, understandCanvas } from "../server/canvas-intelligence/service.js";

afterEach(() => { vi.unstubAllEnvs(); clearCanvasRecognitionCache(); });

// Ollama is opt-in on this branch, so the local fallback is exercised by listing
// it in the vision chain. The invariant from #3 is unchanged: a local fallback
// must not be cached under the cloud provider's key, or a temporary 503 would be
// cached for the whole session and cloud OCR would never be retried.
describe("canvas OCR recovery", () => {
  it("retries cloud recognition after a temporary failure instead of caching its local fallback as cloud output", async () => {
    vi.stubEnv("CANVAS_OCR_PROVIDER", "auto");
    vi.stubEnv("CANVAS_PROVIDER_CHAIN", "groq,ollama");
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "ollama");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("CANVAS_GROQ_MAX_REQUESTS_PER_MINUTE", "100");
    clearCanvasRecognitionCache();
    let cloudCalls = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("api.groq.com")) {
        cloudCalls++;
        if (cloudCalls === 1) return Response.json({ error: "temporary" }, { status: 503 });
        return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ text: "cloud", kind: "word", confidence: null, alternatives: [] }], uncertain: true }) } }] });
      }
      if (target.endsWith("/api/tags")) return Response.json({ models: [{ name: "ocr:test" }, { name: "reason:test" }] });
      const body = JSON.parse(String(init?.body));
      const content = body.model === "ocr:test" ? "local" : JSON.stringify({ objects: [], relationships: [], observations: [], ambiguities: [] });
      return Response.json({ message: { content } });
    }) as typeof fetch;
    const args = { boardId: "recovery-test", snapshot: { document: { store: {} } }, image: { base64: "aW1hZ2U=" }, userQuestion: "Read this", mode: "recognize" as const, models: { ocr: "ocr:test", reasoning: "reason:test", fusion: "fusion:test" }, fetcher };

    const first = await understandCanvas(args);
    expect(first.ocr?.items[0].text).toBe("local");

    const second = await understandCanvas(args);
    expect(cloudCalls).toBe(2);
    expect(second.ocr?.items[0].text).toBe("cloud");

    const third = await understandCanvas(args);
    expect(cloudCalls).toBe(2);
    expect(third.cached).toContain("ocr");
  });
});

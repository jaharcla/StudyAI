import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCanvasRecognitionCache, understandCanvas } from "../server/canvas-intelligence/service.js";

afterEach(() => { vi.unstubAllEnvs(); clearCanvasRecognitionCache(); });
describe("canvas reasoning recovery", () => {
  it("retries cloud reasoning after a local fallback and caches the recovered result", async () => {
    vi.stubEnv("CANVAS_OCR_PROVIDER", "local");
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    clearCanvasRecognitionCache();
    let cloudCalls = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("api.groq.com")) {
        cloudCalls++;
        if (cloudCalls === 1) return Response.json({ error: "temporary" }, { status: 503 });
        return Response.json({ choices: [{ message: { content: JSON.stringify({ objects: [], relationships: [], observations: [{ description: "cloud", sourceIds: ["a"], confidence: 0.5, basis: "model" }], ambiguities: [] }) } }] });
      }
      if (target.endsWith("/api/tags")) return Response.json({ models: [{ name: "ocr:test" }, { name: "reason:test" }] });
      const body = JSON.parse(String(init?.body));
      const content = body.model === "ocr:test" ? "label" : JSON.stringify({ objects: [], relationships: [], observations: [{ description: "local", sourceIds: ["a"], confidence: 0.5, basis: "model" }], ambiguities: [] });
      return Response.json({ message: { content } });
    }) as typeof fetch;
    const args = { boardId: "reasoning-recovery", snapshot: { document: { store: { a: { id: "a", type: "shape", x: 0, y: 0, width: 20, height: 20 } } } }, image: { base64: "aW1hZ2U=" }, userQuestion: "Read this", mode: "recognize" as const, models: { ocr: "ocr:test", reasoning: "reason:test", fusion: "fusion:test" }, fetcher };
    const first = await understandCanvas(args);
    expect(first.structure.observations[0].description).toBe("local");
    const second = await understandCanvas(args);
    expect(cloudCalls).toBe(2);
    expect(second.structure.observations[0].description).toBe("cloud");
    const third = await understandCanvas(args);
    expect(cloudCalls).toBe(2);
    expect(third.cached).toContain("structure");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCanvasRecognitionCache, understandCanvas } from "../server/canvas-intelligence/service.js";

afterEach(() => { vi.unstubAllEnvs(); clearCanvasRecognitionCache(); });
describe("scientific-object-only canvas", () => {
  it("analyzes structured objects without asking an OCR model to read an empty image", async () => {
    vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "ollama");
    vi.stubEnv("CANVAS_OCR_PROVIDER", "local");
    clearCanvasRecognitionCache();
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/api/tags")) return Response.json({ models: [{ name: "reason:test" }, { name: "fusion:test" }] });
      const body = JSON.parse(String(init?.body)); calls.push(body.model);
      const content = body.model === "reason:test"
        ? { objects: [], relationships: [], observations: [], ambiguities: [] }
        : { answer: "A vector.", objects: [], relationships: [], associations: [], uncertainties: [] };
      return Response.json({ message: { content: JSON.stringify(content) } });
    }) as typeof fetch;
    const result = await understandCanvas({ boardId: "scientific-only", snapshot: { document: { store: {} } }, scientificObjects: [{ id: "v", kind: "vector", x: 1, y: 1, width: 40, height: 30, components: [3, 4, 0], label: "F" }], userQuestion: "Describe this", mode: "deep", skipOcr: true, models: { ocr: "ocr:test", reasoning: "reason:test", fusion: "fusion:test" }, fetcher });
    expect(result.answer).toBe("A vector.");
    expect(result.ocr?.items).toEqual([]);
    expect(result.evidence?.evidence.some((item) => item.subjectId === "v" && item.origin === "native")).toBe(true);
    expect(calls).toEqual(["reason:test", "fusion:test"]);
  });
});

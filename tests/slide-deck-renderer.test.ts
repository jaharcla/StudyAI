import { describe, expect, it, vi } from "vitest";
import { renderPresentonDeck, type RendererDeps } from "../server/presentations/renderer";
import type { PresentonGenerateRequest } from "../server/presentations/compile";

const request: PresentonGenerateRequest = {
  content: "",
  slides_markdown: ["# Friction"],
  n_slides: 1,
  template: "general",
  language: "English",
  export_as: "pptx",
  include_title_slide: false,
};

const jsonResponse = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
} as Response);

describe("renderPresentonDeck", () => {
  it("posts the request with bearer auth and strips the app_data prefix", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      presentation_id: "p1",
      path: "/app_data/p1/final.pptx",
      edit_path: "/presentation?id=p1",
    }));
    const deps: RendererDeps = { fetch: fetchMock as unknown as typeof fetch, baseUrl: "http://127.0.0.1:5001", apiKey: "secret-key" };
    const result = await renderPresentonDeck(request, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5001/api/v1/ppt/presentation/generate");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(result).toEqual({ presentationId: "p1", pptxPath: "p1/final.pptx", editPath: "/presentation?id=p1" });
  });

  it("rejects a failing Presenton response", async () => {
    const deps: RendererDeps = { fetch: (async () => jsonResponse({ error: "nope" }, 500)) as unknown as typeof fetch, baseUrl: "http://x", apiKey: "secret-key" };
    await expect(renderPresentonDeck(request, deps)).rejects.toThrow(/Presenton generation failed/);
  });

  it("rejects an unsafe path without leaking the key", async () => {
    const deps: RendererDeps = {
      fetch: (async () => jsonResponse({ presentation_id: "p1", path: "/app_data/../../secret.pptx", edit_path: "/e" })) as unknown as typeof fetch,
      baseUrl: "http://x",
      apiKey: "secret-key",
    };
    await expect(renderPresentonDeck(request, deps)).rejects.toThrow(/unsafe Presenton path/);
    await expect(renderPresentonDeck(request, deps)).rejects.not.toThrow(/secret-key/);
  });
});

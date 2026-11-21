import { afterEach, describe, expect, it, vi } from "vitest";
import { BATCH_CHUNK_BYTES, BATCH_UPLOAD_THRESHOLD_BYTES, uploadOne } from "../src/components/document-intelligence/api";

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("client document upload batching", () => {
  it("sends large files as bounded chunks then completes the batch", async () => {
    const size = BATCH_UPLOAD_THRESHOLD_BYTES + 1024;
    const file = new File([new Uint8Array(size)], "big.txt");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const progress: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/upload/chunk")) return okResponse({ received: body.chunkIndex });
      return okResponse({ results: [{ status: "imported", fileName: "big.txt", document: { id: "doc-1", title: "big.txt" } }] });
    }));

    const result = await uploadOne(file, "chem-120", (value) => progress.push(value));

    const chunks = calls.filter((call) => call.url.endsWith("/upload/chunk"));
    expect(chunks).toHaveLength(Math.ceil(size / BATCH_CHUNK_BYTES));
    expect(chunks.every((call) => typeof call.body.uploadId === "string" && typeof call.body.contentBase64 === "string")).toBe(true);
    expect(Number(chunks[0].body.chunkIndex)).toBe(0);
    expect(calls.at(-1)?.url).toBe("/api/document-intelligence/upload/complete");
    expect(result).toMatchObject({ status: "imported", documentId: "doc-1", message: "Indexed" });
    expect(progress.at(-1)).toBe(100);
  });

  it("keeps small files on the single-request import route", async () => {
    const file = new File([new Uint8Array(1024)], "small.txt");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url)); return okResponse({ results: [{ status: "imported", fileName: "small.txt", document: { id: "doc-2" } }] }); }));
    const originalXhr = globalThis.XMLHttpRequest;
    class FakeXhr {
      upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      responseText = JSON.stringify({ results: [{ status: "imported", fileName: "small.txt", document: { id: "doc-2" } }] });
      status = 200;
      open() { /* no-op */ }
      setRequestHeader() { /* no-op */ }
      send() { this.onload?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    try {
      const result = await uploadOne(file, "chem-120", () => undefined);
      expect(result).toMatchObject({ status: "imported", documentId: "doc-2" });
      expect(urls).toEqual([]);
    } finally {
      vi.stubGlobal("XMLHttpRequest", originalXhr);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecognitionCache } from "../server/canvas-intelligence/cache.js";
import { summarizeCanvasBenchmark } from "../server/canvas-intelligence/benchmark.js";
import { scoreCanvasLiveOutput } from "../server/canvas-intelligence/benchmark-score.js";
import { geometryObservations, normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { normalizeOCRResponse, normalizeOCRText } from "../server/canvas-intelligence/ocr.js";
import { understandCanvas, clearCanvasRecognitionCache } from "../server/canvas-intelligence/service.js";
import { validateCanvasScience } from "../server/canvas-intelligence/validation.js";
import { scoreCanvasRelationshipQuality, scoreCanvasRelationships } from "../server/canvas-intelligence/relationship-score.js";
import { makeMolecule } from "../src/canvas/model.js";
import { Store } from "@quickdrawjs/react";
import { captureSelectedStrokeRegions, groupQuickdrawStrokes, localizeOCRByRegion, associateOCRLabels } from "../server/canvas-intelligence/regions.js";
import { quickdrawPixelToWorld } from "../server/canvas-intelligence/input.js";
import { FusionResultSchema, StructureResultSchema } from "../server/canvas-intelligence/types.js";

const records = { document: { store: {
  a: { id: "a", type: "shape", x: 0, y: 0, width: 20, height: 20 },
  b: { id: "b", type: "text", x: 25, y: 0, width: 30, height: 16, text: "F" },
  c: { id: "c", type: "shape", x: 1500, y: 1500, width: 40, height: 40 },
} } };
const models = { ocr: "ocr:test", reasoning: "reason:test", fusion: "fusion:test" };
const ocr = { items: [{ text: "F", kind: "symbol", confidence: 0.8, alternatives: [], sourceIds: ["b"], imageRegion: null }], uncertain: false, raw: "F" };
const structure = { objects: [], relationships: [], observations: [{ description: "Arrow points up", sourceIds: ["a"], confidence: 0.9, basis: "model" }], ambiguities: [] };
const fusion = { answer: "The force points up.", objects: [], relationships: [], associations: [{ description: "F labels the arrow", sourceIds: ["a", "b"], confidence: 0.8 }], uncertainties: [] };
beforeEach(() => { vi.stubEnv("CANVAS_INFERENCE_PROVIDER", "ollama"); vi.stubEnv("CANVAS_OCR_PROVIDER", "local"); });
afterEach(() => vi.unstubAllEnvs());
function mockFetcher(calls: Array<{ url: string; body?: any }>, tracking?: { active: number; peak: number }, delayMs = 0): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: target, body });
    if (target.endsWith("/api/tags")) return Response.json({ models: Object.values(models).map((name) => ({ name })) });
    if (tracking) { tracking.active++; tracking.peak = Math.max(tracking.peak, tracking.active); }
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const model = body.model;
    const content = model === models.ocr ? ocr : model === models.reasoning ? structure : fusion;
    if (tracking) tracking.active--;
    return Response.json({ message: { content: JSON.stringify(content) } });
  }) as typeof fetch;
}

describe("canvas intelligence adapters", () => {
  it("normalizes the installed GLM-OCR response without inventing image boxes", () => {
    const result = normalizeOCRResponse({ items: [{ text: "Fn", kind: "force", confidence: "0.95", alternatives: [], sourceIds: [] }] }, '{"items":[]}');
    expect(result.items[0]).toMatchObject({ text: "Fn", kind: "word", confidence: 0.95, imageRegion: null });
    expect(result.uncertain).toBe(true);
    expect(result.raw).toBe('{"items":[]}');
    expect(normalizeOCRText("Fn\nFa\nmg")).toMatchObject({ items: [{ text: "Fn", confidence: null, imageRegion: null, uncertain: true }, { text: "Fa" }, { text: "mg" }], uncertain: true });
    expect(normalizeOCRResponse({ items: [], uncertain: false }, "{}").uncertain).toBe(true);
  });

  it("normalizes sparse Qwen JSON while retaining its ambiguity", () => {
    expect(() => StructureResultSchema.parse({})).toThrow();
    expect(FusionResultSchema.parse({ answer: ["unclear", "label"], objects: [], relationships: [], associations: [], uncertainties: "No localized OCR evidence." })).toMatchObject({ answer: "unclear\nlabel", uncertainties: ["No localized OCR evidence."] });
  });

  it("scopes selected records to their neighborhood and calculates only geometric facts", () => {
    const input = normalizeCanvasInput({ boardId: "board", snapshot: records, selectedIds: ["a"] });
    expect(input.nativeRecords.map((r) => r.id)).toEqual(["a", "b"]);
    expect(input.nativeRecords[1].text).toBe("F");
    expect(input.revision).toHaveLength(64);
    expect(geometryObservations(input).every((o) => o.confidence === 1)).toBe(true);
    const arrowRecord = { id: "arrow", type: "arrow", geometry: { start: { x: 8, y: 4 }, end: { x: 8, y: 0 } } };
    const arrowSnapshot = { document: { store: { arrow: arrowRecord } } };
    const arrowInput = normalizeCanvasInput({ boardId: "board", snapshot: arrowSnapshot });
    expect(geometryObservations(arrowInput).at(-1)?.description).toContain("Arrow direction up");
  });

  it("normalizes genuine Quickdraw Store snapshots, text props, ink points, arrows, and camera transforms", () => {
    const store = new Store();
    store.put({ id: "stroke", typeName: "shape", type: "draw", x: 10, y: 20, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 10, 5, 0.7], color: "black", size: "m", dash: "draw", done: true } });
    store.put({ id: "label", typeName: "shape", type: "text", x: 25, y: 15, rot: 0, z: 2, props: { text: "Fₙ", color: "black", size: "m", font: "draw", autosize: true, scale: 1 } });
    store.put({ id: "arrow", typeName: "shape", type: "arrow", x: 20, y: 20, rot: 0, z: 3, props: { dx: 30, dy: -15, bend: 0, color: "black", size: "m", dash: "solid" } });
    const input = normalizeCanvasInput({ boardId: "qdraw", snapshot: store.getSnapshot(), selectedIds: ["stroke"] });
    expect(input.nativeRecords.map((record) => record.id)).toContain("label");
    expect(input.nativeRecords.find((record) => record.id === "label")?.text).toBe("Fₙ");
    expect(input.nativeRecords.find((record) => record.id === "stroke")?.geometry).toMatchObject({ kind: "stroke", points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 20, y: 25, pressure: 0.7 }] });
    expect(input.nativeRecords.find((record) => record.id === "arrow")?.geometry).toMatchObject({ start: { x: 20, y: 20 }, end: { x: 50, y: 5 } });
    expect(quickdrawPixelToWorld({ x: -100, y: 20, z: 2 }, 2, { x: 300, y: 100 })).toEqual({ scaleX: 0.25, scaleY: 0.25, offsetX: 175, offsetY: 5 });
  });

  it("plans selected stroke-group crops and keeps region-only localization uncertain", async () => {
    const store = new Store();
    store.put({ id: "letter-a", typeName: "shape", type: "draw", x: 10, y: 20, rot: 0, z: 1, props: { pts: [0, 0, 0.5, 4, 2, 0.5], color: "black", size: "m", dash: "draw", done: true } });
    store.put({ id: "letter-b", typeName: "shape", type: "draw", x: 16, y: 21, rot: 0, z: 2, props: { pts: [0, 0, 0.5, 3, 3, 0.5], color: "black", size: "m", dash: "draw", done: true } });
    const input = normalizeCanvasInput({ boardId: "qdraw", snapshot: store.getSnapshot(), selectedIds: ["letter-a", "letter-b"] });
    const groups = groupQuickdrawStrokes(input);
    expect(groups).toHaveLength(1);
    const regions = await captureSelectedStrokeRegions(input, async (plan) => ({ base64: "Y3JvcA==", width: plan.width, height: plan.height }));
    expect(regions[0]).toMatchObject({ sourceIds: ["letter-a", "letter-b"], worldBounds: { x: 10, y: 20, width: 9, height: 4 } });
    const localized = localizeOCRByRegion(normalizeOCRText("Fn"), regions);
    expect(localized.items[0]).toMatchObject({ text: "Fn", sourceRegionId: regions[0].id, worldRegion: regions[0].worldBounds, locationPrecision: "region", uncertain: true });
    expect(localized.uncertain).toBe(true);
  });

  it("maps model-provided OCR boxes through the crop transform without reducing precision", () => {
    const region = { id: "crop", base64: "Y3JvcA==", worldBounds: { x: 100, y: 200, width: 20, height: 10 }, cropBounds: { x: 100, y: 200, width: 20, height: 10 }, sourceIds: ["ink"], pixelToWorld: { scaleX: 0.5, scaleY: 0.25, offsetX: 100, offsetY: 200 } };
    const recognized = normalizeOCRResponse({ items: [{ text: "Fn", confidence: 0.95, imageRegion: { x: 10, y: 20, width: 5, height: 4 } }] }, "");
    const localized = localizeOCRByRegion(recognized, [region]);
    expect(localized.items[0]).toMatchObject({ worldRegion: { x: 105, y: 205, width: 2.5, height: 1 }, locationPrecision: "item", uncertain: false, sourceIds: ["ink"] });
  });

  it("associates a localized label by nearest object and marks close candidates ambiguous", () => {
    const base = normalizeCanvasInput({ boardId: "qdraw", snapshot: { document: { store: { a: { id: "a", type: "geo", x: 40, y: 0, width: 20, height: 20 }, b: { id: "b", type: "geo", x: 57, y: 0, width: 20, height: 20 } } } } });
    const ocr = normalizeOCRText("Fn");
    const positioned = { ...ocr, items: ocr.items.map((item) => ({ ...item, worldRegion: { x: 0, y: 2, width: 10, height: 10 }, locationPrecision: "item" as const })) };
    expect(associateOCRLabels(base, positioned)[0]).toMatchObject({ status: "ambiguous", candidateIds: ["a", "b"] });
    const shifted = { ...positioned, items: positioned.items.map((item) => ({ ...item, worldRegion: { x: 0, y: 2, width: 10, height: 10 } })) };
    expect(associateOCRLabels(base, shifted, 100, 5)[0].status).toBe("geometry-supported");
  });

  it("uses the fast path without inference and computes scientific vector checks", () => {
    const calls: Array<{ url: string; body?: any }> = [];
    const result = validateCanvasScience(normalizeCanvasInput({ boardId: "b", snapshot: records, scientificObjects: [{ id: "v", kind: "vector", x: 0, y: 0, width: 20, height: 20, components: [3, 4, 0] }] }));
    expect(result[0].checks).toContain("magnitude=5.000000");
    return understandCanvas({ boardId: "board", snapshot: records, userQuestion: "What is shown?", models, fetcher: mockFetcher(calls) }).then((answer) => {
      expect(answer.mode).toBe("fast"); expect(calls).toHaveLength(0);
    });
  });

  it("runs OCR and original-record reasoning independently, then fuses and caches", async () => {
    clearCanvasRecognitionCache();
    const calls: Array<{ url: string; body?: any }> = [], tracking = { active: 0, peak: 0 };
    const args = { boardId: "board", snapshot: records, selectedIds: ["a"], image: { base64: "aW1hZ2U=" }, userQuestion: "What does F indicate?", mode: "deep" as const, models, fetcher: mockFetcher(calls, tracking, 10) };
    const result = await understandCanvas(args);
    expect(result.answer).toBe(fusion.answer);
    const chats = calls.filter((call) => call.url.endsWith("/api/chat"));
    expect(chats.map((call) => call.body.model).sort()).toEqual(Object.values(models).sort());
    const structuralCall = chats.find((call) => call.body.model === models.reasoning)!;
    expect(tracking.peak).toBeGreaterThanOrEqual(2);
    const structurePayload = JSON.parse(structuralCall.body.messages.at(-1).content);
    expect(structuralCall.body.format.required).toEqual(expect.arrayContaining(["objects", "relationships", "observations", "ambiguities"]));
    expect(structurePayload.quickdrawRecords.map((record: any) => record.id)).toEqual(["a", "b"]);
    expect(structurePayload).not.toHaveProperty("ocr");
    expect(structuralCall.body.format.properties.objects.items.properties.id.enum).toEqual(["a", "b"]);
    const fusionCall = chats.find((call) => call.body.model === models.fusion)!;
    const fusionPayload = JSON.parse(fusionCall.body.messages.at(-1).content);
    expect(fusionCall.body.format.required).toEqual(expect.arrayContaining(["answer", "objects", "relationships", "associations", "uncertainties"]));
    expect(fusionPayload.canvasEvidence.scope).toMatchObject({ boardId: "board", revisionHash: result.revision });
    expect(fusionPayload.canvasEvidence.evidence.some((item: any) => item.origin === "ocr")).toBe(true);
    expect(fusionPayload.canvasEvidence.evidence.some((item: any) => item.origin === "model")).toBe(true);
    expect(fusionPayload.canvasEvidence.evidence.some((item: any) => item.origin === "geometry")).toBe(true);
    expect(fusionPayload).not.toHaveProperty("quickdrawRecords");
    expect(result.evidence?.scope.revisionHash).toBe(result.revision);
    expect(calls.filter((call) => call.url.endsWith("/api/chat"))).toHaveLength(3);
    const second = await understandCanvas(args);
    expect(second.cached.sort()).toEqual(["fusion", "ocr", "structure"]);
    expect(calls.filter((call) => call.url.endsWith("/api/chat"))).toHaveLength(3);
  });

  it("validates molecule charge data and keeps mocked benchmark evidence labeled", () => {
    const molecule = makeMolecule(0, 0);
    const checks = validateCanvasScience(normalizeCanvasInput({ boardId: "b", snapshot: records, scientificObjects: [molecule] }));
    expect(checks[0].checks).toContain("molecule bonds reference existing distinct atoms");
    const report = summarizeCanvasBenchmark([{ fixtureId: "f", pipeline: "native-single", output: { a: 1 }, expected: { a: 1 }, latencyMs: 20, modelCalls: 1, mocked: true }]);
    expect(report.mocked).toBe(true); expect(report.results[0].exactMatchRate).toBe(1);
  });

  it("returns a clear configuration error when an Ollama model is missing", async () => {
    const fetcher = (async (url: string | URL | Request) => String(url).endsWith("/api/tags") ? Response.json({ models: [{ name: "other:latest" }] }) : Response.json({})) as typeof fetch;
    await expect(understandCanvas({ boardId: "board", snapshot: records, image: { base64: "aW1hZ2U=" }, userQuestion: "Read this", mode: "recognize", models, fetcher })).rejects.toThrow("Required Ollama model is not installed: reason:test");
  });

  it("bounds the recognition cache", () => {
    const cache = new RecognitionCache<number>(2, 10_000);
    cache.set("a", 1); cache.set("b", 2); cache.get("a"); cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined(); expect(cache.get("a")).toBe(1); expect(cache.size).toBe(2);
  });

  it("scores model answers against label, direction, association, and uncertainty evidence", () => {
    const score = scoreCanvasLiveOutput({ ocr: { items: [{ text: "Fn" }, { text: "Fa" }, { text: "mg" }] }, reasoning: { answer: "up right down", labels: [{ text: "Fn", arrowId: "arrow-up" }, { text: "Fa", arrowId: "arrow-right" }, { text: "mg", arrowId: "arrow-down" }], arrowDirections: [{ arrowId: "arrow-up", direction: "up" }, { arrowId: "arrow-right", direction: "right" }, { arrowId: "arrow-down", direction: "down" }], uncertainties: ["association uncertain"] } });
    expect(score).toEqual({ transcriptionCoverage: true, labelAssociations: true, geometryDirections: true, finalAnswerDirectionAccuracy: true, uncertaintyHandling: true });
  });

  it("scores known relationships with exact references, relation classes, and scientific directionality", () => {
    expect(scoreCanvasRelationships([{ fromId: "a", toId: "b", relation: "double bond" }], [{ fromId: "b", toId: "a", relation: "bond order 2" }]).f1).toBe(1);
    expect(scoreCanvasRelationships([{ fromId: "parent", toId: "child", relation: "contains" }], [{ fromId: "child", toId: "parent", relation: "inside of" }]).f1).toBe(1);
    expect(scoreCanvasRelationships([{ fromId: "force", toId: "body", relation: "acts on" }], [{ fromId: "body", toId: "force", relation: "acts on" }]).f1).toBe(0);
    expect(scoreCanvasRelationships([{ fromId: "force", toId: "body", relation: "acts on" }], [{ fromId: "body", toId: "force", relation: "receives force from" }]).f1).toBe(1);
    expect(scoreCanvasRelationships([{ fromId: "a", toId: "b", relation: "contains" }], [{ fromId: "a", toId: "b", relation: "not contains" }]).f1).toBe(0);
    expect(scoreCanvasRelationships([{ fromId: "a", toId: "b", relation: "connected" }], [{ fromId: "b", toId: "a", relation: "connected by line" }]).f1).toBe(1);
    expect(scoreCanvasRelationships([{ fromId: "a", toId: "b", relation: "single bond" }], [{ fromId: "a", toId: "b", relation: "double bond" }]).f1).toBe(0);
    expect(scoreCanvasRelationshipQuality([{ fromId: "a", toId: "b", relation: "double bond" }], [{ fromId: "b", toId: "a", relation: "bond" }])).toMatchObject({ endpointF1: 1, f1: 0, relationTypeAccuracy: 0 });
    expect(scoreCanvasRelationshipQuality([{ fromId: "force", toId: "body", relation: "acts on" }], [{ fromId: "body", toId: "force", relation: "acts on" }])).toMatchObject({ endpointF1: 0, f1: 0 });
  });
});

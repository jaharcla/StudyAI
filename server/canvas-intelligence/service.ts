import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { RecognitionCache } from "./cache.js";
import { buildCanvasEvidence, selectCanvasContext, type CanvasEvidenceBundle, type SelectedCanvasContext } from "./evidence.js";
import { normalizeCanvasInput, geometryObservations, mergeQuickdrawBondRelationships } from "./input.js";
import { normalizeOCRText } from "./ocr.js";
import { FUSION_SYSTEM_PROMPT, STRUCTURE_SYSTEM_PROMPT } from "./prompts.js";
import { associateOCRLabels, imageRegionsFromInput, localizeOCRByRegion, type OCRAssociation } from "./regions.js";
import { ollamaText } from "./ollama.js";
import { canvasInferenceJson, canvasInferenceProvider, canvasOCRProvider, groqInferenceModel, groqOCR, groqOCRModel } from "./groq.js";
import { OCRResultSchema, StructureResultSchema, getCanvasIntelligenceModels, normalizeCanvasFusionOutput, normalizeCanvasStructureOutput, schemasForCanvasIds, type CanvasIntelligenceModels, type CanvasInput, type FusionResult, type OCRImageRegion, type OCRResult, type StructureResult } from "./types.js";

export type CanvasMode = "fast" | "recognize" | "deep";
export type UnderstandCanvasArgs = Parameters<typeof normalizeCanvasInput>[0] & { userQuestion: string; mode?: CanvasMode; courseContext?: string; signal?: AbortSignal; baseUrl?: string; fetcher?: typeof fetch; models?: CanvasIntelligenceModels };
export type CanvasUnderstanding = { mode: CanvasMode; revision: string; answer?: string; ocr?: OCRResult; associations?: OCRAssociation[]; structure: StructureResult; fusion?: FusionResult; evidence?: CanvasEvidenceBundle; selectedContext?: SelectedCanvasContext; latencyMs: Record<string, number>; cached: string[] };
const ocrCache = new RecognitionCache<OCRResult>();
const structureCache = new RecognitionCache<StructureResult>();
const fusionCache = new RecognitionCache<FusionResult>();
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function understandCanvas(args: UnderstandCanvasArgs): Promise<CanvasUnderstanding> {
  const started = performance.now(), normalizationStarted = performance.now(), input = normalizeCanvasInput(args), mode = args.mode ?? "fast";
  const models = args.models ?? getCanvasIntelligenceModels();
  const ocrProvider = canvasOCRProvider();
  const inferenceProvider = canvasInferenceProvider();
  const latencyMs: Record<string, number> = { normalization: performance.now() - normalizationStarted }, cached: string[] = [];
  const deterministic = geometryObservations(input);
  if (mode === "fast") return { mode, revision: input.revision, structure: StructureResultSchema.parse({ objects: [], relationships: [], observations: deterministic, ambiguities: [] }), latencyMs: { ...latencyMs, total: performance.now() - started }, cached };
  const canvasIds = [...new Set([...input.nativeRecords.map((record) => record.id), ...input.scientificObjects.map((object) => object.id)])];
  const schemas = schemasForCanvasIds(canvasIds);
  const quickdrawRecords = input.nativeRecords.map((record) => {
    const raw = record.raw && typeof record.raw === "object" ? record.raw as Record<string, unknown> : { id: record.id, type: record.type };
    return { ...raw, normalized: { bounds: record.bounds, geometry: record.geometry } };
  });
  const serializePrompt = (stage: string, payload: unknown) => {
    const before = performance.now(), prompt = JSON.stringify(payload);
    latencyMs[`${stage}SerializationMs`] = performance.now() - before;
    latencyMs[`${stage}PromptBytes`] = Buffer.byteLength(prompt);
    return prompt;
  };
  const structKey = digest({ rev: input.revision, records: input.nativeRecords, objects: input.scientificObjects, model: models.reasoning, provider: inferenceProvider, remoteModel: inferenceProvider === "groq" ? groqInferenceModel() : undefined });
  const cachedStructure = structureCache.get(structKey);
  const structurePrompt = cachedStructure ? undefined : serializePrompt("structure", { quickdrawRecords, selectedIds: input.selectedIds, scientificObjects: input.scientificObjects });
  if (cachedStructure) cached.push("structure");
  const maxInputChars = Number(process.env.CANVAS_MAX_INPUT_CHARS || 60_000);
  if (structurePrompt && structurePrompt.length > maxInputChars) throw new Error(`Canvas region exceeds CANVAS_MAX_INPUT_CHARS (${maxInputChars}); select a smaller region or raise the configured limit.`);
  const regionPreparationStarted = performance.now();
  const regions = imageRegionsFromInput(input);
  latencyMs.regionPreparation = performance.now() - regionPreparationStarted;
  const imageRequests: Array<OCRImageRegion | { id: string; base64: string; mimeType?: string }> = regions.length ? regions : input.image?.base64 ? [{ id: "canvas-region", base64: input.image.base64, mimeType: input.image.mimeType }] : [];
  if (!imageRequests.length) throw new Error(`Canvas mode "${mode}" requires a rendered image for the selected canvas region.`);
  const maxImageBytes = Number(process.env.CANVAS_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  const totalImageBytes = imageRequests.reduce((sum, region) => sum + Math.floor(region.base64.length * 0.75), 0);
  if (totalImageBytes > maxImageBytes) throw new Error(`Canvas images exceed CANVAS_MAX_IMAGE_BYTES (${maxImageBytes}); select fewer strokes or render smaller crops.`);

  const runOcr = async () => {
    const before = Date.now();
    let cacheHits = 0;
    const results = await Promise.all(imageRequests.map(async (region) => {
      const selectedOCRProvider = ocrProvider === "local" || !process.env.GROQ_API_KEY ? "local" : "groq";
      const key = digest({ rev: input.revision, regionId: region.id, sourceIds: "sourceIds" in region ? region.sourceIds : [], image: digest(region.base64), transform: "pixelToWorld" in region ? region.pixelToWorld : undefined, model: models.ocr, provider: selectedOCRProvider, remoteModel: selectedOCRProvider === "groq" ? groqOCRModel() : undefined });
      const hit = ocrCache.get(key);
      if (hit) { cacheHits++; return hit; }
      const local = async () => normalizeOCRText(await ollamaText({ baseUrl: args.baseUrl, fetcher: args.fetcher, signal: args.signal, model: models.ocr, image: region.base64, system: "Transcribe only the text and symbols that are visibly present. Return each distinct item on its own line. Preserve capitalization and ambiguous alternatives. Do not describe the image or assign meanings to labels.", prompt: "Read the handwritten words, symbols, numbers, and equations. Output each visible item on its own line." }));
      const cloud = () => groqOCR({ base64: region.base64, mimeType: region.mimeType, fetcher: args.fetcher, signal: args.signal });
      let parsed: OCRResult;
      if (ocrProvider === "groq") {
        try { parsed = await cloud(); } catch { parsed = await local(); }
      } else if (ocrProvider === "auto") {
        if (process.env.GROQ_API_KEY) { try { parsed = await cloud(); } catch { parsed = await local(); } }
        else parsed = await local();
      } else parsed = await local();
      const localized = "pixelToWorld" in region ? localizeOCRByRegion(parsed, [region]) : OCRResultSchema.parse({ ...parsed, items: parsed.items.map((item) => ({ ...item, sourceRegionId: region.id, uncertain: true })) });
      ocrCache.set(key, localized); return localized;
    }));
    if (results.length && cacheHits === results.length) cached.push("ocr");
    else if (cacheHits) cached.push("ocr-partial");
    const combined = OCRResultSchema.parse({ items: results.flatMap((result) => result.items), uncertain: results.some((result) => result.uncertain), raw: results.map((result, index) => `[${imageRequests[index].id}]\n${result.raw}`).join("\n") });
    latencyMs.ocr = Date.now() - before; return combined;
  };
  const runStructure = async () => {
    if (cachedStructure) return cachedStructure;
    const before = Date.now();
    const result = await canvasInferenceJson({ baseUrl: args.baseUrl, fetcher: args.fetcher, signal: args.signal, model: models.reasoning, system: STRUCTURE_SYSTEM_PROMPT, prompt: structurePrompt! }, schemas.structure, (value) => normalizeCanvasStructureOutput(value, canvasIds));
    const combined = StructureResultSchema.parse(mergeQuickdrawBondRelationships(input, result));
    latencyMs.structure = Date.now() - before; structureCache.set(structKey, combined); return combined;
  };
  const [ocr, structure] = await Promise.all([runOcr(), runStructure()]);
  latencyMs.stageOne = Number(latencyMs.structureSerializationMs ?? 0) + Math.max(latencyMs.ocr ?? 0, latencyMs.structure ?? 0);
  const associations = associateOCRLabels(input, ocr);
  const evidence = buildCanvasEvidence(input, ocr, structure, associations);
  if (mode === "recognize") return { mode, revision: input.revision, ocr, associations, structure, evidence, latencyMs: { ...latencyMs, total: performance.now() - started }, cached };

  const fixedFusionContext = { selectedIds: input.selectedIds, userQuestion: args.userQuestion, courseContext: args.courseContext ?? "" };
  const fusionOverhead = JSON.stringify({ ...fixedFusionContext, canvasEvidence: null }).length;
  const evidenceBudget = maxInputChars - fusionOverhead - 64;
  const selectedContext = selectCanvasContext(evidence, { question: args.userQuestion, selectedIds: input.selectedIds, expectedRevisionHash: input.revision, maxChars: evidenceBudget, nativeRecords: input.nativeRecords, scientificObjects: input.scientificObjects });
  const fusionKey = digest({ rev: input.revision, image: imageRequests.map((region) => digest(region.base64)), ocr, associations, structure, question: args.userQuestion, courseContext: args.courseContext, selectedContext, model: models.fusion, provider: inferenceProvider, remoteModel: inferenceProvider === "groq" ? groqInferenceModel() : undefined });
  let fusion = fusionCache.get(fusionKey);
  if (fusion) cached.push("fusion");
  else {
    const before = Date.now();
    const prompt = serializePrompt("fusion", { ...fixedFusionContext, canvasEvidence: selectedContext });
    if (prompt.length > maxInputChars) throw new Error(`Fusion evidence exceeds CANVAS_MAX_INPUT_CHARS (${maxInputChars}); select a smaller canvas region or raise the configured limit.`);
    const result = await canvasInferenceJson({ baseUrl: args.baseUrl, fetcher: args.fetcher, signal: args.signal, model: models.fusion, system: FUSION_SYSTEM_PROMPT, prompt }, schemas.fusion, (value) => normalizeCanvasFusionOutput(value, canvasIds));
    fusion = schemas.fusion.parse(mergeQuickdrawBondRelationships(input, result));
    latencyMs.fusion = Date.now() - before; fusionCache.set(fusionKey, fusion);
  }
  const unresolved = evidence.conflicts.map((conflict) => `Unresolved evidence conflict for ${conflict.subjectId} / ${conflict.claimKey}: ${conflict.values.join(" vs ")}`);
  const summary = unresolved.length ? `Canvas evidence disagrees: ${unresolved.slice(0, 3).join("; ")}${unresolved.length > 3 ? `; and ${unresolved.length - 3} additional conflicts` : ""}. Verify before editing or grading.` : "";
  const safeFusion = unresolved.length ? { ...fusion, answer: `${fusion.answer}\n${summary}`, uncertainties: [...fusion.uncertainties, ...unresolved] } : fusion;
  return { mode, revision: input.revision, answer: safeFusion.answer, ocr, associations, structure, fusion: safeFusion, evidence, selectedContext, latencyMs: { ...latencyMs, total: performance.now() - started }, cached };
}

export function clearCanvasRecognitionCache() { ocrCache.clear(); structureCache.clear(); fusionCache.clear(); }
export function canvasInputForAdapters(input: CanvasInput) { return input; }

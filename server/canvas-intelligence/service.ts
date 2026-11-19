import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { RecognitionCache } from "./cache.js";
import { buildCanvasEvidence, selectCanvasContext, type CanvasEvidenceBundle, type SelectedCanvasContext } from "./evidence.js";
import { normalizeCanvasInput, geometryObservations, mergeQuickdrawBondRelationships, quickdrawRecordsForStructure } from "./input.js";
import { FUSION_SYSTEM_PROMPT, STRUCTURE_INK_SYSTEM_PROMPT, STRUCTURE_SYSTEM_PROMPT } from "./prompts.js";
import { associateOCRLabels, groupQuickdrawStrokes, imageRegionsFromInput, localizeOCRByRegion, type OCRAssociation } from "./regions.js";
import { canvasInferenceJson, canvasInferenceProvider, canvasOCR, canvasOCRProvider, consumeProviderFallbacks, groqInferenceModel, groqOCRModel, resetProviderFallbacks } from "./groq.js";
import { OCRResultSchema, StructureResultSchema, getCanvasIntelligenceModels, normalizeCanvasFusionOutput, normalizeCanvasStructureOutput, schemasForCanvasIds, type CanvasIntelligenceModels, type CanvasInput, type FusionResult, type OCRImageRegion, type OCRResult, type StructureResult } from "./types.js";
import { recognizeCanvasStrokes } from "./recognition/index.js";
import type { CanvasRecognitionAdapter, CanvasRecognitionMode, CanvasRecognitionStage } from "./recognition/types.js";
import { CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS, clampOCRRegionLimit } from "../../src/canvas/ocr-regions.js";

export type CanvasMode = "fast" | "recognize" | "deep";
export type CanvasRecognitionOptions = {
  mode?: CanvasRecognitionMode;
  adapter?: CanvasRecognitionAdapter;
  prototypes?: Record<string, readonly (readonly number[])[]>;
  labels?: readonly string[];
};
export type UnderstandCanvasArgs = Parameters<typeof normalizeCanvasInput>[0] & { userQuestion: string; mode?: CanvasMode; courseContext?: string; signal?: AbortSignal; baseUrl?: string; fetcher?: typeof fetch; models?: CanvasIntelligenceModels; expectedSourceRegionIds?: string[]; recognition?: CanvasRecognitionOptions };
export type CanvasUnderstanding = { mode: CanvasMode; revision: string; answer?: string; ocr?: OCRResult; associations?: OCRAssociation[]; structure: StructureResult; fusion?: FusionResult; evidence?: CanvasEvidenceBundle; selectedContext?: SelectedCanvasContext; recognition?: CanvasRecognitionStage | null; partial?: boolean; warnings?: string[]; omittedImageRegionIds?: string[]; failedImageRegionIds?: string[]; latencyMs: Record<string, number>; cached: string[] };
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
  const hasInk = input.nativeRecords.some((record) => record.type === "draw" || record.type === "highlight");
  const mathInk = input.scientificObjects.length === 0 && input.nativeRecords.length > 0 && input.nativeRecords.every((record) => record.type === "draw" || record.type === "highlight");
  const ocrProfile = mathInk ? "math" as const : hasInk ? "diagram" as const : "general" as const;
  const maxOCRRegions = clampOCRRegionLimit(process.env.CANVAS_OCR_MAX_REGIONS, CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS);
  const structureSystemPrompt = mathInk ? STRUCTURE_INK_SYSTEM_PROMPT : STRUCTURE_SYSTEM_PROMPT;
  if (mode === "fast") {
    const recognitionStarted = performance.now();
    let recognition: CanvasRecognitionStage | null = null;
    let recognitionWarning: string | undefined;
    try { recognition = await recognizeCanvasStrokes(input, { ...args.recognition, mode: "baseline" }); }
    catch (error) { recognitionWarning = `Recognition failed; continuing without candidates: ${error instanceof Error ? error.message : "adapter failed"}.`; }
    latencyMs.recognition = performance.now() - recognitionStarted;
    return { mode, revision: input.revision, structure: StructureResultSchema.parse({ objects: [], relationships: [], observations: deterministic, ambiguities: [] }), recognition, warnings: [...(recognition?.warnings ?? []), ...(recognitionWarning ? [recognitionWarning] : [])], latencyMs: { ...latencyMs, total: performance.now() - started }, cached };
  }
  const canvasIds = [...new Set([...input.nativeRecords.map((record) => record.id), ...input.scientificObjects.map((object) => object.id)])];
  const schemas = schemasForCanvasIds(canvasIds);
  const quickdrawRecords = quickdrawRecordsForStructure(input.nativeRecords);
  const serializePrompt = (stage: string, payload: unknown) => {
    const before = performance.now(), prompt = JSON.stringify(payload);
    latencyMs[`${stage}SerializationMs`] = performance.now() - before;
    latencyMs[`${stage}PromptBytes`] = Buffer.byteLength(prompt);
    return prompt;
  };
  const structKey = digest({ rev: input.revision, records: input.nativeRecords, objects: input.scientificObjects, model: models.reasoning, provider: inferenceProvider, chain: process.env.CANVAS_PROVIDER_CHAIN, profile: mathInk ? "math-ink" : "standard", remoteModel: inferenceProvider === "groq" ? groqInferenceModel() : undefined });
  const cachedStructure = mathInk ? undefined : structureCache.get(structKey);
  const structurePrompt = cachedStructure || mathInk ? undefined : serializePrompt("structure", { quickdrawRecords, selectedIds: input.selectedIds, scientificObjects: input.scientificObjects });
  const maxInputChars = Number(process.env.CANVAS_MAX_INPUT_CHARS || 60_000);
  if (structurePrompt && structurePrompt.length > maxInputChars) throw new Error(`Canvas region exceeds CANVAS_MAX_INPUT_CHARS (${maxInputChars}); select a smaller region or raise the configured limit.`);
  const regionPreparationStarted = performance.now();
  const regions = imageRegionsFromInput(input);
  latencyMs.regionPreparation = performance.now() - regionPreparationStarted;
  const requestedImages: Array<OCRImageRegion | { id: string; base64: string; mimeType?: string }> = regions.length ? regions : input.image?.base64 ? [{ id: "canvas-region", base64: input.image.base64, mimeType: input.image.mimeType }] : [];
  const maxImageBytes = Number(process.env.CANVAS_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  const imageRequests: typeof requestedImages = [];
  let totalImageBytes = 0;
  for (const region of requestedImages) {
    const bytes = Math.floor(region.base64.length * 0.75);
    if (imageRequests.length >= maxOCRRegions || totalImageBytes + bytes > maxImageBytes) continue;
    imageRequests.push(region); totalImageBytes += bytes;
  }
  const omittedImageRegionIds = regions.filter((region) => !imageRequests.some((request) => request.id === region.id)).map((region) => region.id);
  const capturedGroupIds = new Set(regions.map((region) => region.id));
  const expectedRegionIds = args.expectedSourceRegionIds ?? groupQuickdrawStrokes(input).map((group) => group.id);
  const uncapturedGroupCount = expectedRegionIds.filter((id) => !capturedGroupIds.has(id)).length;
  const analysisWarnings: string[] = [];
  if (uncapturedGroupCount) analysisWarnings.push(`${uncapturedGroupCount} freehand source region(s) were not captured as localized crops.`);
  if (requestedImages.length > imageRequests.length) analysisWarnings.push(`${requestedImages.length - imageRequests.length} OCR region(s) were omitted by the per-analysis region or image-size limit.`);
  if (!regions.length && input.image?.base64) analysisWarnings.push("The full-board OCR image has no verified source-region mapping.");
  let failedOCRRegions = 0;
  const failedImageRegionIds = new Set<string>();

  const runOcr = async () => {
    const before = Date.now();
    let cacheHits = 0;
    const results = await Promise.all(imageRequests.map(async (region) => {
      try {
        const key = digest({ rev: input.revision, regionId: region.id, sourceIds: "sourceIds" in region ? region.sourceIds : [], image: digest(region.base64), transform: "pixelToWorld" in region ? region.pixelToWorld : undefined, model: models.ocr, provider: ocrProvider, chain: process.env.CANVAS_PROVIDER_CHAIN, profile: ocrProfile, remoteModel: ocrProvider === "groq" ? groqOCRModel() : undefined });
        const hit = ocrCache.get(key);
        if (hit) { cacheHits++; return hit; }
        const parsed = await canvasOCR({ base64: region.base64, mimeType: region.mimeType, model: models.ocr, profile: ocrProfile, fetcher: args.fetcher, signal: args.signal });
        const localized = "pixelToWorld" in region && "worldBounds" in region && "sourceIds" in region ? localizeOCRByRegion(parsed, [region]) : localizeOCRByRegion(parsed, []);
        ocrCache.set(key, localized); return localized;
      } catch (error) {
        if (args.signal?.aborted) throw error;
        failedOCRRegions++;
        if ("sourceIds" in region) failedImageRegionIds.add(region.id);
        return OCRResultSchema.parse({ items: [], uncertain: true, raw: "" });
      }
    }));
    if (results.length && cacheHits === results.length) cached.push("ocr");
    else if (cacheHits) cached.push("ocr-partial");
    const combined = OCRResultSchema.parse({ items: results.flatMap((result) => result.items), uncertain: results.some((result) => result.uncertain), raw: results.map((result, index) => `[${imageRequests[index].id}]\n${result.raw}`).join("\n") });
    latencyMs.ocr = Date.now() - before; return combined;
  };
  const runStructure = async (ocrForStructure?: OCRResult) => {
    const ocrPayload = ocrForStructure ? ocrForStructure.items.slice(0, 20).map((item) => ({ text: item.text.slice(0, 500), kind: item.kind, sourceIds: item.sourceIds, sourceRegionId: item.sourceRegionId })) : undefined;
    const key = ocrPayload ? digest({ struct: structKey, ocr: digest(ocrPayload) }) : structKey;
    const cachedResult = ocrPayload ? structureCache.get(key) : cachedStructure;
    if (cachedResult) { cached.push("structure"); return cachedResult; }
    const before = Date.now();
    const prompt = serializePrompt("structure", ocrPayload ? { quickdrawRecords, selectedIds: input.selectedIds, scientificObjects: input.scientificObjects, ocr: ocrPayload } : { quickdrawRecords, selectedIds: input.selectedIds, scientificObjects: input.scientificObjects });
    const maxChars = Number(process.env.CANVAS_MAX_INPUT_CHARS || 60_000);
    if (prompt.length > maxChars) throw new Error(`Canvas region exceeds CANVAS_MAX_INPUT_CHARS (${maxChars}); select a smaller region or raise the configured limit.`);
    const result = await canvasInferenceJson({ baseUrl: args.baseUrl, fetcher: args.fetcher, signal: args.signal, model: models.reasoning, system: structureSystemPrompt, prompt }, schemas.structure, (value) => normalizeCanvasStructureOutput(value, canvasIds));
    const combined = StructureResultSchema.parse(mergeQuickdrawBondRelationships(input, result));
    latencyMs.structure = Date.now() - before; structureCache.set(key, combined); return combined;
  };
  const runRecognition = async () => {
    const before = Date.now();
    const requested = args.recognition?.mode;
    const mode = mathInk && (!requested || requested === "auto") ? "baseline" as const : requested;
    try {
      const stage = await recognizeCanvasStrokes(input, { ...args.recognition, mode, signal: args.signal });
      latencyMs.recognition = Date.now() - before;
      return stage;
    } catch (error) {
      if (args.signal?.aborted) throw error;
      analysisWarnings.push(`Recognition failed; continuing without candidates: ${error instanceof Error ? error.message : "adapter failed"}.`);
      latencyMs.recognition = Date.now() - before;
      return null;
    }
  };
  resetProviderFallbacks();
  let ocr: OCRResult;
  let structure: StructureResult;
  let recognition: CanvasRecognitionStage | null;
  if (mathInk) {
    ocr = await runOcr();
    structure = await runStructure(ocr);
    recognition = await runRecognition();
  } else {
    [ocr, structure, recognition] = await Promise.all([runOcr(), runStructure(), runRecognition()]);
  }
  analysisWarnings.push(...consumeProviderFallbacks());
  if (failedOCRRegions) analysisWarnings.push(`${failedOCRRegions} OCR region(s) could not be processed; provider output was omitted.`);
  const isPartial = analysisWarnings.length > 0;
  latencyMs.stageOne = Number(latencyMs.structureSerializationMs ?? 0) + Math.max(latencyMs.ocr ?? 0, latencyMs.structure ?? 0);
  const associations = associateOCRLabels(input, ocr);
  const evidence = buildCanvasEvidence(input, ocr, structure, associations, recognition);
  evidence.warnings.push(...analysisWarnings);
  if (mode === "recognize") return { mode, revision: input.revision, ocr, associations, structure, recognition, evidence, partial: isPartial, warnings: analysisWarnings, omittedImageRegionIds, failedImageRegionIds: [...failedImageRegionIds].sort(), latencyMs: { ...latencyMs, total: performance.now() - started }, cached };

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
  return { mode, revision: input.revision, answer: safeFusion.answer, ocr, associations, structure, recognition, fusion: safeFusion, evidence, selectedContext, partial: isPartial, warnings: analysisWarnings, omittedImageRegionIds, failedImageRegionIds: [...failedImageRegionIds].sort(), latencyMs: { ...latencyMs, total: performance.now() - started }, cached };
}

export function clearCanvasRecognitionCache() { ocrCache.clear(); structureCache.clear(); fusionCache.clear(); }
export function canvasInputForAdapters(input: CanvasInput) { return input; }

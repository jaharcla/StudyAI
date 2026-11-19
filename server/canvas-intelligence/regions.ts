import { OCRResultSchema, type CanvasInput, type OCRImageRegion, type OCRResult } from "./types.js";
import { CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS, canvasOCRRegionTransform, groupCanvasInkStrokes, groupCanvasInkStrokesForOCR, isMathInkBoard, planCanvasOCRCrops, selectCanvasOCRGroups, type CanvasInkStrokeBounds, type CanvasOCRCropPlan, type CanvasStrokeGroup } from "../../src/canvas/ocr-regions.js";

export type StrokeGroup = CanvasStrokeGroup;
export type OCRCropPlan = CanvasOCRCropPlan;
export type RenderedCrop = { base64: string; mimeType?: string; width: number; height: number };
export type OCRAssociation = { text: string; sourceIds: string[]; candidateIds: string[]; candidateRefs: Array<{ scope: "quickdraw" | "science"; id: string }>; status: "geometry-supported" | "ambiguous" | "unmatched"; geometricDistance: number | null; basis: "item-box" | "stroke-region" | "none"; uncertainty: string[] };

export function groupQuickdrawStrokes(input: CanvasInput, gapThreshold = 24): StrokeGroup[] {
  const records = quickdrawInkStrokeInputs(input);
  const nonInk = input.nativeRecords.filter((record) => record.type !== "draw" && record.type !== "highlight").length;
  return groupCanvasInkStrokesForOCR(records, { selectedIds: input.selectedIds, gapThreshold, mathMode: isMathInkBoard(records, input.scientificObjects.length + nonInk) });
}

export function selectQuickdrawOCRGroups(input: CanvasInput, selectedIds = input.selectedIds, limit = CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS) {
  const records = quickdrawInkStrokeInputs(input);
  const nonInk = input.nativeRecords.filter((record) => record.type !== "draw" && record.type !== "highlight").length;
  const groups = groupCanvasInkStrokesForOCR(records, { mathMode: isMathInkBoard(records, input.scientificObjects.length + nonInk) });
  const relevanceBounds = [
    ...input.nativeRecords.filter((record) => record.bounds && record.type !== "draw" && record.type !== "highlight").map((record) => record.bounds!),
    ...input.scientificObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height })),
  ];
  return selectCanvasOCRGroups(groups, { records, relevanceBounds, selectedIds, limit });
}

function quickdrawInkStrokeInputs(input: CanvasInput): CanvasInkStrokeBounds[] {
  return input.nativeRecords.filter((record) => record.type === "draw" || record.type === "highlight").map((record) => {
    const raw = asRecord(record.raw), props = asRecord(raw.props), values = Array.isArray(props.pts) ? props.pts : [];
    const points: Array<{ x: number; y: number }> = [];
    for (let index = 0; index + 1 < values.length; index += 3) {
      const x = values[index], y = values[index + 1];
      if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) points.push({ x, y });
    }
    return { id: record.id, type: record.type, bounds: record.bounds, points };
  });
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function planStrokeOCRCrops(groups: StrokeGroup[], options: { padding?: number; pixelsPerWorld?: number; minPixels?: number } = {}): OCRCropPlan[] {
  return planCanvasOCRCrops(groups, options);
}

export async function renderOCRCropPlans(plans: OCRCropPlan[], render: (plan: OCRCropPlan) => Promise<RenderedCrop>): Promise<OCRImageRegion[]> {
  return Promise.all(plans.map(async (plan) => {
    const image = await render(plan);
    if (!image.base64 || image.width < 1 || image.height < 1) throw new Error(`Canvas crop renderer returned an invalid image for ${plan.id}.`);
    return { id: plan.id, base64: image.base64, mimeType: "image/png" as const, worldBounds: plan.worldBounds, cropBounds: plan.cropBounds, sourceIds: plan.sourceIds, pixelWidth: image.width, pixelHeight: image.height, pixelToWorld: canvasOCRRegionTransform(plan.cropBounds, image.width, image.height) };
  }));
}

export async function captureSelectedStrokeRegions(input: CanvasInput, render: (plan: OCRCropPlan) => Promise<RenderedCrop>, options?: { gapThreshold?: number; padding?: number; pixelsPerWorld?: number; minPixels?: number }) {
  const groups = groupQuickdrawStrokes(input, options?.gapThreshold);
  return renderOCRCropPlans(planStrokeOCRCrops(groups, options), render);
}

export function localizeOCRByRegion(result: OCRResult, regions: OCRImageRegion[]): OCRResult {
  const region = regions.length === 1 ? regions[0] : undefined;
  const items = result.items.map((item) => {
    if (!region) return { ...item, sourceIds: [], sourceRegionId: null, worldRegion: null, imageRegion: null, uncertain: true, locationPrecision: "unknown" as const };
    return { ...item, sourceRegionId: region.id, sourceIds: [...region.sourceIds], worldRegion: region.worldBounds, imageRegion: null, locationPrecision: "region" as const, uncertain: true };
  });
  return OCRResultSchema.parse({ ...result, items, uncertain: result.uncertain || items.some((item) => item.uncertain || item.locationPrecision === "unknown") });
}

export function associateOCRLabels(input: CanvasInput, result: OCRResult, maxDistance = 72, ambiguityMargin = 18): OCRAssociation[] {
  const candidates = [
    ...input.nativeRecords.filter((record) => record.bounds && record.type !== "draw" && record.type !== "highlight").map((record) => ({ scope: "quickdraw" as const, id: record.id, bounds: record.bounds! })),
    ...input.scientificObjects.map((object) => ({ scope: "science" as const, id: object.id, bounds: scientificObjectBounds(object) })),
  ];
  return result.items.map((item) => {
    if (!item.worldRegion) return { text: item.text, sourceIds: item.sourceIds, candidateIds: [], candidateRefs: [], status: "unmatched", geometricDistance: null, basis: "none", uncertainty: ["OCR has no localized world region."] };
    const scored = candidates.filter((candidate) => candidate.scope !== "quickdraw" || !item.sourceIds.includes(candidate.id)).map((candidate) => ({ ...candidate, distance: rectGap(item.worldRegion!, candidate.bounds) })).sort((a, b) => a.distance - b.distance || a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
    if (!scored.length || scored[0].distance > maxDistance) return { text: item.text, sourceIds: item.sourceIds, candidateIds: [], candidateRefs: [], status: "unmatched", geometricDistance: scored[0]?.distance ?? null, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: ["No nearby non-text canvas object is supported by the crop geometry."] };
    const close = scored.filter((candidate) => candidate.distance <= maxDistance && candidate.distance - scored[0].distance < ambiguityMargin);
    if (close.length > 1) return { text: item.text, sourceIds: item.sourceIds, candidateIds: close.map((candidate) => candidate.id), candidateRefs: close.map(({ scope, id }) => ({ scope, id })), status: "ambiguous", geometricDistance: scored[0].distance, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: ["Several canvas objects are similarly close to this OCR region."] };
    return { text: item.text, sourceIds: item.sourceIds, candidateIds: [scored[0].id], candidateRefs: [{ scope: scored[0].scope, id: scored[0].id }], status: "geometry-supported", geometricDistance: scored[0].distance, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: [...(item.uncertain ? ["OCR confidence or item-level localization is missing."] : []), "Spatial proximity is not user-confirmed."] };
  });
}

function scientificObjectBounds(object: CanvasInput["scientificObjects"][number]) {
  const geometry = object.geometry && typeof object.geometry === "object" ? object.geometry as Record<string, unknown> : {};
  const tail = geometry.tail && typeof geometry.tail === "object" ? geometry.tail as Record<string, unknown> : {};
  const tip = geometry.tip && typeof geometry.tip === "object" ? geometry.tip as Record<string, unknown> : {};
  if ([tail.x, tail.y, tip.x, tip.y].every((value) => typeof value === "number" && Number.isFinite(value))) {
    const x = [Number(tail.x), Number(tip.x)], y = [Number(tail.y), Number(tip.y)];
    return { x: Math.min(...x), y: Math.min(...y), width: Math.max(...x) - Math.min(...x), height: Math.max(...y) - Math.min(...y) };
  }
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}

export function imageRegionsFromInput(input: CanvasInput): OCRImageRegion[] {
  if (input.image?.regions?.length) return input.image.regions;
  return [];
}

function rectGap(a: OCRImageRegion["worldBounds"], b: OCRImageRegion["worldBounds"]) { const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)); return Math.hypot(dx, dy); }

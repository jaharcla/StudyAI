import { OCRResultSchema, type CanvasInput, type CanvasRecord, type OCRImageRegion, type OCRResult } from "./types.js";

export type StrokeGroup = { id: string; sourceIds: string[]; worldBounds: OCRImageRegion["worldBounds"] };
export type OCRCropPlan = StrokeGroup & { cropBounds: OCRImageRegion["cropBounds"]; width: number; height: number; pixelToWorld: OCRImageRegion["pixelToWorld"] };
export type RenderedCrop = { base64: string; mimeType?: string; width: number; height: number };
export type OCRAssociation = { text: string; sourceIds: string[]; candidateIds: string[]; status: "geometry-supported" | "ambiguous" | "unmatched"; geometricDistance: number | null; basis: "item-box" | "stroke-region" | "none"; uncertainty: string[] };

export function groupQuickdrawStrokes(input: CanvasInput, gapThreshold = 24): StrokeGroup[] {
  const selected = new Set(input.selectedIds);
  const records = input.nativeRecords.filter((record) => (record.type === "draw" || record.type === "highlight") && isStroke(record.geometry) && (!selected.size || selected.has(record.id)));
  const bounds = new Map(records.map((record) => [record.id, strokeBounds(record.geometry as { points: Array<{ x: number; y: number }> })]));
  const remaining = new Set(records.map((record) => record.id)), groups: StrokeGroup[] = [];
  while (remaining.size) {
    const ids = [remaining.values().next().value as string]; remaining.delete(ids[0]);
    for (let index = 0; index < ids.length; index++) for (const id of [...remaining]) if (rectGap(bounds.get(ids[index])!, bounds.get(id)!) <= gapThreshold) { remaining.delete(id); ids.push(id); }
    const rects = ids.map((id) => bounds.get(id)!);
    groups.push({ id: `stroke-group:${ids.slice().sort().join("+")}`, sourceIds: ids.sort(), worldBounds: union(rects) });
  }
  return groups;
}

export function planStrokeOCRCrops(groups: StrokeGroup[], options: { padding?: number; pixelsPerWorld?: number; minPixels?: number } = {}): OCRCropPlan[] {
  const padding = options.padding ?? 12, scale = options.pixelsPerWorld ?? 2, minPixels = options.minPixels ?? 64;
  return groups.map((group) => {
    const cropBounds = expand(group.worldBounds, padding);
    const width = Math.max(minPixels, Math.ceil(cropBounds.width * scale)), height = Math.max(minPixels, Math.ceil(cropBounds.height * scale));
    const pixelToWorld = { scaleX: cropBounds.width / width, scaleY: cropBounds.height / height, offsetX: cropBounds.x, offsetY: cropBounds.y };
    return { ...group, cropBounds, width, height, pixelToWorld };
  });
}

export async function renderOCRCropPlans(plans: OCRCropPlan[], render: (plan: OCRCropPlan) => Promise<RenderedCrop>): Promise<OCRImageRegion[]> {
  return Promise.all(plans.map(async (plan) => {
    const image = await render(plan);
    if (!image.base64 || image.width < 1 || image.height < 1) throw new Error(`Canvas crop renderer returned an invalid image for ${plan.id}.`);
    return { id: plan.id, base64: image.base64, mimeType: image.mimeType, worldBounds: plan.worldBounds, cropBounds: plan.cropBounds, sourceIds: plan.sourceIds, pixelToWorld: { scaleX: plan.cropBounds.width / image.width, scaleY: plan.cropBounds.height / image.height, offsetX: plan.cropBounds.x, offsetY: plan.cropBounds.y } };
  }));
}

export async function captureSelectedStrokeRegions(input: CanvasInput, render: (plan: OCRCropPlan) => Promise<RenderedCrop>, options?: { gapThreshold?: number; padding?: number; pixelsPerWorld?: number; minPixels?: number }) {
  const groups = groupQuickdrawStrokes(input, options?.gapThreshold);
  return renderOCRCropPlans(planStrokeOCRCrops(groups, options), render);
}

export function localizeOCRByRegion(result: OCRResult, regions: OCRImageRegion[]): OCRResult {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const items = result.items.map((item) => {
    const region = item.sourceRegionId ? regionById.get(item.sourceRegionId) : regions.length === 1 ? regions[0] : undefined;
    if (!region) return { ...item, sourceIds: [...new Set(item.sourceIds)], uncertain: true, locationPrecision: "unknown" as const };
    const worldRegion = item.imageRegion ? pixelsToWorld(item.imageRegion, region.pixelToWorld) : region.worldBounds;
    const locationPrecision = item.imageRegion ? "item" as const : "region" as const;
    return { ...item, sourceRegionId: region.id, sourceIds: [...new Set([...item.sourceIds, ...region.sourceIds])], worldRegion, locationPrecision, uncertain: item.uncertain || !item.confidence || !item.imageRegion };
  });
  return OCRResultSchema.parse({ ...result, items, uncertain: result.uncertain || items.some((item) => item.uncertain || item.locationPrecision === "unknown") });
}

export function associateOCRLabels(input: CanvasInput, result: OCRResult, maxDistance = 72, ambiguityMargin = 18): OCRAssociation[] {
  const candidates = [
    ...input.nativeRecords.filter((record) => record.bounds && record.type !== "draw" && record.type !== "highlight").map((record) => ({ id: record.id, bounds: record.bounds! })),
    ...input.scientificObjects.map((object) => ({ id: object.id, bounds: { x: object.x, y: object.y, width: object.width, height: object.height } })),
  ];
  return result.items.map((item) => {
    if (!item.worldRegion) return { text: item.text, sourceIds: item.sourceIds, candidateIds: [], status: "unmatched", geometricDistance: null, basis: "none", uncertainty: ["OCR has no localized world region."] };
    const scored = candidates.filter((candidate) => !item.sourceIds.includes(candidate.id)).map((candidate) => ({ id: candidate.id, distance: rectGap(item.worldRegion!, candidate.bounds) })).sort((a, b) => a.distance - b.distance);
    if (!scored.length || scored[0].distance > maxDistance) return { text: item.text, sourceIds: item.sourceIds, candidateIds: [], status: "unmatched", geometricDistance: scored[0]?.distance ?? null, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: ["No nearby non-text canvas object is supported by the crop geometry."] };
    const close = scored.filter((candidate) => candidate.distance <= maxDistance && candidate.distance - scored[0].distance < ambiguityMargin);
    if (close.length > 1) return { text: item.text, sourceIds: item.sourceIds, candidateIds: close.map((candidate) => candidate.id), status: "ambiguous", geometricDistance: scored[0].distance, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: ["Several canvas objects are similarly close to this OCR region."] };
    return { text: item.text, sourceIds: item.sourceIds, candidateIds: [scored[0].id], status: "geometry-supported", geometricDistance: scored[0].distance, basis: item.locationPrecision === "item" ? "item-box" : "stroke-region", uncertainty: item.uncertain ? ["OCR confidence or item-level localization is missing."] : [] };
  });
}

export function imageRegionsFromInput(input: CanvasInput): OCRImageRegion[] {
  if (input.image?.regions?.length) return input.image.regions;
  if (!input.image?.base64) return [];
  const worldBounds = input.image.worldBounds, pixelToWorld = input.image.pixelToWorld;
  return worldBounds && pixelToWorld ? [{ id: "canvas-region", base64: input.image.base64, mimeType: input.image.mimeType, worldBounds, cropBounds: worldBounds, sourceIds: [], pixelToWorld }] : [];
}

function isStroke(value: unknown): value is { kind: string; points: Array<{ x: number; y: number; pressure?: number | null }> } { return !!value && typeof value === "object" && (value as Record<string, unknown>).kind === "stroke" && Array.isArray((value as Record<string, unknown>).points) && ((value as Record<string, unknown>).points as unknown[]).every((point) => !!point && typeof point === "object" && Number.isFinite((point as Record<string, unknown>).x) && Number.isFinite((point as Record<string, unknown>).y)); }
function strokeBounds(geometry: { points: Array<{ x: number; y: number }> }) { const xs = geometry.points.map((p) => p.x), ys = geometry.points.map((p) => p.y); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; }
function rectGap(a: OCRImageRegion["worldBounds"], b: OCRImageRegion["worldBounds"]) { const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)); return Math.hypot(dx, dy); }
function union(rects: Array<OCRImageRegion["worldBounds"]>) { const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y)), right = Math.max(...rects.map((r) => r.x + r.width)), bottom = Math.max(...rects.map((r) => r.y + r.height)); return { x, y, width: right - x, height: bottom - y }; }
function expand(bounds: OCRImageRegion["worldBounds"], padding: number) { return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 }; }
function pixelsToWorld(bounds: OCRImageRegion["worldBounds"], transform: OCRImageRegion["pixelToWorld"]) { return { x: bounds.x * transform.scaleX + transform.offsetX, y: bounds.y * transform.scaleY + transform.offsetY, width: bounds.width * Math.abs(transform.scaleX), height: bounds.height * Math.abs(transform.scaleY) }; }

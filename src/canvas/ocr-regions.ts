export type CanvasRegionBounds = { x: number; y: number; width: number; height: number };
export type CanvasInkStrokeBounds = { id: string; type: string; bounds?: CanvasRegionBounds; points?: readonly { x: number; y: number }[] };
export type CanvasStrokeGroup = { id: string; sourceIds: string[]; worldBounds: CanvasRegionBounds };
export type CanvasOCRRegionScore = { total: number; textContent: number; strokeComposition: number; spatialRelevance: number; visualComplexity: number };
export type RankedCanvasStrokeGroup = CanvasStrokeGroup & { score: CanvasOCRRegionScore };
export type OmittedCanvasOCRRegion = RankedCanvasStrokeGroup & { reason: "not-selected" | "crop-limit" };
export type CanvasOCRCropPlan = CanvasStrokeGroup & { cropBounds: CanvasRegionBounds; width: number; height: number; pixelToWorld: { scaleX: number; scaleY: number; offsetX: number; offsetY: number } };

export const CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS = 3;
export const CANVAS_OCR_MAX_REGIONS_LIMIT = 8;
export const CANVAS_OCR_DEFAULT_PADDING = 12;

export function clampOCRRegionLimit(value: unknown, fallback = CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(CANVAS_OCR_MAX_REGIONS_LIMIT, Math.floor(parsed)));
}

export function groupCanvasInkStrokes(records: readonly CanvasInkStrokeBounds[], selectedIds: readonly string[] = [], gapThreshold = 24): CanvasStrokeGroup[] {
  if (!Number.isFinite(gapThreshold) || gapThreshold < 0) throw new Error("Stroke group gap threshold must be finite and nonnegative.");
  const eligible = records.filter((record) => (record.type === "draw" || record.type === "highlight") && validBounds(record.bounds)).sort((a, b) => a.id.localeCompare(b.id));
  const bounds = new Map(eligible.map((record) => [record.id, record.bounds!]));
  const remaining = new Set(eligible.map((record) => record.id));
  const groups: CanvasStrokeGroup[] = [];
  while (remaining.size) {
    const ids = [remaining.values().next().value as string];
    remaining.delete(ids[0]);
    for (let index = 0; index < ids.length; index++) {
      for (const id of [...remaining]) {
        if (rectGap(bounds.get(ids[index])!, bounds.get(id)!) <= gapThreshold) {
          remaining.delete(id);
          ids.push(id);
        }
      }
    }
    const sourceIds = ids.sort();
    groups.push({ id: `stroke-group:${sourceIds.join("+")}`, sourceIds, worldBounds: union(sourceIds.map((id) => bounds.get(id)!)) });
  }
  const ordered = groups.sort((a, b) => a.worldBounds.y - b.worldBounds.y || a.worldBounds.x - b.worldBounds.x || a.id.localeCompare(b.id));
  const selected = new Set(selectedIds.filter((id) => bounds.has(id)));
  return selected.size ? ordered.filter((group) => group.sourceIds.some((id) => selected.has(id))) : ordered;
}

/**
 * Pure-ink math boards need the whole expression in one crop. Splitting an equation
 * into gap-based stroke groups is what produced fragmented MathWriting OCR.
 */
export function groupCanvasInkStrokesForOCR(records: readonly CanvasInkStrokeBounds[], options: { selectedIds?: readonly string[]; gapThreshold?: number; mathMode?: boolean } = {}): CanvasStrokeGroup[] {
  const groups = groupCanvasInkStrokes(records, options.selectedIds ?? [], options.gapThreshold ?? 24);
  if (!options.mathMode || groups.length <= 1) return groups;
  const sourceIds = groups.flatMap((group) => group.sourceIds).sort();
  return [{ id: `stroke-group:expression:${sourceIds.join("+")}`, sourceIds, worldBounds: union(groups.map((group) => group.worldBounds)) }];
}

export function isMathInkBoard(records: readonly CanvasInkStrokeBounds[], objectCount = 0): boolean {
  return objectCount === 0 && records.length > 0 && records.every((record) => record.type === "draw" || record.type === "highlight");
}

export function selectCanvasOCRGroups(groups: readonly CanvasStrokeGroup[], options: {
  limit?: number;
  records?: readonly CanvasInkStrokeBounds[];
  relevanceBounds?: readonly CanvasRegionBounds[];
  selectedIds?: readonly string[];
} = {}): { selected: RankedCanvasStrokeGroup[]; omitted: OmittedCanvasOCRRegion[] } {
  const limit = options.limit ?? CANVAS_OCR_MAX_REGIONS_PER_ANALYSIS;
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Canvas OCR region limit must be a nonnegative integer.");
  const selectedIds = new Set(options.selectedIds ?? []);
  const manualGroups = groups.filter((group) => group.sourceIds.some((id) => selectedIds.has(id)));
  const manualSelection = manualGroups.length > 0;
  const records = new Map((options.records ?? []).map((record) => [record.id, record]));
  const ranked = groups.map((group) => ({ ...group, score: scoreCanvasOCRGroup(group, [...records.values()].filter((record) => group.sourceIds.includes(record.id)), options.relevanceBounds ?? []) }));
  const eligible = manualSelection ? ranked.filter((group) => group.sourceIds.some((id) => selectedIds.has(id))) : ranked;
  const ordered = eligible.sort((a, b) => b.score.total - a.score.total || a.worldBounds.y - b.worldBounds.y || a.worldBounds.x - b.worldBounds.x || a.id.localeCompare(b.id));
  const chosen: RankedCanvasStrokeGroup[] = [];
  const remaining = [...ordered];
  while (remaining.length && chosen.length < limit) {
    const diverseIndex = chosen.length ? remaining.findIndex((candidate) => chosen.every((current) => centersDistance(candidate.worldBounds, current.worldBounds) >= 96)) : 0;
    chosen.push(remaining.splice(diverseIndex < 0 ? 0 : diverseIndex, 1)[0]);
  }
  const chosenIds = new Set(chosen.map((group) => group.id));
  const omitted = ranked.filter((group) => !chosenIds.has(group.id)).map((group) => ({ ...group, reason: manualSelection && !group.sourceIds.some((id) => selectedIds.has(id)) ? "not-selected" as const : "crop-limit" as const }));
  return { selected: chosen, omitted };
}

export function planCanvasOCRCrops(groups: CanvasStrokeGroup[], options: { padding?: number; pixelsPerWorld?: number; minPixels?: number } = {}): CanvasOCRCropPlan[] {
  const padding = options.padding ?? CANVAS_OCR_DEFAULT_PADDING, scale = options.pixelsPerWorld ?? 2, minPixels = options.minPixels ?? 64;
  if (![padding, scale, minPixels].every(Number.isFinite) || padding < 0 || scale <= 0 || minPixels < 1) throw new Error("Canvas OCR crop options must be finite and positive.");
  return groups.map((group) => {
    const cropBounds = expand(group.worldBounds, padding);
    const width = Math.max(Math.ceil(minPixels), Math.ceil(cropBounds.width * scale)), height = Math.max(Math.ceil(minPixels), Math.ceil(cropBounds.height * scale));
    return { ...group, cropBounds, width, height, pixelToWorld: { scaleX: cropBounds.width / width, scaleY: cropBounds.height / height, offsetX: cropBounds.x, offsetY: cropBounds.y } };
  });
}

export function canvasOCRRegionTransform(cropBounds: CanvasRegionBounds, pixelWidth: number, pixelHeight: number) {
  if (!validBounds(cropBounds) || !Number.isInteger(pixelWidth) || !Number.isInteger(pixelHeight) || pixelWidth < 1 || pixelHeight < 1) throw new Error("Canvas OCR crop dimensions are invalid.");
  return { scaleX: cropBounds.width / pixelWidth, scaleY: cropBounds.height / pixelHeight, offsetX: cropBounds.x, offsetY: cropBounds.y };
}

export function isValidCanvasRegionBounds(value: unknown): value is CanvasRegionBounds {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bounds = value as Record<string, unknown>;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every((number) => typeof number === "number" && Number.isFinite(number)) && Number(bounds.width) >= 0 && Number(bounds.height) >= 0;
}

export function sameCanvasRegionBounds(a: CanvasRegionBounds, b: CanvasRegionBounds) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function validBounds(value: unknown): value is CanvasRegionBounds { return isValidCanvasRegionBounds(value); }
function scoreCanvasOCRGroup(group: CanvasStrokeGroup, records: CanvasInkStrokeBounds[], relevanceBounds: readonly CanvasRegionBounds[]): CanvasOCRRegionScore {
  const count = records.length || group.sourceIds.length;
  const countSignal = clamp(Math.log2(count + 1) / Math.log2(9));
  const width = Math.max(group.worldBounds.width, 1), height = Math.max(group.worldBounds.height, 1);
  const aspect = Math.max(width, height) / Math.min(width, height);
  const textAspect = clamp(1 - Math.abs(Math.log(aspect / 2.5)) / Math.log(8));
  const bottoms = records.flatMap((record) => record.bounds ? [record.bounds.y + record.bounds.height] : []);
  const baselineSpread = bottoms.length > 1 ? medianAbsoluteDeviation(bottoms) : 0;
  const baselineAlignment = bottoms.length > 1 ? clamp(1 - baselineSpread / Math.max(12, median(bottoms.map((value) => Math.abs(value - median(bottoms))) ) + 12)) : 0;
  const textContent = clamp(countSignal * 0.6 + textAspect * 0.25 + baselineAlignment * 0.15);

  const orientations = new Set(records.map(strokeOrientation).filter(Boolean));
  const sizeValues = records.flatMap((record) => record.bounds ? [Math.max(record.bounds.width, record.bounds.height)] : []);
  const sizeVariation = sizeValues.length > 1 ? clamp(standardDeviation(sizeValues) / Math.max(median(sizeValues), 1)) : 0;
  const strokeComposition = clamp(countSignal * 0.65 + Math.min(1, orientations.size / 3) * 0.2 + sizeVariation * 0.15);

  const nearest = relevanceBounds.length ? Math.min(...relevanceBounds.map((bounds) => rectGap(group.worldBounds, bounds))) : Infinity;
  const spatialRelevance = Number.isFinite(nearest) ? clamp(1 - nearest / 240) : 0;

  const points = records.flatMap((record) => record.points ?? []);
  const pointSignal = clamp(Math.log2(points.length + 1) / Math.log2(512));
  const turns = records.reduce((sum, record) => sum + strokeTurns(record.points ?? []), 0);
  const visualComplexity = clamp(pointSignal * 0.65 + clamp(turns / Math.max(4, points.length * 0.08)) * 0.35);
  const total = Number((100 * (textContent * 0.35 + strokeComposition * 0.3 + spatialRelevance * 0.2 + visualComplexity * 0.15)).toFixed(3));
  return { total, textContent, strokeComposition, spatialRelevance, visualComplexity };
}

function strokeOrientation(record: CanvasInkStrokeBounds) {
  const points = record.points ?? [];
  if (points.length < 2) return "";
  const first = points[0], last = points[points.length - 1], dx = Math.abs(last.x - first.x), dy = Math.abs(last.y - first.y);
  return dx > dy * 1.5 ? "horizontal" : dy > dx * 1.5 ? "vertical" : "diagonal";
}

function strokeTurns(points: readonly { x: number; y: number }[]) {
  let turns = 0;
  for (let i = 2; i < points.length; i += 2) {
    const a = points[i - 2], b = points[i - 1], c = points[i];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (denominator > 0 && (ux * vx + uy * vy) / denominator < 0.8) turns++;
  }
  return turns;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b), mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}

function medianAbsoluteDeviation(values: number[]) {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const center = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function centersDistance(a: CanvasRegionBounds, b: CanvasRegionBounds) { return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2); }
function rectGap(a: CanvasRegionBounds, b: CanvasRegionBounds) {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}
function union(rects: CanvasRegionBounds[]): CanvasRegionBounds {
  const x = Math.min(...rects.map((rect) => rect.x)), y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)), bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}
function expand(bounds: CanvasRegionBounds, padding: number): CanvasRegionBounds {
  return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
}

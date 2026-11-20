import { groupQuickdrawStrokes } from "../regions.js";
import type { CanvasInput } from "../types.js";
import { BaselineCanvasRecognitionAdapter } from "./baseline.js";
import { ClipCanvasRecognitionAdapter, loadClipRuntime } from "./clip.js";
import { renderStrokeGroupPng } from "./render.js";
import {
  RECOGNITION_LIMITS,
  recognitionLimits,
  recognitionModeFromEnv,
  type CanvasRecognitionAdapter,
  type CanvasRecognitionInput,
  type CanvasRecognitionMode,
  type CanvasRecognitionPoint,
  type CanvasRecognitionResult,
  type CanvasRecognitionStage,
} from "./types.js";

export type RecognizeCanvasOptions = {
  mode?: CanvasRecognitionMode;
  adapter?: CanvasRecognitionAdapter;
  prototypes?: Record<string, readonly (readonly number[])[]>;
  labels?: readonly string[];
  signal?: AbortSignal;
};

function pointsFor(input: CanvasInput) {
  const map = new Map<string, CanvasRecognitionPoint[]>();
  for (const record of input.nativeRecords) {
    const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
    const values = Array.isArray(geometry.points) ? geometry.points : [];
    const points = values.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Record<string, unknown>;
      return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y) ? [{ x: point.x, y: point.y }] : [];
    });
    if (points.length) map.set(record.id, points);
  }
  return map;
}

function timeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`Canvas recognition timed out after ${ms} ms.`)), ms);
    const abort = () => reject(new Error("Canvas recognition was aborted."));
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolvePromise(value); },
      (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); },
    );
  });
}

async function runAdapter(adapter: CanvasRecognitionAdapter, inputs: CanvasRecognitionInput[], options: { signal?: AbortSignal; timeoutMs: number }) {
  const results: CanvasRecognitionResult[] = [];
  for (let index = 0; index < inputs.length; index += RECOGNITION_LIMITS.batchSize) {
    if (options.signal?.aborted) throw new Error("Canvas recognition was aborted.");
    const batch = inputs.slice(index, index + RECOGNITION_LIMITS.batchSize);
    results.push(...await timeout(adapter.recognize(batch, options.signal), options.timeoutMs, options.signal));
  }
  return results;
}

export async function recognizeCanvasStrokes(input: CanvasInput, options: RecognizeCanvasOptions = {}): Promise<CanvasRecognitionStage | null> {
  const mode = options.mode ?? recognitionModeFromEnv();
  if (mode === "off") return null;
  const limits = recognitionLimits();
  const started = performance.now();
  const warnings: string[] = [];
  const groups = groupQuickdrawStrokes(input);
  const chosen = groups.slice(0, limits.maxGroups);
  if (!chosen.length) {
    return { mode: mode === "auto" ? "baseline" : mode, adapterId: "none", adapterVersion: "0", results: [], warnings: ["No freehand stroke groups were available for recognition."], latencyMs: performance.now() - started, groupsConsidered: 0, groupsRecognized: 0 };
  }
  if (groups.length > chosen.length) warnings.push(`${groups.length - chosen.length} stroke group(s) were omitted by the recognition group limit.`);

  const pointsByRecord = pointsFor(input);
  let needsImage = mode === "clip" || mode === "auto";
  let clipPreflightFailed = false;
  if (!options.adapter && needsImage) {
    try { await loadClipRuntime(); }
    catch (error) {
      clipPreflightFailed = true;
      needsImage = false;
      warnings.push(`CLIP recognition is unavailable; using the geometry baseline: ${error instanceof Error ? error.message : "initialization failed"}.`);
    }
  }
  const inputs: CanvasRecognitionInput[] = [];
  for (const group of chosen) {
    const strokes = group.sourceIds.map((id) => pointsByRecord.get(id) ?? []).filter((points) => points.length > 0);
    const points = strokes.flat();
    if (!points.length) continue;
    const entry: CanvasRecognitionInput = { groupId: group.id, sourceIds: group.sourceIds.slice(0, RECOGNITION_LIMITS.maxSourceIds), bounds: group.worldBounds, points, strokes };
    if (needsImage) {
      try {
        const rendered = await renderStrokeGroupPng(strokes);
        entry.pngBase64 = rendered.pngBase64;
        entry.pngWidth = rendered.width;
        entry.pngHeight = rendered.height;
      } catch (error) {
        warnings.push(`Could not render a stroke group for CLIP: ${error instanceof Error ? error.message : "render failed"}.`);
      }
    }
    inputs.push(entry);
  }
  if (!inputs.length) {
    return { mode: mode === "auto" ? "baseline" : mode, adapterId: "none", adapterVersion: "0", results: [], warnings: [...warnings, "No stroke group had usable points."], latencyMs: performance.now() - started, groupsConsidered: chosen.length, groupsRecognized: 0 };
  }

  const baseline = new BaselineCanvasRecognitionAdapter();
  let adapter: CanvasRecognitionAdapter = options.adapter ?? baseline;
  let effectiveMode: Exclude<CanvasRecognitionMode, "off"> = mode === "auto" || clipPreflightFailed ? "baseline" : mode;
  if (!options.adapter && needsImage) {
    try {
      adapter = new ClipCanvasRecognitionAdapter({ labels: options.labels, prototypes: options.prototypes, minConfidence: limits.minConfidence, minMargin: limits.minMargin });
      effectiveMode = "clip";
    } catch (error) {
      warnings.push(`CLIP recognition is unavailable; using the geometry baseline: ${error instanceof Error ? error.message : "initialization failed"}.`);
      adapter = baseline;
      effectiveMode = "baseline";
    }
  }
  if (options.adapter) effectiveMode = mode === "auto" ? "clip" : mode;

  let results: CanvasRecognitionResult[];
  try {
    results = await runAdapter(adapter, inputs, { signal: options.signal, timeoutMs: limits.timeoutMs });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    warnings.push(`Canvas recognition failed; using the geometry baseline: ${error instanceof Error ? error.message : "adapter failed"}.`);
    adapter = baseline;
    effectiveMode = "baseline";
    results = await runAdapter(adapter, inputs, { signal: options.signal, timeoutMs: limits.timeoutMs });
  }

  const byId = new Map(chosen.map((group) => [group.id, group]));
  const filtered = results.filter((result) => byId.has(result.groupId) && result.candidates.length > 0).slice(0, chosen.length);
  return {
    mode: effectiveMode,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    results: filtered,
    warnings,
    latencyMs: Number((performance.now() - started).toFixed(1)),
    groupsConsidered: chosen.length,
    groupsRecognized: filtered.length,
  };
}

import { z } from "zod";
import { BoundsSchema } from "../types.js";

export const CanvasRecognitionModeSchema = z.enum(["off", "baseline", "clip", "auto"]);
export type CanvasRecognitionMode = z.infer<typeof CanvasRecognitionModeSchema>;

export const CanvasRecognitionCandidateSchema = z.object({
  label: z.string().min(1).max(80),
  kind: z.enum(["symbol", "shape", "diagram-element", "unknown"]),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.string().min(1).max(80)).max(8),
}).strict();

export const CanvasRecognitionResultSchema = z.object({
  groupId: z.string().min(1).max(12000),
  sourceIds: z.array(z.string().min(1).max(512)).min(1).max(64),
  bounds: BoundsSchema,
  candidates: z.array(CanvasRecognitionCandidateSchema).max(2),
  uncertain: z.boolean(),
  uncertaintyReasons: z.array(z.string().min(1).max(300)).max(16),
}).strict();

export type CanvasRecognitionCandidate = z.infer<typeof CanvasRecognitionCandidateSchema>;
export type CanvasRecognitionResult = z.infer<typeof CanvasRecognitionResultSchema>;

export type CanvasRecognitionPoint = { x: number; y: number };

export type CanvasRecognitionInput = {
  groupId: string;
  sourceIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  points: CanvasRecognitionPoint[];
  strokes: CanvasRecognitionPoint[][];
  pngBase64?: string;
  pngWidth?: number;
  pngHeight?: number;
};

export interface CanvasRecognitionAdapter {
  readonly id: string;
  readonly version: string;
  recognize(inputs: readonly CanvasRecognitionInput[], signal?: AbortSignal): Promise<CanvasRecognitionResult[]>;
}

export type CanvasRecognitionStage = {
  mode: Exclude<CanvasRecognitionMode, "off">;
  adapterId: string;
  adapterVersion: string;
  results: CanvasRecognitionResult[];
  warnings: string[];
  latencyMs: number;
  groupsConsidered: number;
  groupsRecognized: number;
};

export const RECOGNITION_LIMITS = {
  maxGroups: 24,
  imageSize: 224,
  padding: 16,
  strokeWidth: 6,
  batchSize: 8,
  timeoutMs: 8000,
  maxCandidates: 2,
  minConfidence: 0.18,
  minMargin: 0.03,
  maxLabels: 60,
  maxLabelChars: 80,
  maxSourceIds: 64,
  maxUncertaintyReasons: 16,
} as const;

export function recognitionModeFromEnv(env: NodeJS.ProcessEnv = process.env): CanvasRecognitionMode {
  const raw = (env.CANVAS_RECOGNITION || "baseline").trim().toLowerCase();
  const parsed = CanvasRecognitionModeSchema.safeParse(raw);
  if (!parsed.success) throw new Error("CANVAS_RECOGNITION must be off, baseline, clip, or auto");
  return parsed.data;
}

export function recognitionLimits(env: NodeJS.ProcessEnv = process.env) {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    maxGroups: Math.max(1, Math.min(64, Math.floor(number(env.CANVAS_RECOGNITION_MAX_GROUPS, RECOGNITION_LIMITS.maxGroups)))),
    minConfidence: Math.max(0, Math.min(1, number(env.CANVAS_RECOGNITION_MIN_CONFIDENCE, RECOGNITION_LIMITS.minConfidence))),
    minMargin: Math.max(0, Math.min(1, number(env.CANVAS_RECOGNITION_MIN_MARGIN, RECOGNITION_LIMITS.minMargin))),
    timeoutMs: Math.max(500, Math.min(20_000, Math.floor(number(env.CANVAS_RECOGNITION_TIMEOUT_MS, RECOGNITION_LIMITS.timeoutMs)))),
  };
}

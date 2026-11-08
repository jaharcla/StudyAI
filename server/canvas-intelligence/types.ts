import { z } from "zod";

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export const BoundsSchema = z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() });
export const OCRItemSchema = z.object({ text: z.string(), kind: z.enum(["word", "symbol", "number", "equation", "unknown"]), confidence: z.number().min(0).max(1).nullable(), alternatives: z.array(z.string()), sourceIds: z.array(z.string()), imageRegion: BoundsSchema.nullable(), sourceRegionId: z.string().nullable().default(null), worldRegion: BoundsSchema.nullable().default(null), locationPrecision: z.enum(["item", "region", "unknown"]).default("unknown"), uncertain: z.boolean().default(false) });
export const OCRResultSchema = z.object({ items: z.array(OCRItemSchema), uncertain: z.boolean(), raw: z.string() });
export const StructureObjectSchema = z.object({ id: z.string(), kind: z.string(), label: z.string().nullable(), sourceIds: z.array(z.string()), confidence: z.number().min(0).max(1), basis: z.enum(["native", "model"]) });
export const StructureRelationshipSchema = z.object({ fromId: z.string(), toId: z.string(), relation: z.string(), sourceIds: z.array(z.string()), confidence: z.number().min(0).max(1), basis: z.enum(["geometry", "model"]) });
export const StructureResultSchema = z.object({ objects: z.array(StructureObjectSchema), relationships: z.array(StructureRelationshipSchema), observations: z.array(z.object({ description: z.string(), sourceIds: z.array(z.string()), confidence: z.number().min(0).max(1), basis: z.enum(["geometry", "native", "model"]) })), ambiguities: z.array(z.string()), raw: z.string().optional() });
export const FusionResultSchema = z.object({ answer: z.union([z.string(), z.array(z.string())]).transform((value) => Array.isArray(value) ? value.join("\n") : value), objects: z.array(StructureObjectSchema), relationships: z.array(StructureRelationshipSchema), associations: z.array(z.object({ description: z.string(), sourceIds: z.array(z.string()), confidence: z.number().min(0).max(1) }),), uncertainties: z.union([z.array(z.union([z.string(), z.record(z.string(), z.unknown())])), z.string()]).transform((value) => typeof value === "string" ? [value] : value), proposedAction: z.unknown().optional() });

export function schemasForCanvasIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return { structure: StructureResultSchema, fusion: FusionResultSchema };
  const id = z.enum(uniqueIds as [string, ...string[]]);
  const sourceIds = z.array(id);
  const object = StructureObjectSchema.extend({ id, sourceIds });
  const relationship = StructureRelationshipSchema.extend({ fromId: id, toId: id, sourceIds });
  const structure = z.object({ objects: z.array(object), relationships: z.array(relationship), observations: StructureResultSchema.shape.observations, ambiguities: z.array(z.string()), raw: z.string().optional() });
  const fusion = z.object({ answer: FusionResultSchema.shape.answer, objects: z.array(object), relationships: z.array(relationship), associations: z.array(z.object({ description: z.string(), sourceIds, confidence: z.number().min(0).max(1) })), uncertainties: FusionResultSchema.shape.uncertainties, proposedAction: z.unknown().optional() });
  return { structure: structure as unknown as z.ZodType<StructureResult>, fusion: fusion as unknown as z.ZodType<FusionResult> };
}

export type OCRResult = z.infer<typeof OCRResultSchema>;
export type StructureResult = z.infer<typeof StructureResultSchema>;
export type FusionResult = z.infer<typeof FusionResultSchema>;
export type CanvasRecord = { id: string; type: string; bounds?: z.infer<typeof BoundsSchema>; geometry?: unknown; text?: string; raw: unknown };
export type PixelToWorld = { scaleX: number; scaleY: number; offsetX: number; offsetY: number };
export type OCRImageRegion = { id: string; base64: string; mimeType?: string; worldBounds: z.infer<typeof BoundsSchema>; cropBounds: z.infer<typeof BoundsSchema>; sourceIds: string[]; pixelToWorld: PixelToWorld };
export type CanvasImageInput = { base64?: string; mimeType?: string; pixelToWorld?: PixelToWorld; worldBounds?: z.infer<typeof BoundsSchema>; regions?: OCRImageRegion[] };
export type CanvasInput = {
  boardId: string;
  courseId?: string;
  lessonId?: string;
  selectedIds: string[];
  nativeRecords: CanvasRecord[];
  scientificObjects: Array<Record<string, unknown> & { id: string; x: number; y: number; width: number; height: number; kind: string }>;
  relationships: Array<{ fromId: string; toId: string; distance: number; basis: "bounds" }>;
  image?: CanvasImageInput;
  revision: string;
};

export type CanvasIntelligenceModels = { ocr: string; reasoning: string; fusion: string };
export function getCanvasIntelligenceModels(env: NodeJS.ProcessEnv = process.env): CanvasIntelligenceModels {
  const reasoning = env.CANVAS_REASONING_MODEL || env.OLLAMA_MODEL || "qwen3:latest";
  return { ocr: env.CANVAS_OCR_MODEL || "glm-ocr:q8_0", reasoning, fusion: env.CANVAS_FUSION_MODEL || reasoning };
}

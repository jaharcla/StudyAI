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

export function normalizeCanvasStructureOutput(value: unknown, ids: string[]): unknown {
  return normalizeCanvasModelReferences(value, new Set(ids));
}

export function normalizeCanvasFusionOutput(value: unknown, ids: string[]): unknown {
  const input = normalizeCanvasModelReferences(value, new Set(ids)) as Record<string, unknown>;
  let rejected = false;
  const associations = (Array.isArray(input.associations) ? input.associations : []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { rejected = true; return []; }
    const item = value as Record<string, unknown>;
    const sourceIds = Array.isArray(item.sourceIds) ? item.sourceIds.filter((id): id is string => typeof id === "string" && ids.includes(id)) : [];
    if (sourceIds.length !== (Array.isArray(item.sourceIds) ? item.sourceIds.length : 0)) rejected = true;
    return sourceIds.length ? [{ ...item, sourceIds: [...new Set(sourceIds)] }] : [];
  });
  const rawUncertainties = typeof input.uncertainties === "string" ? [input.uncertainties] : Array.isArray(input.uncertainties) ? input.uncertainties : [];
  const warnings = (input.ambiguities as string[]).filter((item) => item.startsWith("Unsupported model"));
  if (rejected) warnings.push("Unsupported model association sources were discarded.");
  if (!Array.isArray(input.uncertainties) && typeof input.uncertainties !== "string") warnings.push("Model uncertainty data was malformed.");
  return { ...input, associations, uncertainties: [...rawUncertainties, ...warnings] };
}

function normalizeCanvasModelReferences(value: unknown, allowed: Set<string>) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  let rejected = false;
  const references = (value: unknown) => {
    const sourceIds = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && allowed.has(id)) : [];
    if (!Array.isArray(value) || sourceIds.length !== value.length) rejected = true;
    return [...new Set(sourceIds)];
  };
  const objects = (Array.isArray(input.objects) ? input.objects : []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { rejected = true; return []; }
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !allowed.has(item.id)) { rejected = true; return []; }
    const sourceIds = references(item.sourceIds);
    return [{ ...item, sourceIds: sourceIds.length ? sourceIds : [item.id], basis: "model" }];
  });
  const relationships = (Array.isArray(input.relationships) ? input.relationships : []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { rejected = true; return []; }
    const item = value as Record<string, unknown>;
    if (typeof item.fromId !== "string" || typeof item.toId !== "string" || !allowed.has(item.fromId) || !allowed.has(item.toId)) { rejected = true; return []; }
    const sourceIds = references(item.sourceIds);
    return [{ ...item, sourceIds: sourceIds.length ? sourceIds : [...new Set([item.fromId, item.toId])], basis: "model" }];
  });
  const observations = (Array.isArray(input.observations) ? input.observations : []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { rejected = true; return []; }
    const item = value as Record<string, unknown>, sourceIds = references(item.sourceIds);
    if (!sourceIds.length) { rejected = true; return []; }
    return [{ ...item, sourceIds, basis: "model" }];
  });
  const ambiguities = Array.isArray(input.ambiguities) ? input.ambiguities.filter((item): item is string => typeof item === "string") : [];
  if (rejected) ambiguities.push("Unsupported model references were discarded; verify interpretations against observed canvas data.");
  return { ...input, objects, relationships, observations, ambiguities };
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

import { z } from "zod";

export const CANVAS_SCENE_SCHEMA_VERSION = 1 as const;
export const CANVAS_SCENE_MAX_NODES = 10_000;
export const CANVAS_SCENE_MAX_EDGES = 30_000;
export const CANVAS_SCENE_MAX_CONTEXT_CHARS = 6_000;

export const CanvasSceneBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).strict();

export const CanvasSceneRefSchema = z.object({
  scope: z.enum(["quickdraw", "science", "scene"]),
  id: z.string().min(1).max(512),
}).strict();

export const CanvasScenePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().min(0).max(1).nullable(),
}).strict();

export const CanvasSceneNodeSchema = z.object({
  id: z.string().min(1).max(512),
  kind: z.enum(["stroke", "stroke-group", "native-object", "scientific-object", "recognition-candidate", "ocr-item", "model-observation"]),
  ref: CanvasSceneRefSchema,
  bounds: CanvasSceneBoundsSchema,
  boundsBasis: z.enum(["source", "source-union", "region", "derived"]),
  text: z.string().max(2000).nullable(),
  recordType: z.string().max(64).nullable(),
  origin: z.enum(["quickdraw", "geometry", "science", "ocr", "model", "user"]),
  verificationStatus: z.enum(["source", "derived", "unconfirmed", "confirmed"]),
  confidence: z.number().min(0).max(1).nullable(),
  sourceRefs: z.array(CanvasSceneRefSchema).max(64),
  geometry: z.object({
    centroid: z.object({ x: z.number().finite(), y: z.number().finite() }).nullable(),
    orientation: z.number().finite().nullable(),
    pathLength: z.number().finite().nonnegative().nullable(),
    pointCount: z.number().int().nonnegative().nullable(),
    aspect: z.number().finite().nonnegative().nullable(),
  }).strict().nullable(),
  uncertaintyReasons: z.array(z.string().max(300)).max(16),
}).strict();

export const CanvasSceneEdgeSchema = z.object({
  id: z.string().min(1).max(512),
  kind: z.enum(["contains", "overlaps", "near", "left-of", "right-of", "above", "below", "aligned-with", "relation", "derived-from", "labels", "recognizes"]),
  from: z.string().min(1).max(512),
  to: z.string().min(1).max(512),
  origin: z.enum(["native", "geometry", "science", "ocr", "model", "user"]),
  verificationStatus: z.enum(["source", "derived", "unconfirmed", "confirmed"]),
  basis: z.enum(["bounds", "points", "explicit", "ocr-region", "model", "recognition"]),
  distance: z.number().finite().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  sourceRefs: z.array(CanvasSceneRefSchema).max(64),
  uncertaintyReasons: z.array(z.string().max(300)).max(16),
}).strict();

export const CanvasSceneGraphSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.object({ boardId: z.string().min(1).max(512), courseId: z.string().min(1).max(512), lessonId: z.string().min(1).max(512) }).strict(),
  revision: z.number().int().nonnegative(),
  revisionHash: z.string().min(1).max(128),
  snapshotHash: z.string().min(1).max(128),
  builderVersion: z.string().min(1).max(64),
  builtAt: z.string().datetime(),
  nodes: z.array(CanvasSceneNodeSchema).max(CANVAS_SCENE_MAX_NODES),
  edges: z.array(CanvasSceneEdgeSchema).max(CANVAS_SCENE_MAX_EDGES),
  warnings: z.array(z.string().max(300)).max(64),
  truncated: z.boolean(),
}).strict();

export type CanvasSceneBounds = z.infer<typeof CanvasSceneBoundsSchema>;
export type CanvasSceneRef = z.infer<typeof CanvasSceneRefSchema>;
export type CanvasScenePoint = z.infer<typeof CanvasScenePointSchema>;
export type CanvasSceneNode = z.infer<typeof CanvasSceneNodeSchema>;
export type CanvasSceneEdge = z.infer<typeof CanvasSceneEdgeSchema>;
export type CanvasSceneGraph = z.infer<typeof CanvasSceneGraphSchema>;

export type CanvasSceneQuery = {
  revisionHash: string;
  query: string;
  nodeKinds?: CanvasSceneNode["kind"][];
  limit?: number;
};

import { z } from "zod";
import type { CanvasSceneEdge, CanvasSceneGraph, CanvasSceneNode } from "../spatial/types.js";

const idSchema = z.string().min(1).max(512);
const nodeKinds = ["stroke", "stroke-group", "native-object", "scientific-object"] as const;

export const CANVAS_DESIGN_GUIDE = [
  "Scientific canvas design guide — read before proposing a diagram.",
  "Layout: place process nodes left-to-right and hierarchies top-to-bottom; keep at least 60px gaps.",
  "Sizing: keep boxes at least 120x60 and labels to at most four words; move detail into note annotations.",
  "Order: create shapes first, then labeled arrows, then captions; highlight only after shapes exist.",
  "annotations: treat OCR and recognition text as unconfirmed evidence, never as a confirmed label.",
  "Reader-check: avoid overlapping text and keep every shape inside the active viewport before user review.",
].join("\n");

export const canvasDescribeSchema = z.object({ boardId: idSchema }).strict();

export type CanvasViewport = { x: number; y: number; w: number; h: number };
export type CanvasDescription = {
  boardId: string;
  revision: number;
  objectCount: number;
  kinds: Record<string, number>;
  bounds: { x: number; y: number; width: number; height: number } | null;
  lines: string[];
  warnings: string[];
};

/** Cheap plain-text read of the revision-bound scene, with advisory reader-check warnings. */
export function describeCanvas(graph: CanvasSceneGraph, viewport?: CanvasViewport): CanvasDescription {
  const kinds: Record<string, number> = {};
  for (const node of graph.nodes) kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;
  const minX = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.bounds.x)) : 0;
  const minY = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.bounds.y)) : 0;
  const maxX = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.bounds.x + node.bounds.width)) : 0;
  const maxY = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.bounds.y + node.bounds.height)) : 0;
  const warnings = [...graph.warnings];
  for (const edge of graph.edges) {
    if (edge.kind === "overlaps") warnings.push(`Overlapping shapes: ${edge.from} and ${edge.to}.`);
  }
  if (viewport) {
    for (const node of graph.nodes) {
      if (node.bounds.x < viewport.x || node.bounds.y < viewport.y ||
          node.bounds.x + node.bounds.width > viewport.x + viewport.w ||
          node.bounds.y + node.bounds.height > viewport.y + viewport.h) {
        warnings.push(`${node.id} is outside the active viewport.`);
      }
    }
  }
  const lines = [...graph.nodes]
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
    .slice(0, 24)
    .map((node) => `${node.id}: ${node.kind}${node.text ? ` "${node.text}"` : ""} at ${Math.round(node.bounds.x)},${Math.round(node.bounds.y)}`);
  return {
    boardId: graph.scope.boardId,
    revision: graph.revision,
    objectCount: graph.nodes.length,
    kinds,
    bounds: graph.nodes.length ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null,
    lines,
    warnings: warnings.slice(0, 32),
  };
}

export const canvasSceneReadSchema = z.object({
  boardId: idSchema,
  maxNodes: z.number().int().min(1).max(24).optional(),
  nodeKinds: z.array(z.enum(nodeKinds)).max(4).optional(),
}).strict();

export const canvasEvidenceSearchSchema = z.object({
  boardId: idSchema.optional(),
  lessonId: idSchema.optional(),
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(8).optional(),
}).strict();

export const readCanvasInkSchema = z.object({
  boardId: idSchema,
  groupIds: z.array(idSchema).min(1).max(8),
  profile: z.enum(["auto", "math", "diagram"]).optional(),
}).strict();

export type CanvasInkItem = {
  groupId: string;
  text: string;
  format: "latex" | "text";
  confidence: number | null;
  source: "user" | "recognition" | "ocr";
  confirmed: boolean;
};

export type SceneScope = { boardId: string; courseId: string; lessonId: string; revision?: number };
export type CourseSceneSearchHit = { boardId: string; revisionHash: string; revision: number; node: CanvasSceneNode; edges: CanvasSceneEdge[] };

let cached: { boardId: string; revision: number; graph: CanvasSceneGraph } | null = null;

export async function requestCanvasScene(scope: SceneScope, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<CanvasSceneGraph> {
  if (cached && cached.boardId === scope.boardId && cached.revision === (scope.revision ?? cached.revision)) return cached.graph;
  const response = await fetcher(`/api/canvases/${encodeURIComponent(scope.boardId)}/scene`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId: scope.courseId, lessonId: scope.lessonId, expectedRevision: scope.revision ?? 0 }),
    signal,
  });
  const payload = await response.json() as { scene?: CanvasSceneGraph; error?: string };
  if (!response.ok || !payload.scene) throw new Error(payload.error ?? `Scene build failed with HTTP ${response.status}.`);
  cached = { boardId: scope.boardId, revision: payload.scene.revision, graph: payload.scene };
  return payload.scene;
}

export function boundedSceneSlice(graph: CanvasSceneGraph, options: { maxNodes?: number; nodeKinds?: readonly CanvasSceneNode["kind"][] } = {}) {
  const maxNodes = Math.max(1, Math.min(24, options.maxNodes ?? 24));
  const kinds = options.nodeKinds?.length ? new Set(options.nodeKinds) : null;
  const nodes = graph.nodes.filter((node) => !kinds || kinds.has(node.kind)).slice(0, maxNodes);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).slice(0, 48);
  return {
    schemaVersion: graph.schemaVersion,
    scope: graph.scope,
    revision: graph.revision,
    revisionHash: graph.revisionHash,
    builderVersion: graph.builderVersion,
    nodes,
    edges,
    warnings: graph.warnings,
    truncated: graph.truncated || nodes.length < graph.nodes.length || edges.length < graph.edges.length,
  };
}

export async function requestCanvasInk(
  scope: SceneScope,
  input: { groupIds: string[]; profile?: "auto" | "math" | "diagram" },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ revisionHash: string; items: CanvasInkItem[]; warnings: string[] }> {
  const response = await fetcher(`/api/canvases/${encodeURIComponent(scope.boardId)}/ink`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      courseId: scope.courseId,
      lessonId: scope.lessonId,
      expectedRevision: scope.revision ?? 0,
      groupIds: input.groupIds,
      ...(input.profile ? { profile: input.profile } : {}),
    }),
    signal,
  });
  const payload = await response.json() as { revisionHash?: string; items?: CanvasInkItem[]; warnings?: string[]; error?: string };
  if (!response.ok || !payload.revisionHash) throw new Error(payload.error ?? `Canvas ink read failed with HTTP ${response.status}.`);
  return { revisionHash: payload.revisionHash, items: payload.items ?? [], warnings: payload.warnings ?? [] };
}

export async function searchCanvasEvidence(scope: SceneScope, query: string, limit = 8, fetcher: typeof fetch = fetch) {
  const graph = await requestCanvasScene(scope, fetcher);
  const response = await fetcher(`/api/canvases/${encodeURIComponent(scope.boardId)}/scene/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId: scope.courseId, lessonId: scope.lessonId, revisionHash: graph.revisionHash, query, limit }),
  });
  const payload = await response.json() as { nodes?: CanvasSceneNode[]; edges?: CanvasSceneEdge[]; warnings?: string[]; truncated?: boolean; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Scene search failed with HTTP ${response.status}.`);
  return { revisionHash: graph.revisionHash, nodes: payload.nodes ?? [], edges: payload.edges ?? [], warnings: payload.warnings ?? [], truncated: Boolean(payload.truncated) };
}

/** Search every board in the course that has a scene graph for its current revision. */
export async function searchCourseCanvasEvidence(scope: { courseId: string; lessonId?: string }, query: string, limit = 8, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/courses/${encodeURIComponent(scope.courseId)}/canvas-scene/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId: scope.courseId, ...(scope.lessonId ? { lessonId: scope.lessonId } : {}), query, limit }),
  });
  const payload = await response.json() as { hits?: CourseSceneSearchHit[]; warnings?: string[]; truncated?: boolean; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Course scene search failed with HTTP ${response.status}.`);
  return { courseId: scope.courseId, hits: payload.hits ?? [], warnings: payload.warnings ?? [], truncated: Boolean(payload.truncated) };
}

export function resetCanvasSceneCacheForTests() { cached = null; }

/** Drop the cached scene after teaching or confirming a label so the next read rebuilds it. */
export function invalidateCanvasSceneCache() { cached = null; }

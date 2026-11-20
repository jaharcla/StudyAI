import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { groupQuickdrawStrokes, type StrokeGroup } from "./regions.js";
import { FUSION_SYSTEM_PROMPT, STRUCTURE_SYSTEM_PROMPT } from "./prompts.js";
import type { CanvasInput, CanvasRecord } from "./types.js";

export const MAX_SCENE_EXPERIMENT_REQUESTS = 8;
export const MAX_SCENE_EXPERIMENT_INPUT_BYTES = 240_000;

export function exactBase64ByteLength(value: string) {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Invalid base64 image payload.");
  return Buffer.from(encoded, "base64").byteLength;
}

const EvidenceRefSchema = z.object({ kind: z.enum(["stroke", "source-object", "candidate"]), id: z.string().min(1).max(512) }).strict();
const StatusSchema = z.enum(["proposed", "ambiguous", "unreadable"]);
const ObservationSchema = z.object({ text: z.string().min(1).max(1200), kind: z.enum(["text", "symbol", "number", "equation", "shape", "unknown"]), status: StatusSchema, evidenceRefs: z.array(EvidenceRefSchema).max(500) }).strict();
const RelationSchema = z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), relation: z.string().min(1).max(240), status: z.enum(["proposed", "ambiguous"]), evidenceRefs: z.array(EvidenceRefSchema).max(500) }).strict();
const InterpretationSchema = z.object({ claim: z.string().min(1).max(1200), status: z.enum(["proposed", "ambiguous"]), evidenceRefs: z.array(EvidenceRefSchema).max(500) }).strict();

export const SceneExperimentProposalSchema = z.object({
  observations: z.array(ObservationSchema).max(1000),
  relations: z.array(RelationSchema).max(2000),
  interpretations: z.array(InterpretationSchema).max(1000),
  ambiguities: z.array(z.string().min(1).max(1200)).max(1000),
}).strict().superRefine((proposal, context) => {
  for (const [index, relation] of proposal.relations.entries()) {
    if (relation.from >= proposal.observations.length || relation.to >= proposal.observations.length) context.addIssue({ code: "custom", path: ["relations", index], message: "Relation endpoint does not refer to a returned observation." });
  }
});

export type SceneExperimentProposal = z.infer<typeof SceneExperimentProposalSchema>;
export type SceneEvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type SceneSourceStroke = { id: string; type: "draw" | "highlight"; x: number; y: number; rotation: number; points: number[] };
export type SceneSourceObject = { id: string; type: string; x: number; y: number; rotation: number; bounds?: { x: number; y: number; width: number; height: number }; boundsBasis?: "normalized-layout"; geometry?: { kind: string; start?: { x: number; y: number }; end?: { x: number; y: number }; bend?: number } };
export type SceneSourcePayload = { strokes: SceneSourceStroke[]; objects: SceneSourceObject[]; rejectedStrokeIds: string[] };
export type SceneStrokeCandidate = { id: string; sourceIds: string[]; worldBounds: StrokeGroup["worldBounds"]; features: { strokeCount: number; pointCount: number; totalPathLength: number; aspectRatio: number; strokes: Array<{ sourceId: string; pointCount: number; pathLength: number; turnCount: number; orientation: "horizontal" | "vertical" | "diagonal" | "point"; start?: { x: number; y: number }; end?: { x: number; y: number } }> } };

export type SceneConditionPayload = {
  schemaVersion: 1;
  task: string;
  requiredOutputShape: {
    observations: Array<{ text: string; kind: string; status: string; evidenceRefs: Array<{ kind: string; id: string }> }>;
    relations: Array<{ from: number; to: number; relation: string; status: string; evidenceRefs: Array<{ kind: string; id: string }> }>;
    interpretations: Array<{ claim: string; status: string; evidenceRefs: Array<{ kind: string; id: string }> }>;
    ambiguities: string[];
  };
  image: { width: number; height: number; mimeType: "image/png" };
  sourceEvidence: SceneSourcePayload | null;
  geometryCandidates: SceneStrokeCandidate[] | null;
};

export function allowedEvidenceForCondition(condition: "B" | "C" | "D", source: SceneSourcePayload, candidates: readonly SceneStrokeCandidate[]) {
  return {
    strokeIds: condition === "B" ? new Set<string>() : new Set(source.strokes.map((stroke) => stroke.id)),
    sourceObjectIds: condition === "B" ? new Set<string>() : new Set(source.objects.map((object) => object.id)),
    candidateIds: condition === "D" ? new Set(candidates.map((candidate) => candidate.id)) : new Set<string>(),
  };
}

export function buildSceneSourcePayload(input: CanvasInput): SceneSourcePayload {
  const strokes: SceneSourceStroke[] = [], objects: SceneSourceObject[] = [], rejectedStrokeIds: string[] = [];
  for (const record of input.nativeRecords) {
    const raw = asRecord(record.raw), props = asRecord(raw.props), x = number(raw.x), y = number(raw.y), rotation = number(raw.rot) ?? 0;
    if (x === undefined || y === undefined || !Number.isFinite(rotation)) {
      if (record.type === "draw" || record.type === "highlight") rejectedStrokeIds.push(record.id);
      continue;
    }
    if (record.type === "draw" || record.type === "highlight") {
      const points = props.pts;
      if (!Array.isArray(points) || points.length < 3 || points.length % 3 !== 0 || !points.every((value) => typeof value === "number" && Number.isFinite(value))) {
        rejectedStrokeIds.push(record.id);
        continue;
      }
      strokes.push({ id: record.id, type: record.type, x, y, rotation, points: [...points] as number[] });
      continue;
    }
    const geometry = safeShapeGeometry(record);
    objects.push({
      id: record.id,
      type: record.type,
      x,
      y,
      rotation,
      ...(record.bounds ? { bounds: record.bounds, ...(record.type === "text" || record.type === "note" ? { boundsBasis: "normalized-layout" as const } : {}) } : {}),
      ...(geometry ? { geometry } : {}),
    });
  }
  return { strokes, objects, rejectedStrokeIds: rejectedStrokeIds.sort() };
}

export function buildStrokeCandidates(input: CanvasInput): SceneStrokeCandidate[] {
  const byId = new Map(input.nativeRecords.map((record) => [record.id, record]));
  return groupQuickdrawStrokes(input).map((group, index) => {
    const strokes = group.sourceIds.flatMap((sourceId) => {
      const record = byId.get(sourceId);
      if (!record) return [];
      const points = strokeWorldPoints(record), lengths = segmentLengths(points), pathLength = lengths.reduce((sum, value) => sum + value, 0);
      const start = points[0], end = points.at(-1);
      return [{ sourceId, pointCount: points.length, pathLength: round(pathLength), turnCount: countTurns(points), orientation: orientation(group.worldBounds.width, group.worldBounds.height), ...(start ? { start } : {}), ...(end ? { end } : {}) }];
    });
    const pointCount = strokes.reduce((sum, stroke) => sum + stroke.pointCount, 0);
    const totalPathLength = round(strokes.reduce((sum, stroke) => sum + stroke.pathLength, 0));
    const longer = Math.max(group.worldBounds.width, group.worldBounds.height), shorter = Math.max(1, Math.min(group.worldBounds.width, group.worldBounds.height));
    return {
      id: `candidate-${String(index + 1).padStart(3, "0")}`,
      sourceIds: [...group.sourceIds],
      worldBounds: group.worldBounds,
      features: { strokeCount: group.sourceIds.length, pointCount, totalPathLength, aspectRatio: round(longer / shorter), strokes },
    };
  });
}

export function buildSceneConditionPayload(condition: "B" | "C" | "D", input: CanvasInput, image: { width: number; height: number }): SceneConditionPayload {
  const sourceEvidence = condition === "B" ? null : buildSceneSourcePayload(input);
  if (sourceEvidence?.rejectedStrokeIds.length) throw new Error(`Original source stroke payload is incomplete: ${sourceEvidence.rejectedStrokeIds.join(", ")}`);
  return {
    schemaVersion: 1,
    task: "Examine the freehand molecular sketch in the full canvas. Transcribe its visible handwritten labels and connecting marks, then propose atom-to-bond relationships only when supported by the image and supplied source evidence. Derive a molecular formula only if the observed connectivity supports it; state it conditionally when a connection is ambiguous. Separate visible observations from scientific interpretations. If a line does not clearly join labels, state the competing possibilities instead of guessing. Do not use another structured or typed object as evidence for the freehand sketch. Evidence references must use only supplied IDs. All claims are hypotheses, not confirmed facts.",
    requiredOutputShape: {
      observations: [{ text: "", kind: "text|symbol|number|equation|shape|unknown", status: "proposed|ambiguous|unreadable", evidenceRefs: [{ kind: "stroke|source-object|candidate", id: "" }] }],
      relations: [{ from: 0, to: 1, relation: "", status: "proposed|ambiguous", evidenceRefs: [] }],
      interpretations: [{ claim: "", status: "proposed|ambiguous", evidenceRefs: [] }],
      ambiguities: [""],
    },
    image: { width: image.width, height: image.height, mimeType: "image/png" },
    sourceEvidence,
    geometryCandidates: condition === "D" ? buildStrokeCandidates(input) : null,
  };
}

export function validateSceneProposal(value: unknown, allowedStrokeIds: ReadonlySet<string>, allowedSourceObjectIds: ReadonlySet<string>, allowedCandidateIds: ReadonlySet<string>) {
  const proposal = SceneExperimentProposalSchema.parse(value);
  const rejectedReferences: SceneEvidenceRef[] = [];
  const cleanRef = (reference: SceneEvidenceRef) => {
    const accepted = reference.kind === "stroke" ? allowedStrokeIds.has(reference.id)
      : reference.kind === "candidate" ? allowedCandidateIds.has(reference.id)
      : allowedSourceObjectIds.has(reference.id);
    if (!accepted) { rejectedReferences.push(reference); return undefined; }
    return reference;
  };
  const cleaned: SceneExperimentProposal = {
    observations: proposal.observations.map((item) => ({ ...item, evidenceRefs: item.evidenceRefs.flatMap((ref) => cleanRef(ref) ?? []) })),
    relations: proposal.relations.map((item) => ({ ...item, evidenceRefs: item.evidenceRefs.flatMap((ref) => cleanRef(ref) ?? []) })),
    interpretations: proposal.interpretations.map((item) => ({ ...item, evidenceRefs: item.evidenceRefs.flatMap((ref) => cleanRef(ref) ?? []) })),
    ambiguities: [...proposal.ambiguities],
  };
  return { proposal: cleaned, rejectedReferences };
}

export function expandEvidenceReferences(references: readonly SceneEvidenceRef[], strokeIds: ReadonlySet<string>, sourceObjectIds: ReadonlySet<string>, candidates: ReadonlyMap<string, readonly string[]>) {
  const resolved = new Set<string>(), sourceObjects = new Set<string>(), rejected: SceneEvidenceRef[] = [];
  for (const ref of references) {
    if (ref.kind === "candidate") {
      const members = candidates.get(ref.id);
      if (!members) { rejected.push(ref); continue; }
      for (const id of members) if (strokeIds.has(id)) resolved.add(id); else rejected.push({ kind: "stroke", id });
    } else if (ref.kind === "stroke" && strokeIds.has(ref.id)) resolved.add(ref.id);
    else if (ref.kind === "source-object" && sourceObjectIds.has(ref.id)) sourceObjects.add(ref.id);
    else rejected.push(ref);
  }
  return { sourceStrokeIds: [...resolved].sort(), sourceObjectIds: [...sourceObjects].sort(), rejectedReferences: rejected };
}

export type GoldStrokeObject = { id: string; sourceIds: readonly string[] };
export type CandidateStrokeGroup = { id: string; sourceIds: readonly string[] };

export function scoreStrokeGroups(candidates: readonly CandidateStrokeGroup[], gold: readonly GoldStrokeObject[], knownSourceIds: ReadonlySet<string>) {
  const allCandidateIds = candidates.flatMap((candidate) => candidate.sourceIds);
  const validReferenceCount = allCandidateIds.filter((id) => knownSourceIds.has(id)).length;
  const invalidSourceReferenceCount = allCandidateIds.length - validReferenceCount;
  const goldSets = gold.map((item) => new Set(item.sourceIds));
  let falseMergeCount = 0, exactGroupMatchCount = 0, candidatePurityTotal = 0;
  for (const candidate of candidates) {
    const ids = new Set(candidate.sourceIds), memberships = goldSets.map((set) => [...ids].filter((id) => set.has(id)).length);
    if (memberships.filter((count) => count > 0).length > 1) falseMergeCount++;
    const best = Math.max(0, ...memberships);
    candidatePurityTotal += candidate.sourceIds.length ? best / candidate.sourceIds.length : 0;
    if (goldSets.some((set) => set.size === ids.size && [...set].every((id) => ids.has(id)))) exactGroupMatchCount++;
  }
  let completeObjectCount = 0, splitObjectCount = 0;
  for (const set of goldSets) {
    const overlaps = candidates.map((candidate) => candidate.sourceIds.filter((id) => set.has(id)).length).filter(Boolean);
    if (candidates.some((candidate) => [...set].every((id) => candidate.sourceIds.includes(id)))) completeObjectCount++;
    else if (overlaps.length > 1) splitObjectCount++;
  }
  return {
    goldObjectCount: gold.length,
    candidateCount: candidates.length,
    completeObjectCount,
    completeObjectRecall: gold.length ? completeObjectCount / gold.length : null,
    meanCandidatePurity: candidates.length ? candidatePurityTotal / candidates.length : null,
    falseMergeCount,
    splitObjectCount,
    exactGroupMatchCount,
    sourceReferenceCount: allCandidateIds.length,
    validSourceReferenceCount: validReferenceCount,
    invalidSourceReferenceCount,
    sourceIdResolutionPrecision: allCandidateIds.length ? validReferenceCount / allCandidateIds.length : null,
  };
}

export function createSceneRequestBudget(limit = MAX_SCENE_EXPERIMENT_REQUESTS, fetchImpl: typeof fetch = fetch) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCENE_EXPERIMENT_REQUESTS) throw new Error(`Scene experiment request limit must be between 1 and ${MAX_SCENE_EXPERIMENT_REQUESTS}.`);
  let attempts = 0;
  const records: Array<{ condition: string; stage: string; model: string | null; requestBytes: number; imageCount?: number; imageBytes?: number; temperature?: number; maxCompletionTokens?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; responseBytes?: number; latencyMs: number; status?: number; finishReason?: string; rawModelContent?: string; error?: string }> = [];
  const fetcherFor = (condition: string): typeof fetch => (async (input, init) => {
    if (attempts >= limit) throw new Error(`Scene experiment request budget of ${limit} would be exceeded.`);
    attempts++;
    const requestText = typeof init?.body === "string" ? init.body : "";
    let model: string | null = null;
    let stage = "unknown";
    let imageCount = 0, imageBytes = 0;
    let temperature: number | undefined, maxCompletionTokens: number | undefined;
    try {
      const body = JSON.parse(requestText) as { model?: unknown; temperature?: unknown; max_completion_tokens?: unknown; messages?: Array<{ role?: unknown; content?: unknown }> };
      model = typeof body.model === "string" ? body.model : null;
      const user = body.messages?.find((message) => message.role === "user")?.content;
      const system = body.messages?.find((message) => message.role === "system")?.content;
      const images = Array.isArray(user) ? user.filter((part) => asRecord(part).type === "image_url") : [];
      imageCount = images.length;
        imageBytes = images.reduce((sum, part) => {
        const imageUrl = asRecord(asRecord(part).image_url).url;
        return sum + (typeof imageUrl === "string" && imageUrl.includes(",") ? exactBase64ByteLength(imageUrl) : 0);
      }, 0);
      temperature = typeof body.temperature === "number" ? body.temperature : undefined;
      maxCompletionTokens = typeof body.max_completion_tokens === "number" ? body.max_completion_tokens : undefined;
      stage = condition !== "A" ? "whole-scene" : images.length ? "ocr" : system === STRUCTURE_SYSTEM_PROMPT ? "structure" : system === FUSION_SYSTEM_PROMPT ? "fusion" : "inference";
    } catch { /* unparseable body: keep the defaults above */ }
    const record: (typeof records)[number] = { condition, stage, model, requestBytes: Buffer.byteLength(requestText), imageCount, imageBytes, temperature, maxCompletionTokens, latencyMs: 0 };
    const started = performance.now();
    try {
      const response = await fetchImpl(input, init);
      record.status = response.status;
      try {
        const clone = response.clone(), responseBytes = await clone.arrayBuffer();
        record.responseBytes = responseBytes.byteLength;
        const payload = JSON.parse(new TextDecoder().decode(responseBytes)) as { usage?: Record<string, unknown>; choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> };
        const choice = payload.choices?.[0];
        if (typeof choice?.finish_reason === "string") record.finishReason = choice.finish_reason;
        if (typeof choice?.message?.content === "string") record.rawModelContent = choice.message.content;
        const usage = payload.usage ?? {};
        if (typeof usage.prompt_tokens === "number") record.promptTokens = usage.prompt_tokens;
        if (typeof usage.completion_tokens === "number") record.completionTokens = usage.completion_tokens;
        if (typeof usage.total_tokens === "number") record.totalTokens = usage.total_tokens;
      } catch { /* usage is optional and the original response remains unread */ }
      record.latencyMs = performance.now() - started;
      records.push(record);
      return response;
    } catch (error) {
      record.latencyMs = performance.now() - started;
      record.error = error instanceof Error ? error.message : String(error);
      records.push(record);
      throw error;
    }
  }) as typeof fetch;
  return { get attempts() { return attempts; }, records, fetcherFor };
}

function safeShapeGeometry(record: CanvasRecord): SceneSourceObject["geometry"] {
  const geometry = asRecord(record.geometry), start = asRecord(geometry.start), end = asRecord(geometry.end);
  const point = (value: Record<string, unknown>) => typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y) ? { x: value.x, y: value.y } : undefined;
  const kind = typeof geometry.kind === "string" ? geometry.kind : undefined;
  if (!kind) return undefined;
  const a = point(start), b = point(end), bend = number(geometry.bend);
  return { kind, ...(a ? { start: a } : {}), ...(b ? { end: b } : {}), ...(bend !== undefined ? { bend } : {}) };
}

function strokeWorldPoints(record: CanvasRecord) {
  const geometry = asRecord(record.geometry), points = geometry.kind === "stroke" && Array.isArray(geometry.points) ? geometry.points : [];
  return points.flatMap((value) => {
    const point = asRecord(value), x = number(point.x), y = number(point.y);
    return x === undefined || y === undefined ? [] : [{ x, y }];
  });
}

function segmentLengths(points: readonly { x: number; y: number }[]) {
  return points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
}

function countTurns(points: readonly { x: number; y: number }[]) {
  let turns = 0;
  for (let index = 2; index < points.length; index++) {
    const a = points[index - 2], b = points[index - 1], c = points[index], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (denominator && (ux * vx + uy * vy) / denominator < 0.8) turns++;
  }
  return turns;
}

function orientation(width: number, height: number): SceneStrokeCandidate["features"]["strokes"][number]["orientation"] {
  if (!width && !height) return "point";
  return width > height * 1.5 ? "horizontal" : height > width * 1.5 ? "vertical" : "diagonal";
}

function round(value: number) { return Number(value.toFixed(3)); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }

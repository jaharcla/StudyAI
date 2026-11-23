import type { CanvasInput } from "../types.js";
import type { CanvasRecognitionStage } from "../recognition/types.js";
import { normalizeRecognitionLabel, type CanvasRecognitionFeedback } from "../recognition/feedback.js";
import { normalizeInkText } from "./ink.js";
import { groupQuickdrawStrokes } from "../regions.js";
import { createCanvasSpatialIndex } from "../../../src/canvas/spatial/index.js";
import { sceneEdgeId, shortHash } from "../../../src/canvas/spatial/identity.js";
import {
  CANVAS_SCENE_MAX_EDGES,
  CANVAS_SCENE_MAX_NODES,
  CanvasSceneGraphSchema,
  type CanvasSceneBounds,
  type CanvasSceneEdge,
  type CanvasSceneGraph,
  type CanvasSceneNode,
  type CanvasScenePoint,
} from "../../../src/canvas/spatial/types.js";

const BUILDER_VERSION = "scene-v1";

export type CanvasAnalysisLike = {
  observedEvidence?: { items?: Array<Record<string, unknown>> };
  inferredInterpretations?: { evidence?: Array<Record<string, unknown>> };
};

function boundsOf(record: CanvasInput["nativeRecords"][number]): CanvasSceneBounds | null {
  return record.bounds ? { x: record.bounds.x, y: record.bounds.y, width: record.bounds.width, height: record.bounds.height } : null;
}

function pointsOf(record: CanvasInput["nativeRecords"][number]): CanvasScenePoint[] {
  const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
  const values = Array.isArray(geometry.points) ? geometry.points : [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const point = value as Record<string, unknown>;
    if (typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) return [];
    const pressure = typeof point.pressure === "number" && Number.isFinite(point.pressure) && point.pressure >= 0 && point.pressure <= 1 ? point.pressure : null;
    return [{ x: point.x, y: point.y, pressure }];
  });
}

function features(points: readonly CanvasScenePoint[], bounds: CanvasSceneBounds) {
  if (!points.length) return { centroid: null, orientation: null, pathLength: 0, pointCount: 0, aspect: 0 };
  let pathLength = 0;
  for (let index = 1; index < points.length; index++) pathLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const aspect = Math.max(bounds.width, bounds.height) / Math.max(Math.min(bounds.width, bounds.height), 1e-9);
  return { centroid: { x: cx, y: cy }, orientation: 0, pathLength, pointCount: points.length, aspect };
}

function scientificFacts(object: CanvasInput["scientificObjects"][number]): string[] {
  const facts: string[] = [];
  const numbers = (value: unknown): number[] | null => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value as number[] : null;
  const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
  const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
  if (object.kind === "vector" || object.kind === "force") {
    const components = numbers(object.components);
    if (components) facts.push(`components [${components.join(", ")}]`);
  } else if (object.kind === "measurement") {
    const value = number(object.value);
    if (value !== null) facts.push(`value ${value}`);
  } else if (object.kind === "equation") {
    const expression = text(object.expression);
    if (expression) facts.push(`expression ${expression}`);
    const result = number(object.result);
    if (result !== null) facts.push(`result ${result}`);
  } else if (object.kind === "atom") {
    const element = text(object.element);
    if (element) facts.push(`element ${element}`);
    const electrons = number(object.nonbondingElectrons);
    if (electrons !== null) facts.push(`nonbonding electrons ${electrons}`);
    const bondOrderSum = number(object.bondOrderSum);
    if (bondOrderSum !== null) facts.push(`bond order sum ${bondOrderSum}`);
  } else if (object.kind === "bond") {
    const order = number(object.order);
    if (order !== null) facts.push(`bond order ${order}`);
  } else if (object.kind === "graph") {
    const expression = text(object.expression);
    if (expression) facts.push(`expression ${expression}`);
    const range = numbers(object.xRange);
    if (range?.length === 2) facts.push(`x range ${range[0]} to ${range[1]}`);
  } else if (object.kind === "anatomy") {
    const system = text(object.system);
    if (system) facts.push(`system ${system}`);
    const labels = Array.isArray(object.labels) ? object.labels.filter((label): label is string => typeof label === "string" && Boolean(label.trim())) : [];
    if (labels.length) facts.push(`labels ${labels.join(", ")}`);
  }
  const units = text(object.units);
  if (units) facts.push(`units ${units}`);
  return facts;
}

function summaryOf(object: CanvasInput["scientificObjects"][number]): string | null {
  const values: string[] = [];
  for (const key of ["label", "name", "title", "definition", "prompt", "front", "back", "excerpt"]) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  }
  values.push(...scientificFacts(object));
  if (object.kind === "mindmap" && Array.isArray(object.nodes)) values.push(...object.nodes.map((node) => node.label));
  return values.length ? values.join(" — ").slice(0, 2000) : null;
}

function addEdge(edges: CanvasSceneEdge[], edge: Omit<CanvasSceneEdge, "id">) {
  const id = sceneEdgeId(edge.from, edge.kind, edge.to, edge.basis);
  if (edges.some((item) => item.id === id)) return;
  edges.push({ ...edge, id });
}

function gap(a: CanvasSceneBounds, b: CanvasSceneBounds) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

export function buildCanvasSceneGraph(input: {
  input: CanvasInput;
  scope: { boardId: string; courseId: string; lessonId: string };
  revision: number;
  revisionHash: string;
  snapshotHash: string;
  builtAt?: string;
  recognition?: CanvasRecognitionStage | null;
  analysis?: CanvasAnalysisLike | null;
  feedback?: ReadonlyMap<string, CanvasRecognitionFeedback> | null;
}): CanvasSceneGraph {
  const nodes = new Map<string, CanvasSceneNode>();
  const edges: CanvasSceneEdge[] = [];
  const warnings: string[] = [];
  const sourceNodes: CanvasSceneNode[] = [];
  const groupNodeByKey = new Map<string, string>();

  for (const record of input.input.nativeRecords) {
    const bounds = boundsOf(record);
    if (!bounds) { warnings.push(`Record ${record.id} has no usable bounds and was omitted.`); continue; }
    const isStroke = record.type === "draw" || record.type === "highlight";
    const points = isStroke ? pointsOf(record) : [];
    const node: CanvasSceneNode = {
      id: `q:${record.id}`,
      kind: isStroke ? "stroke" : "native-object",
      ref: { scope: "quickdraw", id: record.id },
      bounds,
      boundsBasis: "source",
      text: isStroke ? null : (record.text ?? null),
      recordType: record.type.slice(0, 64),
      origin: "quickdraw",
      verificationStatus: "source",
      confidence: 1,
      sourceRefs: [],
      geometry: isStroke ? features(points, bounds) : null,
      uncertaintyReasons: [],
    };
    nodes.set(node.id, node);
    sourceNodes.push(node);
  }

  for (const object of input.input.scientificObjects) {
    if (![object.x, object.y, object.width, object.height].every(Number.isFinite) || object.width < 0 || object.height < 0) continue;
    const node: CanvasSceneNode = {
      id: `s:${object.id}`,
      kind: "scientific-object",
      ref: { scope: "science", id: object.id },
      bounds: { x: object.x, y: object.y, width: object.width, height: object.height },
      boundsBasis: "source",
      text: summaryOf(object),
      recordType: String(object.kind).slice(0, 64),
      origin: "science",
      verificationStatus: "source",
      confidence: 1,
      sourceRefs: [],
      geometry: null,
      uncertaintyReasons: [],
    };
    nodes.set(node.id, node);
    sourceNodes.push(node);
  }

  const groups = groupQuickdrawStrokes(input.input);
  for (const group of groups) {
    const nodeId = `g:${shortHash(group.sourceIds.slice().sort().join("|"))}`;
    const bounds = { x: group.worldBounds.x, y: group.worldBounds.y, width: group.worldBounds.width, height: group.worldBounds.height };
    const allRefs = group.sourceIds.filter((id) => nodes.has(`q:${id}`)).map((id) => ({ scope: "quickdraw" as const, id }));
    const refs = allRefs.slice(0, 64);
    if (!refs.length) continue;
    nodes.set(nodeId, {
      id: nodeId,
      kind: "stroke-group",
      ref: { scope: "scene", id: nodeId },
      bounds,
      boundsBasis: "source-union",
      text: null,
      recordType: "stroke-group",
      origin: "geometry",
      verificationStatus: "derived",
      confidence: 1,
      sourceRefs: refs,
      geometry: null,
      uncertaintyReasons: group.sourceIds.length > 64 ? ["Source reference list truncated to 64 IDs."] : [],
    });
    groupNodeByKey.set(group.sourceIds.slice().sort().join("|"), nodeId);
    for (const ref of allRefs) addEdge(edges, { kind: "contains", from: nodeId, to: `q:${ref.id}`, origin: "geometry", verificationStatus: "derived", basis: "bounds", distance: null, confidence: 1, sourceRefs: [ref], uncertaintyReasons: [] });
  }

  const index = createCanvasSpatialIndex();
  for (const node of sourceNodes) index.insert(node);
  const overlapCount = new Map<string, number>(), nearCount = new Map<string, number>(), directionCount = new Map<string, number>();
  for (const node of sourceNodes) {
    const candidates = index.query(node.bounds).filter((other) => other.id !== node.id).slice(0, 24);
    const overlaps = candidates.filter((other) => gap(node.bounds, other.bounds) === 0).slice(0, 8);
    for (const other of overlaps) {
      openedEdge(edges, overlapCount, node.id, other.id, "overlaps", null, 8);
    }
    const nearest = candidates.map((other) => ({ other, distance: gap(node.bounds, other.bounds) })).sort((a, b) => a.distance - b.distance || a.other.id.localeCompare(b.other.id)).slice(0, 3);
    for (const { other, distance } of nearest) {
      if (distance > 96) continue;
      openedEdge(edges, nearCount, node.id, other.id, "near", distance, 3);
      const ca = { x: node.bounds.x + node.bounds.width / 2, y: node.bounds.y + node.bounds.height / 2 };
      const cb = { x: other.bounds.x + other.bounds.width / 2, y: other.bounds.y + other.bounds.height / 2 };
      const dx = cb.x - ca.x, dy = cb.y - ca.y;
      const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right-of" : "left-of") : (dy > 0 ? "below" : "above");
      openedEdge(edges, directionCount, node.id, other.id, direction, distance, 3);
    }
  }

  for (const object of input.input.scientificObjects) {
    if (object.kind !== "relationship") continue;
    const fromId = typeof object.fromId === "string" ? object.fromId : "";
    const toId = typeof object.toId === "string" ? object.toId : "";
    if (!nodes.has(`s:${fromId}`) || !nodes.has(`s:${toId}`)) { warnings.push(`Relationship ${object.id} references an unavailable scientific object.`); continue; }
    addEdge(edges, {
      kind: "relation",
      from: `s:${fromId}`,
      to: `s:${toId}`,
      origin: "science",
      verificationStatus: "derived",
      basis: "explicit",
      distance: null,
      confidence: 1,
      sourceRefs: [{ scope: "science", id: String(object.id) }],
      uncertaintyReasons: [],
    });
  }

  const confirmedGroups = new Set<string>();
  const addConfirmedCandidate = (groupNode: string, label: string, sourceRefs: CanvasSceneNode["sourceRefs"]) => {
    const group = nodes.get(groupNode);
    if (!group || confirmedGroups.has(groupNode)) return;
    confirmedGroups.add(groupNode);
    const id = `u:${shortHash(`${groupNode}|${label}`)}`;
    nodes.set(id, {
      id,
      kind: "recognition-candidate",
      ref: { scope: "scene", id },
      bounds: group.bounds,
      boundsBasis: "derived",
      text: label.slice(0, 2000),
      recordType: "user-label",
      origin: "user",
      verificationStatus: "confirmed",
      confidence: null,
      sourceRefs: group.sourceRefs.slice(0, 64),
      geometry: null,
      uncertaintyReasons: [],
    });
    addEdge(edges, {
      kind: "recognizes",
      from: id,
      to: groupNode,
      origin: "user",
      verificationStatus: "confirmed",
      basis: "recognition",
      distance: null,
      confidence: null,
      sourceRefs: sourceRefs.slice(0, 64),
      uncertaintyReasons: [],
    });
  };

  if (input.recognition) {
    const stage = input.recognition;
    for (const result of stage.results) {
      const groupKey = result.sourceIds.slice().sort().join("|");
      const groupNode = groupNodeByKey.get(groupKey);
      if (!groupNode) continue;
      const group = nodes.get(groupNode);
      if (!group) continue;
      const feedback = input.feedback?.get(groupKey);
      if (feedback?.decision === "reject" && !feedback.label) continue;
      if ((feedback?.decision === "correct" || feedback?.decision === "reject") && feedback.label) {
        addConfirmedCandidate(groupNode, feedback.label, group.sourceRefs);
        continue;
      }
      const acceptedLabel = feedback?.decision === "accept" ? normalizeRecognitionLabel(feedback.label) : "";
      let matched = false;
      result.candidates.forEach((candidate, rank) => {
        const accepted = Boolean(acceptedLabel) && normalizeRecognitionLabel(candidate.label) === acceptedLabel;
        if (accepted) { matched = true; confirmedGroups.add(groupNode); }
        const id = `c:${groupNode}:${stage.adapterId}:${rank}`;
        nodes.set(id, {
          id,
          kind: "recognition-candidate",
          ref: { scope: "scene", id },
          bounds: group.bounds,
          boundsBasis: "derived",
          text: candidate.label.slice(0, 2000),
          recordType: candidate.kind,
          origin: accepted ? "user" : stage.mode === "baseline" ? "geometry" : "model",
          verificationStatus: accepted ? "confirmed" : "unconfirmed",
          confidence: candidate.confidence,
          sourceRefs: group.sourceRefs,
          geometry: null,
          uncertaintyReasons: accepted ? [] : [...result.uncertaintyReasons, "Recognition candidate; not user-confirmed."].slice(0, 16),
        });
        addEdge(edges, {
          kind: "recognizes",
          from: id,
          to: groupNode,
          origin: accepted ? "user" : stage.mode === "baseline" ? "geometry" : "model",
          verificationStatus: accepted ? "confirmed" : "unconfirmed",
          basis: "recognition",
          distance: null,
          confidence: candidate.confidence,
          sourceRefs: group.sourceRefs,
          uncertaintyReasons: [],
        });
      });
      if (acceptedLabel && !matched) addConfirmedCandidate(groupNode, feedback!.label!, group.sourceRefs);
    }
  }

  for (const feedback of input.feedback?.values() ?? []) {
    if (!feedback.label) continue;
    const groupNode = groupNodeByKey.get(feedback.sourceIds.slice().sort().join("|"));
    if (!groupNode) continue;
    const group = nodes.get(groupNode);
    if (group) addConfirmedCandidate(groupNode, feedback.label, group.sourceRefs);
  }

  if (input.analysis) {
    const analysis = input.analysis;
    const addEvidenceNode = (item: Record<string, unknown>, kind: "ocr-item" | "model-observation", origin: "ocr" | "model") => {
      const idValue = typeof item.id === "string" ? item.id : "";
      if (!idValue) return;
      const world = item.worldRegion && typeof item.worldRegion === "object" ? item.worldRegion as Record<string, unknown> : null;
      const region = item.sourceRegion && typeof item.sourceRegion === "object" ? (item.sourceRegion as Record<string, unknown>).worldBounds as Record<string, unknown> | undefined : undefined;
      const bounds = world ?? region;
      if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every((value) => typeof value === "number" && Number.isFinite(value))) return;
      const refs = Array.isArray(item.sourceRefs) ? item.sourceRefs.flatMap((ref) => {
        if (!ref || typeof ref !== "object") return [];
        const value = ref as Record<string, unknown>;
        return (value.scope === "quickdraw" || value.scope === "science") && typeof value.id === "string" ? [{ scope: value.scope as "quickdraw" | "science", id: value.id }] : [];
      }).slice(0, 64) : [];
      const nodeId = `${origin === "ocr" ? "o" : "m"}:${idValue}`;
      nodes.set(nodeId, {
        id: nodeId,
        kind,
        ref: { scope: "scene", id: nodeId },
        bounds: { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) },
        boundsBasis: "region",
        text: typeof item.text === "string" ? normalizeInkText(item.text) || null : null,
        recordType: typeof item.kind === "string" ? item.kind.slice(0, 64) : kind,
        origin,
        verificationStatus: "unconfirmed",
        confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence) ? Math.max(0, Math.min(1, item.confidence)) : null,
        sourceRefs: refs,
        geometry: null,
        uncertaintyReasons: Array.isArray(item.uncertaintyReasons) ? item.uncertaintyReasons.filter((reason): reason is string => typeof reason === "string").slice(0, 16) : [],
      });
      for (const ref of refs) {
        const target = `${ref.scope === "quickdraw" ? "q" : "s"}:${ref.id}`;
        if (nodes.has(target)) addEdge(edges, { kind: "derived-from", from: nodeId, to: target, origin, verificationStatus: "unconfirmed", basis: origin === "ocr" ? "ocr-region" : "model", distance: null, confidence: null, sourceRefs: [ref], uncertaintyReasons: [] });
      }
      const association = item.association && typeof item.association === "object" ? item.association as Record<string, unknown> : null;
      if (association && Array.isArray(association.candidateRefs)) for (const ref of association.candidateRefs) {
        if (!ref || typeof ref !== "object") continue;
        const value = ref as Record<string, unknown>;
        if ((value.scope !== "quickdraw" && value.scope !== "science") || typeof value.id !== "string") continue;
        const target = `${value.scope === "quickdraw" ? "q" : "s"}:${value.id}`;
        if (nodes.has(target)) addEdge(edges, { kind: "labels", from: nodeId, to: target, origin: "ocr", verificationStatus: "unconfirmed", basis: "ocr-region", distance: null, confidence: null, sourceRefs: [{ scope: value.scope as "quickdraw" | "science", id: value.id }], uncertaintyReasons: ["OCR association is unconfirmed."] });
      }
    };
    for (const item of analysis.observedEvidence?.items ?? []) if (item.origin === "ocr") addEvidenceNode(item, "ocr-item", "ocr");
    for (const item of analysis.inferredInterpretations?.evidence ?? []) if (item.origin === "model") addEvidenceNode(item, "model-observation", "model");
  }

  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, CANVAS_SCENE_MAX_NODES);
  const kept = new Set(sortedNodes.map((node) => node.id));
  const sortedEdges = edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, CANVAS_SCENE_MAX_EDGES);
  if (sortedNodes.length < nodes.size) warnings.push(`Scene node limit ${CANVAS_SCENE_MAX_NODES} reached; nodes were truncated.`);
  if (sortedEdges.length < edges.length) warnings.push(`Scene edge limit ${CANVAS_SCENE_MAX_EDGES} reached; edges were truncated.`);

  return CanvasSceneGraphSchema.parse({
    schemaVersion: 1,
    scope: input.scope,
    revision: input.revision,
    revisionHash: input.revisionHash,
    snapshotHash: input.snapshotHash,
    builderVersion: BUILDER_VERSION,
    builtAt: input.builtAt ?? new Date().toISOString(),
    nodes: sortedNodes,
    edges: sortedEdges,
    warnings: [...new Set(warnings)].slice(0, 64),
    truncated: sortedNodes.length < nodes.size || sortedEdges.length < edges.length,
  });
}

function openedEdge(edges: CanvasSceneEdge[], counts: Map<string, number>, a: string, b: string, kind: CanvasSceneEdge["kind"], distance: number | null, cap: number) {
  const [from, to] = a < b ? [a, b] : [b, a];
  const key = `${from}|${kind}`;
  if ((counts.get(key) ?? 0) >= cap) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  addEdge(edges, { kind, from, to, origin: "geometry", verificationStatus: "derived", basis: "bounds", distance, confidence: 1, sourceRefs: [], uncertaintyReasons: [] });
}

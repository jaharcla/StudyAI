import { createHash } from "node:crypto";
import { z } from "zod";
import { canvasFixtureSchema, pipelineResultSchema } from "../../src/canvas/research.js";
import { CanvasEvidenceBundleSchema, CanvasEvidenceSchema, EvidenceConflictSchema, SelectedCanvasContextSchema } from "../canvas-intelligence/evidence.js";
import { normalizeCanvasInput } from "../canvas-intelligence/input.js";
import { FusionResultSchema, StructureRelationshipSchema, StructureResultSchema, type CanvasInput } from "../canvas-intelligence/types.js";
import type { ObjectAnchor } from "../../src/canvas/scene.js";

const identifier = z.string().min(1).max(512);
const references = z.array(identifier).min(1).max(5000);
const confidence = z.number().finite().min(0).max(1);

export const AuthoritativeCanvasRevisionSchema = canvasFixtureSchema.shape.source.extend({ boardId: identifier, courseId: identifier, lessonId: identifier, document: z.unknown() }).omit({ snapshotHash: true });

export const CanvasAnalysisProvenanceSchema = z.object({
  id: identifier,
  stage: z.enum(["canvas", "geometry", "ocr", "structure", "fusion", "validation"]),
  provider: z.enum(["quickdraw", "local", "groq", "system"]),
  method: identifier,
  model: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
}).strict();

export const CanvasAnalysisEvidenceSchema = CanvasEvidenceSchema.extend({ provenanceIds: references }).strict();
export type CanvasSourceObjectRef = Pick<ObjectAnchor, "scope" | "id">;
export const CanvasSourceObjectRefSchema: z.ZodType<CanvasSourceObjectRef> = z.object({ scope: z.enum(["quickdraw", "science"]), id: identifier }).strict();

export const CanvasInferredInterpretationSchema = z.object({
  interpretationId: identifier,
  statement: z.string().min(1).max(12000),
  sourceObjectIds: references,
  supportingEvidenceIds: references,
  confidence: confidence.nullable(),
  uncertainty: z.array(z.string().min(1)).max(100),
  provenanceIds: references,
  verificationStatus: z.literal("unverified"),
  structure: StructureResultSchema.optional(),
  fusion: FusionResultSchema.optional(),
}).strict();

const observedRelationshipSchema = StructureRelationshipSchema.extend({
  classification: z.literal("observed"),
  verificationStatus: z.literal("observed"),
  provenanceIds: references,
}).strict();

const inferredRelationshipSchema = StructureRelationshipSchema.extend({
  classification: z.literal("inferred"),
  verificationStatus: z.literal("unverified"),
  basis: z.literal("model"),
  uncertainty: z.array(z.string().min(1)).max(100),
  provenanceIds: references,
}).strict();

export const CanvasAnalysisRelationshipSchema = z.discriminatedUnion("classification", [observedRelationshipSchema, inferredRelationshipSchema]).superRefine((value, context) => {
  if (value.classification === "observed" && value.basis === "model") context.addIssue({ code: "custom", path: ["basis"], message: "Model relationships must be classified as inferred." });
});

export const CanvasObservedEvidenceSchema = z.object({
  sourceScope: CanvasEvidenceBundleSchema.shape.scope,
  items: z.array(CanvasAnalysisEvidenceSchema).max(10000),
  conflicts: z.array(EvidenceConflictSchema).max(1000),
  warnings: z.array(z.string()).max(1000),
  selectedContext: SelectedCanvasContextSchema,
}).strict();

export const CanvasInferredEvidenceSchema = z.object({
  evidence: z.array(CanvasAnalysisEvidenceSchema).max(10000),
  items: z.array(CanvasInferredInterpretationSchema).max(1000),
}).strict();

export const CanvasAnalysisResultSchema = z.object({
  schemaVersion: z.literal(1),
  boardId: identifier,
  courseId: identifier,
  lessonId: identifier,
  revision: z.number().int().nonnegative(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceObjectIds: z.array(identifier).max(5000),
  sourceObjectRefs: z.array(CanvasSourceObjectRefSchema).max(5000),
  observedEvidence: CanvasObservedEvidenceSchema,
  inferredInterpretations: CanvasInferredEvidenceSchema,
  relationships: z.array(CanvasAnalysisRelationshipSchema).max(5000),
  uncertainty: FusionResultSchema.shape.uncertainties,
  provenance: z.array(CanvasAnalysisProvenanceSchema).min(1).max(1000),
  analysisStatus: pipelineResultSchema.shape.status,
  pipelineVersion: identifier,
  diagnostics: z.object({ errors: pipelineResultSchema.shape.errors, timings: pipelineResultSchema.shape.timings }).strict(),
}).strict().superRefine((result, context) => {
  const objectIds = new Set(result.sourceObjectIds);
  const sourceRefs = new Set(result.sourceObjectRefs.map((item) => `${item.scope}:${item.id}`));
  const evidence = [...result.observedEvidence.items, ...result.inferredInterpretations.evidence];
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const provenanceIds = new Set(result.provenance.map((item) => item.id));
  const unique = (values: string[]) => new Set(values).size === values.length;
  const checkObjectIds = (ids: string[], path: (string | number)[]) => {
    for (const id of ids) if (!objectIds.has(id)) context.addIssue({ code: "custom", path, message: `Unknown canvas source object ID: ${id}` });
  };
  const checkProvenance = (ids: string[], path: (string | number)[]) => {
    for (const id of ids) if (!provenanceIds.has(id)) context.addIssue({ code: "custom", path, message: `Unknown provenance ID: ${id}` });
  };

  if (!unique(result.sourceObjectIds)) context.addIssue({ code: "custom", path: ["sourceObjectIds"], message: "Source object IDs must be unique." });
  if (sourceRefs.size !== result.sourceObjectRefs.length) context.addIssue({ code: "custom", path: ["sourceObjectRefs"], message: "Scoped source object references must be unique." });
  if (result.sourceObjectRefs.some((item) => !objectIds.has(item.id))) context.addIssue({ code: "custom", path: ["sourceObjectRefs"], message: "Scoped source reference has an unknown object ID." });
  if (!unique([...evidenceIds])) context.addIssue({ code: "custom", path: ["observedEvidence"], message: "Evidence IDs must be unique." });
  if (!unique([...provenanceIds])) context.addIssue({ code: "custom", path: ["provenance"], message: "Provenance IDs must be unique." });
  if (result.analysisStatus === "complete" && !result.observedEvidence.items.length) context.addIssue({ code: "custom", path: ["observedEvidence", "items"], message: "Complete analysis requires observed canvas evidence." });

  const scope = { boardId: result.boardId, courseId: result.courseId, lessonId: result.lessonId };
  for (const [key, value] of Object.entries(scope) as Array<[keyof typeof scope, string]>) {
    if (result.observedEvidence.selectedContext.scope[key] !== value) context.addIssue({ code: "custom", path: ["observedEvidence", "selectedContext", "scope", key], message: "Selected evidence scope does not match the analysis scope." });
    if (result.observedEvidence.sourceScope[key] !== value) context.addIssue({ code: "custom", path: ["observedEvidence", "sourceScope", key], message: "Captured evidence scope does not match the analysis scope." });
  }
  if (result.observedEvidence.selectedContext.scope.revisionHash !== result.observedEvidence.sourceScope.revisionHash) context.addIssue({ code: "custom", path: ["observedEvidence", "sourceScope", "revisionHash"], message: "Evidence context revision hashes do not match." });
  if (result.inferredInterpretations.evidence.some((item) => item.origin !== "model" || !item.uncertain)) context.addIssue({ code: "custom", path: ["inferredInterpretations", "evidence"], message: "Model evidence must remain explicitly uncertain." });
  if (result.observedEvidence.items.some((item) => item.origin === "model")) context.addIssue({ code: "custom", path: ["observedEvidence", "items"], message: "Model evidence cannot be represented as observed canvas data." });

  const allEvidenceById = new Map(evidence.map((item) => [item.id, item]));
  result.observedEvidence.items.forEach((item, index) => {
    checkObjectIds(item.sourceIds, ["observedEvidence", "items", index, "sourceIds"]);
    checkProvenance(item.provenanceIds, ["observedEvidence", "items", index, "provenanceIds"]);
    if (item.revisionHash !== result.observedEvidence.sourceScope.revisionHash) context.addIssue({ code: "custom", path: ["observedEvidence", "items", index, "revisionHash"], message: "Evidence item revision does not match its bundle." });
  });
  result.inferredInterpretations.evidence.forEach((item, index) => {
    checkObjectIds(item.sourceIds, ["inferredInterpretations", "evidence", index, "sourceIds"]);
    checkProvenance(item.provenanceIds, ["inferredInterpretations", "evidence", index, "provenanceIds"]);
    if (item.revisionHash !== result.observedEvidence.sourceScope.revisionHash) context.addIssue({ code: "custom", path: ["inferredInterpretations", "evidence", index, "revisionHash"], message: "Evidence item revision does not match its bundle." });
  });
  result.observedEvidence.selectedContext.evidence.forEach((item, index) => {
    if (!allEvidenceById.has(item.id)) context.addIssue({ code: "custom", path: ["observedEvidence", "selectedContext", "evidence", index], message: "Selected evidence must come from the analysis evidence bundle." });
  });
  result.observedEvidence.selectedContext.sourceRecords.forEach((source, index) => checkObjectIds([source.id], ["observedEvidence", "selectedContext", "sourceRecords", index, "id"]));
  result.observedEvidence.selectedContext.scientificObjects.forEach((source, index) => {
    if (typeof source.id === "string") checkObjectIds([source.id], ["observedEvidence", "selectedContext", "scientificObjects", index, "id"]);
  });
  const conflictIds = new Set(result.observedEvidence.conflicts.map((conflict) => conflict.id));
  const contextConflictIds = new Set(result.observedEvidence.selectedContext.conflicts.map((conflict) => conflict.id));
  if (conflictIds.size !== contextConflictIds.size || [...conflictIds].some((id) => !contextConflictIds.has(id))) context.addIssue({ code: "custom", path: ["observedEvidence", "conflicts"], message: "Selected context must preserve every evidence conflict." });
  result.observedEvidence.conflicts.forEach((conflict, index) => {
    for (const id of conflict.evidenceIds) if (!evidenceIds.has(id)) context.addIssue({ code: "custom", path: ["observedEvidence", "conflicts", index, "evidenceIds"], message: `Unknown conflict evidence ID: ${id}` });
  });
  result.inferredInterpretations.items.forEach((item, index) => {
    checkObjectIds(item.sourceObjectIds, ["inferredInterpretations", "items", index, "sourceObjectIds"]);
    for (const id of item.supportingEvidenceIds) if (!evidenceIds.has(id)) context.addIssue({ code: "custom", path: ["inferredInterpretations", "items", index, "supportingEvidenceIds"], message: `Unknown observed evidence ID: ${id}` });
    checkProvenance(item.provenanceIds, ["inferredInterpretations", "items", index, "provenanceIds"]);
  });
  result.relationships.forEach((item, index) => {
    checkObjectIds([item.fromId, item.toId, ...item.sourceIds], ["relationships", index, "sourceIds"]);
    checkProvenance(item.provenanceIds, ["relationships", index, "provenanceIds"]);
  });
});

export type CanvasAnalysisResult = z.infer<typeof CanvasAnalysisResultSchema>;
export type AuthoritativeCanvasRevision = z.infer<typeof AuthoritativeCanvasRevisionSchema>;

export type CanvasAnalysisErrorCode = "invalid_result" | "scope_mismatch" | "stale_revision";

export class CanvasAnalysisValidationError extends Error {
  constructor(readonly code: CanvasAnalysisErrorCode, message: string, readonly details?: unknown) {
    super(message);
    this.name = "CanvasAnalysisValidationError";
  }
}

export function currentCanvasRevision(source: AuthoritativeCanvasRevision) {
  const board = AuthoritativeCanvasRevisionSchema.parse(source);
  const snapshotHash = sha256(canonicalJson(parseAuthoritativeDocument(board.document)));
  const revisionHash = sha256(canonicalJson({
    schemaVersion: 1,
    boardId: board.boardId,
    courseId: board.courseId,
    lessonId: board.lessonId,
    revision: board.revision,
    snapshotHash,
  }));
  return { boardId: board.boardId, courseId: board.courseId, lessonId: board.lessonId, revision: board.revision, snapshotHash, revisionHash };
}

export function createCanvasAnalysisResult(input: {
  board: AuthoritativeCanvasRevision;
  canvasInput: CanvasInput;
  evidence: z.infer<typeof CanvasEvidenceBundleSchema>;
  selectedContext: z.infer<typeof SelectedCanvasContextSchema>;
  pipelineResult: unknown;
}): CanvasAnalysisResult {
  const board = AuthoritativeCanvasRevisionSchema.parse(input.board);
  const pipeline = pipelineResultSchema.parse(input.pipelineResult);
  const evidence = CanvasEvidenceBundleSchema.parse(input.evidence);
  const selectedContext = SelectedCanvasContextSchema.parse(input.selectedContext);
  if (input.canvasInput.boardId !== board.boardId || input.canvasInput.courseId !== board.courseId || input.canvasInput.lessonId !== board.lessonId) {
    throw new CanvasAnalysisValidationError("scope_mismatch", "Canvas input scope does not match the authoritative board.");
  }
  if (evidence.scope.boardId !== board.boardId || evidence.scope.courseId !== board.courseId || evidence.scope.lessonId !== board.lessonId) {
    throw new CanvasAnalysisValidationError("scope_mismatch", "Canvas evidence scope does not match the authoritative board.");
  }
  if (evidence.scope.revisionHash !== selectedContext.scope.revisionHash) throw new CanvasAnalysisValidationError("stale_revision", "Selected canvas context does not match the captured evidence revision.");
  const savedDocument = record(parseAuthoritativeDocument(board.document));
  if (!savedDocument.snapshot || !Array.isArray(savedDocument.objects)) throw new CanvasAnalysisValidationError("invalid_result", "Authoritative canvas document is missing its snapshot or scientific objects.");
  const authoritativeInput = normalizeCanvasInput({
    boardId: board.boardId,
    courseId: board.courseId,
    lessonId: board.lessonId,
    snapshot: savedDocument.snapshot,
    scientificObjects: savedDocument.objects,
    selectedIds: input.canvasInput.selectedIds,
    image: input.canvasInput.image,
  });
  if (input.canvasInput.revision !== authoritativeInput.revision || evidence.scope.revisionHash !== authoritativeInput.revision) {
    throw new CanvasAnalysisValidationError("stale_revision", "Canvas analysis input does not match the persisted board snapshot.");
  }

  const provenance = pipeline.provenance.map((item) => CanvasAnalysisProvenanceSchema.parse(item));
  const sourceObjectIds = [...new Set([...input.canvasInput.nativeRecords.map((item) => item.id), ...input.canvasInput.scientificObjects.map((item) => item.id)])];
  const sourceObjectRefs = [
    ...input.canvasInput.nativeRecords.map((item) => ({ scope: "quickdraw" as const, id: item.id })),
    ...input.canvasInput.scientificObjects.map((item) => ({ scope: "science" as const, id: item.id })),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.scope === item.scope && candidate.id === item.id) === index);
  const withProvenance = (item: z.infer<typeof CanvasEvidenceSchema>) => {
    const stages = item.origin === "native" ? ["canvas"] : item.origin === "geometry" ? ["geometry"] : item.origin === "ocr" ? ["ocr"] : ["structure", "fusion"];
    const provenanceIds = provenance.filter((entry) => stages.includes(entry.stage)).map((entry) => entry.id);
    if (!provenanceIds.length) throw new CanvasAnalysisValidationError("invalid_result", `No provenance is recorded for ${item.origin} canvas evidence.`);
    return CanvasAnalysisEvidenceSchema.parse({ ...item, provenanceIds });
  };
  const observedItems = evidence.evidence.filter((item) => item.origin !== "model").map(withProvenance);
  const inferredEvidence = evidence.evidence.filter((item) => item.origin === "model").map(withProvenance);
  const evidenceById = new Map([...observedItems, ...inferredEvidence].map((item) => [item.id, item]));
  const inferenceStages = provenance.filter((item) => item.stage === "structure" || item.stage === "fusion").map((item) => item.id);
  const inferredItems = pipeline.interpretations.map((value, index) => {
    const item = record(value);
    const itemSources = strings(item.sourceObjectIds ?? item.sourceIds);
    const supportingEvidenceIds = strings(item.supportingEvidenceIds).length
      ? strings(item.supportingEvidenceIds)
      : [...evidenceById.values()].filter((candidate) => candidate.sourceIds.some((id) => itemSources.includes(id))).map((candidate) => candidate.id);
    const statement = firstString(item.statement, item.description, item.text);
    const provenanceIds = strings(item.provenanceIds).length ? strings(item.provenanceIds) : inferenceStages;
    return CanvasInferredInterpretationSchema.parse({
      interpretationId: firstString(item.interpretationId, item.id) ?? `interpretation-${index}`,
      statement,
      sourceObjectIds: itemSources,
      supportingEvidenceIds,
      confidence: typeof item.confidence === "number" ? item.confidence : null,
      uncertainty: strings(item.uncertainty ?? item.uncertaintyReasons),
      provenanceIds,
      verificationStatus: "unverified",
      ...(item.structure ? { structure: item.structure } : {}),
      ...(item.fusion ? { fusion: item.fusion } : {}),
    });
  });
  const relationships = pipeline.relationships.map((value) => {
    const item = record(value);
    const relation = StructureRelationshipSchema.parse(item);
    const stage = relation.basis === "model" ? "structure" : "geometry";
    const provenanceIds = strings(item.provenanceIds).length ? strings(item.provenanceIds) : provenance.filter((entry) => entry.stage === stage).map((entry) => entry.id);
    return relation.basis === "model"
      ? CanvasAnalysisRelationshipSchema.parse({ ...relation, classification: "inferred", verificationStatus: "unverified", uncertainty: strings(item.uncertainty).length ? strings(item.uncertainty) : ["Model-generated relationship; not independently verified."], provenanceIds })
      : CanvasAnalysisRelationshipSchema.parse({ ...relation, classification: "observed", verificationStatus: "observed", provenanceIds });
  });
  const current = currentCanvasRevision(board);
  const uncertainty = FusionResultSchema.shape.uncertainties.parse([
    ...pipeline.uncertainties,
    ...evidence.warnings,
    ...evidence.conflicts.map((conflict) => ({ type: "unresolved_canvas_conflict", subjectId: conflict.subjectId, claimKey: conflict.claimKey, evidenceIds: conflict.evidenceIds, values: conflict.values })),
    ...evidence.evidence.filter((item) => item.uncertain).map((item) => ({ type: "uncertain_canvas_evidence", evidenceId: item.id, sourceIds: item.sourceIds, reasons: item.uncertaintyReasons })),
    ...(selectedContext.truncated ? [{ type: "pruned_canvas_context", excludedEvidenceCount: selectedContext.excludedEvidenceCount, excludedSourceCount: selectedContext.excludedSourceCount }] : []),
  ]);
  const result = {
    schemaVersion: 1 as const,
    boardId: board.boardId,
    courseId: board.courseId,
    lessonId: board.lessonId,
    revision: board.revision,
    snapshotHash: current.snapshotHash,
    revisionHash: current.revisionHash,
    sourceObjectIds,
    sourceObjectRefs,
    observedEvidence: { sourceScope: evidence.scope, items: observedItems, conflicts: evidence.conflicts, warnings: evidence.warnings, selectedContext },
    inferredInterpretations: { evidence: inferredEvidence, items: inferredItems },
    relationships,
    uncertainty,
    provenance,
    analysisStatus: pipeline.status,
    pipelineVersion: pipeline.pipelineVersion,
    diagnostics: { errors: pipeline.errors, ...(pipeline.timings ? { timings: pipeline.timings } : {}) },
  };
  return validateCanvasAnalysisForBoard(result, board);
}

export function validateCanvasAnalysisForBoard(input: unknown, source: AuthoritativeCanvasRevision): CanvasAnalysisResult {
  const board = AuthoritativeCanvasRevisionSchema.parse(source);
  const parsed = CanvasAnalysisResultSchema.safeParse(input);
  if (!parsed.success) throw new CanvasAnalysisValidationError("invalid_result", "Canvas analysis result is invalid.", parsed.error.issues);
  const result = parsed.data;
  if (result.boardId !== board.boardId || result.courseId !== board.courseId || result.lessonId !== board.lessonId) {
    throw new CanvasAnalysisValidationError("scope_mismatch", "Canvas analysis scope does not match the authoritative board.");
  }
  const current = currentCanvasRevision(board);
  if (result.revision !== current.revision || result.snapshotHash !== current.snapshotHash || result.revisionHash !== current.revisionHash) {
    throw new CanvasAnalysisValidationError("stale_revision", "Canvas analysis is stale; analyze the current board again.", { currentRevision: current.revision, currentRevisionHash: current.revisionHash });
  }
  return result;
}

function parseAuthoritativeDocument(value: unknown): unknown {
  if (typeof value === "string") {
    try { return JSON.parse(value); }
    catch { throw new Error("Authoritative canvas document is not valid JSON."); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Authoritative canvas document must be a JSON object.");
  return value;
}

function canonicalJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canvas revision contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Canvas revision contains a cyclic value.");
    seen.add(value);
    const result = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("Canvas revision contains a cyclic value.");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Canvas revision contains a non-JSON object.");
    seen.add(value);
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const result = `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, seen)}`).join(",")}}`;
    seen.delete(value);
    return result;
  }
  throw new Error("Canvas revision contains a non-JSON value.");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

import { z } from "zod";
import { geometryObservations, quickdrawBondRelationships } from "./input.js";
import type { OCRAssociation } from "./regions.js";
import type { CanvasInput, OCRResult, StructureResult } from "./types.js";

export const CanvasEvidenceSchema = z.object({
  id: z.string().min(1),
  revisionHash: z.string().min(1),
  origin: z.enum(["native", "geometry", "ocr", "model"]),
  kind: z.enum(["object", "label", "quantity", "relationship", "observation", "association"]),
  subjectId: z.string().nullable(),
  claimKey: z.string().nullable(),
  claimValue: z.string().nullable(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).nullable(),
  locationPrecision: z.enum(["item", "region", "unknown"]).nullable(),
  uncertain: z.boolean(),
  uncertaintyReasons: z.array(z.string()),
});
export const EvidenceConflictSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string(),
  claimKey: z.string(),
  evidenceIds: z.array(z.string()).min(2),
  values: z.array(z.string()).min(2),
  resolution: z.literal("unresolved"),
});
const ScopeSchema = z.object({
  boardId: z.string().min(1),
  courseId: z.string().nullable(),
  lessonId: z.string().nullable(),
  revisionHash: z.string().min(1),
});
export const CanvasEvidenceBundleSchema = z.object({
  schemaVersion: z.literal(1),
  scope: ScopeSchema,
  evidence: z.array(CanvasEvidenceSchema),
  conflicts: z.array(EvidenceConflictSchema),
  warnings: z.array(z.string()),
});
export const SelectedCanvasContextSchema = z.object({
  schemaVersion: z.literal(1),
  scope: ScopeSchema,
  evidence: z.array(CanvasEvidenceSchema),
  sourceRecords: z.array(z.object({ id: z.string(), type: z.string(), bounds: z.unknown().optional(), geometry: z.unknown().optional(), text: z.string().optional() })),
  scientificObjects: z.array(z.record(z.string(), z.unknown())),
  conflicts: z.array(EvidenceConflictSchema),
  warnings: z.array(z.string()),
  excludedEvidenceCount: z.number().int().nonnegative(),
  excludedSourceCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type CanvasEvidence = z.infer<typeof CanvasEvidenceSchema>;
export type EvidenceConflict = z.infer<typeof EvidenceConflictSchema>;
export type CanvasEvidenceBundle = z.infer<typeof CanvasEvidenceBundleSchema>;
export type SelectedCanvasContext = z.infer<typeof SelectedCanvasContextSchema>;

const validText = (s: unknown): s is string => typeof s === "string" && !!s.trim();
const unique = (ids: string[]) => [...new Set(ids)];
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const normalizeLabel = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const labelKey = (s: string) => normalizeLabel(s).replace(/\s/g, "");
const qty = (value: number, unit: string) => `${value} ${normalizeLabel(unit)}`.trim();
const explicitQuantity = (text: string) => {
  const match = text.normalize("NFKC").match(/^\s*([\p{L}][\p{L}\p{N}_]*)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([\p{L}%µμ]*)\s*$/u);
  return match ? { symbol: labelKey(match[1]), value: qty(Number(match[2]), match[3]) } : null;
};
const asNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function buildCanvasEvidence(input: CanvasInput, ocr: OCRResult, structure: StructureResult, associations: OCRAssociation[]): CanvasEvidenceBundle {
  const known = new Set([...input.nativeRecords.map((x) => x.id), ...input.scientificObjects.map((x) => x.id)]);
  const regionIds = new Set(input.image?.regions?.map((r) => r.id) ?? []);
  if (input.image?.base64) regionIds.add("canvas-region");
  const evidence: CanvasEvidence[] = [], warnings: string[] = [];
  const sourceIds = (ids: string[]) => unique(ids.filter((id) => known.has(id)));
  const add = (entry: Omit<CanvasEvidence, "id" | "revisionHash">) => {
    evidence.push(CanvasEvidenceSchema.parse({ ...entry, id: `ev:${evidence.length}`, revisionHash: input.revision }));
  };
  const native = (kind: CanvasEvidence["kind"], subjectId: string, claimKey: string | null, claimValue: string | null, text: string) =>
    add({ origin: "native", kind, subjectId, claimKey, claimValue, text, sourceIds: [subjectId], confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] });

  for (const shape of input.nativeRecords) {
    const props = record(record(shape.raw).props);
    const encoded = validText(shape.text) ? shape.text : validText(props.label) ? props.label : null;
    if (encoded) {
      const parsed = explicitQuantity(encoded);
      native(parsed ? "quantity" : "label", shape.id, parsed ? `quantity:${parsed.symbol}` : "label", parsed ? parsed.value : normalizeLabel(encoded), encoded);
    }
  }
  for (const object of input.scientificObjects) {
    native("object", object.id, null, null, `Native ${object.kind} (${object.id})`);
    const explicitLabel = validText(object.label) ? object.label : validText(object.name) ? object.name : null;
    if (explicitLabel) native("label", object.id, "label", normalizeLabel(explicitLabel), explicitLabel);
    const magnitude = asNumber(object.value) ? object.value : asNumber(object.magnitude) ? object.magnitude : null;
    if (magnitude !== null) {
      const unit = validText(object.unit) ? object.unit : validText(object.units) ? object.units : "";
      native("quantity", object.id, explicitLabel ? `quantity:${labelKey(explicitLabel)}` : "quantity", qty(magnitude, unit), `${explicitLabel ?? object.kind} = ${magnitude} ${unit}`.trim());
    }
  }
  for (const observation of geometryObservations(input)) {
    add({ origin: "geometry", kind: "observation", subjectId: observation.sourceIds.length === 1 ? observation.sourceIds[0] : null, claimKey: null, claimValue: null, text: observation.description, sourceIds: sourceIds(observation.sourceIds), confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] });
  }
  for (const bond of quickdrawBondRelationships(input)) {
    add({ origin: "geometry", kind: "relationship", subjectId: bond.fromId, claimKey: `bond:${[bond.fromId, bond.toId].sort().join("|")}`, claimValue: normalizeLabel(bond.relation), text: `${bond.fromId} -- ${bond.relation} -- ${bond.toId}`, sourceIds: sourceIds(bond.sourceIds), confidence: 1, locationPrecision: null, uncertain: false, uncertaintyReasons: [] });
  }
  ocr.items.forEach((item, index) => {
    const linked = associations[index];
    const anchor = linked?.status === "geometry-supported" && item.locationPrecision === "item" && linked.candidateIds.length === 1 && known.has(linked.candidateIds[0]) ? linked.candidateIds[0] : null;
    const parsed = explicitQuantity(item.text);
    const invalidIds = item.sourceIds.filter((id) => !known.has(id));
    const invalidRegion = !!item.sourceRegionId && !regionIds.has(item.sourceRegionId);
    const reasons = [...(item.uncertain ? ["OCR marked uncertain"] : []), ...(item.confidence === null ? ["OCR confidence unavailable"] : []), ...(item.locationPrecision !== "item" ? ["No item-level location"] : []), ...(linked?.status === "ambiguous" ? ["Multiple possible canvas objects"] : []), ...(!anchor ? ["Unverified association with a canvas object"] : []), ...(invalidIds.length ? ["Unrecognized source IDs omitted"] : []), ...(invalidRegion ? ["Unrecognized region ID"] : [])];
    add({ origin: "ocr", kind: parsed ? "quantity" : "label", subjectId: anchor, claimKey: anchor ? parsed ? `quantity:${parsed.symbol}` : "label" : null, claimValue: anchor ? parsed?.value ?? normalizeLabel(item.text) : null, text: item.text, sourceIds: sourceIds(item.sourceIds), confidence: item.confidence, locationPrecision: item.locationPrecision, uncertain: reasons.length > 0 || item.alternatives.length > 0, uncertaintyReasons: unique([...reasons, ...(item.alternatives.length ? ["Alternative OCR readings"] : [])]) });
    if (linked) {
      add({ origin: "geometry", kind: "association", subjectId: anchor, claimKey: null, claimValue: null, text: `${item.text} → ${linked.candidateIds.join(", ") || "unmatched"}`, sourceIds: sourceIds([...linked.sourceIds, ...linked.candidateIds]), confidence: null, locationPrecision: item.locationPrecision, uncertain: linked.status !== "geometry-supported" || reasons.length > 0, uncertaintyReasons: unique([...linked.uncertainty, ...(!anchor ? ["Not a verified label assignment"] : [])]) });
    }
  });
  for (const object of structure.objects) {
    if (!known.has(object.id)) { warnings.push("Rejected model object with unknown canvas ID."); continue; }
    const ids = sourceIds(object.sourceIds);
    add({ origin: "model", kind: "object", subjectId: object.id, claimKey: null, claimValue: null, text: `${object.kind} ${object.id}`, sourceIds: ids, confidence: object.confidence, locationPrecision: null, uncertain: true, uncertaintyReasons: ["Model interpretation; not independently verified"] });
    if (object.label) add({ origin: "model", kind: "label", subjectId: object.id, claimKey: "label", claimValue: normalizeLabel(object.label), text: object.label, sourceIds: ids, confidence: object.confidence, locationPrecision: null, uncertain: true, uncertaintyReasons: ["Model interpretation; not independently verified"] });
  }
  for (const edge of structure.relationships) {
    if (!known.has(edge.fromId) || !known.has(edge.toId)) { warnings.push("Rejected relationship with unknown canvas endpoints."); continue; }
    const bond = /\bbond\b/i.test(edge.relation);
    add({ origin: "model", kind: "relationship", subjectId: edge.fromId, claimKey: bond ? `bond:${[edge.fromId, edge.toId].sort().join("|")}` : null, claimValue: bond ? normalizeLabel(edge.relation) : null, text: `${edge.fromId} -- ${edge.relation} -- ${edge.toId}`, sourceIds: sourceIds(edge.sourceIds), confidence: edge.confidence, locationPrecision: null, uncertain: true, uncertaintyReasons: ["Model relation; claimed basis is not proof"] });
  }
  for (const observation of structure.observations) {
    add({ origin: "model", kind: "observation", subjectId: null, claimKey: null, claimValue: null, text: observation.description, sourceIds: sourceIds(observation.sourceIds), confidence: observation.confidence, locationPrecision: null, uncertain: true, uncertaintyReasons: ["Model observation; claimed basis is not proof"] });
  }
  warnings.push(...structure.ambiguities.map((a) => `Structure ambiguity: ${a}`));
  if (ocr.uncertain) warnings.push("OCR results contain uncertainty.");
  const grouped = new Map<string, CanvasEvidence[]>();
  for (const item of evidence) {
    if (!item.subjectId || !item.claimKey || !item.claimValue) continue;
    const key = `${item.subjectId}\0${item.claimKey}`;
    const list = grouped.get(key) ?? [];
    list.push(item); grouped.set(key, list);
  }
  const conflicts: EvidenceConflict[] = [];
  for (const group of grouped.values()) {
    const values = unique(group.map((e) => e.claimValue!));
    if (values.length < 2) continue;
    conflicts.push(EvidenceConflictSchema.parse({
      id: `conflict:${conflicts.length}`, subjectId: group[0].subjectId, claimKey: group[0].claimKey,
      evidenceIds: group.map((e) => e.id), values, resolution: "unresolved",
    }));
  }
  return CanvasEvidenceBundleSchema.parse({ schemaVersion: 1, scope: { boardId: input.boardId, courseId: input.courseId ?? null, lessonId: input.lessonId ?? null, revisionHash: input.revision }, evidence, conflicts, warnings: unique(warnings) });
}

const tokens = (text: string) => new Set((text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((t) => !["what", "which", "does", "this", "that", "from", "with", "about", "here", "there", "shown", "canvas", "drawing"].includes(t)));
const jsonSize = (value: unknown) => JSON.stringify(value).length;

export function selectCanvasContext(bundle: CanvasEvidenceBundle, options: { question: string; selectedIds?: string[]; maxChars: number; expectedRevisionHash?: string; nativeRecords?: CanvasInput["nativeRecords"]; scientificObjects?: CanvasInput["scientificObjects"] }): SelectedCanvasContext {
  const source = CanvasEvidenceBundleSchema.parse(bundle);
  if (options.expectedRevisionHash && options.expectedRevisionHash !== source.scope.revisionHash) throw new Error("Stale canvas evidence revision. Capture the current board again.");
  if (!Number.isInteger(options.maxChars) || options.maxChars < 300) throw new Error("Canvas evidence context budget must be at least 300 characters.");
  const selection = new Set(options.selectedIds ?? []);
  const conflicted = new Set(source.conflicts.flatMap((c) => c.evidenceIds));
  const queryTerms = tokens(options.question);
  const important = (e: CanvasEvidence) => conflicted.has(e.id) || e.sourceIds.some((id) => selection.has(id)) || (!!e.subjectId && selection.has(e.subjectId));
  const relevance = (e: CanvasEvidence) => {
    const terms = tokens(e.text);
    let common = 0;
    for (const term of queryTerms) if (terms.has(term)) common++;
    return (conflicted.has(e.id) ? 10000 : 0) + (important(e) ? 1000 : 0) + common * 100 + (e.origin === "native" || e.origin === "geometry" ? 30 : e.origin === "ocr" ? 20 : 10) + (e.uncertain ? 5 : 0);
  };
  const ranked = [...source.evidence].sort((a, b) => relevance(b) - relevance(a) || a.id.localeCompare(b.id));
  const essential = ranked.filter(important), optional = ranked.filter((e) => !important(e));
  const included: CanvasEvidence[] = [];
  const sourceRecords: SelectedCanvasContext["sourceRecords"] = [];
  const scientificObjects: SelectedCanvasContext["scientificObjects"] = [];
  const initial: SelectedCanvasContext = {
    schemaVersion: 1, scope: source.scope, evidence: [], sourceRecords: [], scientificObjects: [], conflicts: source.conflicts,
    warnings: source.warnings, excludedEvidenceCount: 0, excludedSourceCount: 0, truncated: false,
  };
  const current = () => ({ ...initial, evidence: included, sourceRecords, scientificObjects });
  if (jsonSize(initial) > options.maxChars) throw new Error("Canvas evidence budget cannot preserve conflict and uncertainty metadata.");
  const addEvidence = (e: CanvasEvidence, required: boolean) => {
    if (jsonSize({ ...current(), evidence: [...included, e] }) <= options.maxChars) included.push(e);
    else if (required) throw new Error(`Canvas evidence budget cannot preserve critical selected/conflicting evidence (${options.maxChars} chars). Choose fewer shapes or increase the limit.`);
  };
  for (const e of essential) addEvidence(e, true);
  const sources = [
    ...(options.nativeRecords ?? []).map((r) => ({ id: r.id, type: "record" as const, value: { id: r.id, type: r.type, ...(r.bounds ? { bounds: r.bounds } : {}), ...(r.geometry ? { geometry: r.geometry } : {}), ...(r.text !== undefined ? { text: r.text } : {}) } })),
    ...(options.scientificObjects ?? []).map((o) => ({ id: o.id, type: "scientific" as const, value: o })),
  ];
  const conflictIds = new Set(source.evidence.filter((e) => conflicted.has(e.id)).flatMap((e) => [...e.sourceIds, ...(e.subjectId ? [e.subjectId] : [])]));
  const insertSource = (item: typeof sources[number], required: boolean) => {
    const candidate = item.type === "record" ? { ...current(), sourceRecords: [...sourceRecords, item.value] } : { ...current(), scientificObjects: [...scientificObjects, item.value] };
    if (jsonSize(candidate) <= options.maxChars) {
      if (item.type === "record") sourceRecords.push(item.value);
      else scientificObjects.push(item.value);
    } else if (required) throw new Error(`Canvas evidence budget cannot preserve selected source geometry (${options.maxChars} chars). Choose fewer shapes or increase the limit.`);
  };
  for (const item of sources.filter((s) => selection.has(s.id))) insertSource(item, true);
  for (const item of sources.filter((s) => !selection.has(s.id) && conflictIds.has(s.id))) insertSource(item, false);
  for (const e of optional) addEvidence(e, false);
  for (const item of sources.filter((s) => !selection.has(s.id) && !conflictIds.has(s.id))) insertSource(item, false);
  const excludedEvidenceCount = source.evidence.length - included.length;
  const excludedSourceCount = sources.length - sourceRecords.length - scientificObjects.length;
  return SelectedCanvasContextSchema.parse({ ...current(), excludedEvidenceCount, excludedSourceCount, truncated: excludedEvidenceCount + excludedSourceCount > 0 });
}

import { createHash } from "node:crypto";
import {
  CanvasReasoningStateSchema,
  type CanvasReasoningClaim,
  type CanvasReasoningClaimDraft,
  type CanvasReasoningContradiction,
  type CanvasReasoningDelta,
  type CanvasReasoningEntity,
  type CanvasReasoningEntityDraft,
  type CanvasReasoningState,
  type CanvasReasoningUnresolved,
} from "./types.js";

/** Hard bounds from the plan. Trimming is deterministic, never model-driven. */
export const CANVAS_REASONING_LIMITS = {
  entities: 100,
  claims: 200,
  contradictions: 32,
  unresolved: 32,
  coveredChunks: 64,
} as const;

const EDGE_PUNCTUATION = /^[\s.,;:!?'"“”‘’()[\]{}]+|[\s.,;:!?'"“”‘’()[\]{}]+$/gu;

/** Lowercase, collapse whitespace, trim sentence punctuation. Matching only; never shown to the user. */
export function normalizeReasoningText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").replace(EDGE_PUNCTUATION, "");
}

function claimKey(claim: CanvasReasoningClaimDraft | CanvasReasoningClaim): string {
  return [claim.subject, claim.relation, claim.object, claim.value].map(normalizeReasoningText).join("\u0000");
}

function entityKey(entity: CanvasReasoningEntityDraft | CanvasReasoningEntity): string {
  return [entity.label, entity.kind, entity.regionId].map(normalizeReasoningText).join("\u0000");
}

function stableId(prefix: string, key: string): string {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

function filterEvidence(evidence: readonly string[], allowed: ReadonlySet<string>): string[] {
  if (!evidence.length) return [];
  if (!evidence.every((id) => allowed.has(id))) return [];
  return [...new Set(evidence)].sort();
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/**
 * Folds one reasoning pass into the accumulating state.
 *
 * Drops unsupported evidence, derives identity, records contradictions without
 * resolving them, and applies caps. Pure: the input state is never mutated.
 */
export function mergeDelta(state: CanvasReasoningState, delta: CanvasReasoningDelta, allowedSourceIds: ReadonlySet<string>): CanvasReasoningState {
  const entities = new Map<string, CanvasReasoningEntity>();
  for (const entity of [...state.entities].sort(byId)) entities.set(entityKey(entity), { ...entity, evidence: [...entity.evidence] });

  for (const draft of delta.entitiesToAdd) {
    const evidence = filterEvidence(draft.evidence, allowedSourceIds);
    if (!evidence.length) continue;
    const key = entityKey(draft);
    const existing = entities.get(key);
    if (existing) {
      existing.evidence = [...new Set([...existing.evidence, ...evidence])].sort();
    } else {
      entities.set(key, { id: stableId("ent", key), label: draft.label, kind: draft.kind, regionId: draft.regionId, evidence });
    }
  }

  const claims = new Map<string, CanvasReasoningClaim>();
  for (const claim of [...state.claims].sort(byId)) claims.set(claimKey(claim), { ...claim, evidence: [...claim.evidence] });

  for (const draft of delta.claimsToAdd) {
    const evidence = filterEvidence(draft.evidence, allowedSourceIds);
    if (!evidence.length) continue;
    const key = claimKey(draft);
    const existing = claims.get(key);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, draft.confidence);
      existing.evidence = [...new Set([...existing.evidence, ...evidence])].sort();
    } else {
      claims.set(key, {
        id: stableId("clm", key),
        subject: draft.subject,
        relation: draft.relation,
        object: draft.object,
        value: draft.value,
        status: draft.status,
        confidence: draft.confidence,
        evidence,
      });
    }
  }

  const contradictions = new Map<string, CanvasReasoningContradiction>();
  for (const entry of state.contradictions) contradictions.set([...entry.claimIds].sort().join("|"), { claimIds: [...entry.claimIds].sort(), reason: entry.reason });

  const groups = new Map<string, CanvasReasoningClaim[]>();
  for (const claim of claims.values()) {
    const key = `${normalizeReasoningText(claim.subject)}\u0000${normalizeReasoningText(claim.relation)}`;
    const group = groups.get(key);
    if (group) group.push(claim);
    else groups.set(key, [claim]);
  }

  for (const group of groups.values()) {
    const values = new Set(group.map((claim) => normalizeReasoningText(claim.value)));
    if (values.size < 2) continue;
    for (const claim of group) claim.status = "contradicted";
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) {
        if (normalizeReasoningText(group[left].value) === normalizeReasoningText(group[right].value)) continue;
        const claimIds = [group[left].id, group[right].id].sort();
        contradictions.set(claimIds.join("|"), {
          claimIds,
          reason: `Conflicting values for "${group[left].subject}" ${normalizeReasoningText(group[left].relation)}.`,
        });
      }
    }
  }

  const knownClaimIds = new Set([...claims.values()].map((claim) => claim.id));
  for (const declared of delta.contradictions) {
    const claimIds = [...new Set(declared.claimIds)].sort();
    if (claimIds.length < 2 || !claimIds.every((id) => knownClaimIds.has(id))) continue;
    contradictions.set(claimIds.join("|"), { claimIds, reason: declared.reason });
  }

  const unresolved = new Map<string, CanvasReasoningUnresolved>();
  for (const item of state.unresolved) unresolved.set(normalizeReasoningText(item.question), { question: item.question, relatedIds: [...item.relatedIds] });
  for (const item of delta.unresolved) unresolved.set(normalizeReasoningText(item.question), { question: item.question, relatedIds: filterEvidence(item.relatedIds, allowedSourceIds) });

  const coveredChunks = new Set(state.coveredChunks);
  coveredChunks.add(delta.coveredChunkId);

  const keptClaims = [...claims.values()]
    .sort((left, right) => right.confidence - left.confidence || claimKey(left).localeCompare(claimKey(right)))
    .slice(0, CANVAS_REASONING_LIMITS.claims)
    .sort(byId);
  const keptClaimIds = new Set(keptClaims.map((claim) => claim.id));

  const keptContradictions = [...contradictions.values()]
    .filter((entry) => entry.claimIds.every((id) => keptClaimIds.has(id)))
    .sort((left, right) => left.claimIds.join("|").localeCompare(right.claimIds.join("|")))
    .slice(0, CANVAS_REASONING_LIMITS.contradictions);

  return CanvasReasoningStateSchema.parse({
    ...state,
    entities: [...entities.values()].sort(byId).slice(0, CANVAS_REASONING_LIMITS.entities),
    claims: keptClaims,
    contradictions: keptContradictions,
    unresolved: [...unresolved.values()].sort((left, right) => normalizeReasoningText(left.question).localeCompare(normalizeReasoningText(right.question))).slice(0, CANVAS_REASONING_LIMITS.unresolved),
    coveredChunks: [...coveredChunks].sort().slice(0, CANVAS_REASONING_LIMITS.coveredChunks),
  });
}

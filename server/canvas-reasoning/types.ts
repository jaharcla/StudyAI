import { z } from "zod";

/** How a claim came to be known. Resolution is the tutor's job, not this module's. */
export const CLAIM_STATUSES = ["observed", "inferred", "contradicted", "user"] as const;
export const ClaimStatusSchema = z.enum(CLAIM_STATUSES);

export const SourceIdSchema = z.string().trim().min(1).max(120);
export const ConfidenceSchema = z.number().min(0).max(1);

export const CanvasReasoningEntityDraftSchema = z.object({
  label: z.string().trim().min(1).max(160),
  kind: z.string().trim().min(1).max(80),
  regionId: z.string().trim().min(1).max(120),
  evidence: z.array(SourceIdSchema).max(40).default([]),
});
export type CanvasReasoningEntityDraft = z.infer<typeof CanvasReasoningEntityDraftSchema>;

export const CanvasReasoningEntitySchema = CanvasReasoningEntityDraftSchema.extend({
  id: z.string().min(1).max(80),
});
export type CanvasReasoningEntity = z.infer<typeof CanvasReasoningEntitySchema>;

export const CanvasReasoningClaimDraftSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  relation: z.string().trim().min(1).max(80),
  object: z.string().trim().max(200).default(""),
  value: z.string().trim().max(200).default(""),
  status: ClaimStatusSchema.default("observed"),
  confidence: ConfidenceSchema.default(0.5),
  evidence: z.array(SourceIdSchema).max(40).default([]),
});
export type CanvasReasoningClaimDraft = z.infer<typeof CanvasReasoningClaimDraftSchema>;

export const CanvasReasoningClaimSchema = CanvasReasoningClaimDraftSchema.extend({
  id: z.string().min(1).max(80),
});
export type CanvasReasoningClaim = z.infer<typeof CanvasReasoningClaimSchema>;

export const CanvasReasoningContradictionSchema = z.object({
  claimIds: z.array(z.string().min(1).max(80)).min(2).max(8),
  reason: z.string().trim().min(1).max(240),
});
export type CanvasReasoningContradiction = z.infer<typeof CanvasReasoningContradictionSchema>;

export const CanvasReasoningUnresolvedSchema = z.object({
  question: z.string().trim().min(1).max(300),
  relatedIds: z.array(SourceIdSchema).max(20).default([]),
});
export type CanvasReasoningUnresolved = z.infer<typeof CanvasReasoningUnresolvedSchema>;

/** What one reasoning pass returns. The model never supplies IDs; they are derived. */
export const CanvasReasoningDeltaSchema = z.object({
  coveredChunkId: z.string().trim().min(1).max(120),
  entitiesToAdd: z.array(CanvasReasoningEntityDraftSchema).max(100).default([]),
  claimsToAdd: z.array(CanvasReasoningClaimDraftSchema).max(200).default([]),
  contradictions: z.array(CanvasReasoningContradictionSchema).max(32).default([]),
  unresolved: z.array(CanvasReasoningUnresolvedSchema).max(32).default([]),
  confidence: ConfidenceSchema.default(0.5),
});
export type CanvasReasoningDelta = z.infer<typeof CanvasReasoningDeltaSchema>;

export const CanvasReasoningStateSchema = z.object({
  schemaVersion: z.literal(1),
  boardId: z.string().min(1).max(120),
  revisionHash: z.string().min(1).max(200),
  question: z.string().max(2000),
  entities: z.array(CanvasReasoningEntitySchema).max(100),
  claims: z.array(CanvasReasoningClaimSchema).max(200),
  contradictions: z.array(CanvasReasoningContradictionSchema).max(32),
  unresolved: z.array(CanvasReasoningUnresolvedSchema).max(32),
  coveredChunks: z.array(z.string().min(1).max(120)).max(64),
  calls: z.number().int().min(0),
  needsUser: z.boolean().optional(),
});
export type CanvasReasoningState = z.infer<typeof CanvasReasoningStateSchema>;

export const CanvasChunkSchema = z.object({
  id: z.string().min(1).max(120),
  bounds: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  }),
  sourceIds: z.array(SourceIdSchema).min(1).max(200),
  labels: z.array(z.string().max(200)).max(40),
  detail: z.string().max(8000),
  /** Set by the deterministic chunk builder; the loop needs it to order and to exit early. */
  relevance: z.number().min(0).max(1).optional(),
});
export type CanvasChunk = z.infer<typeof CanvasChunkSchema>;

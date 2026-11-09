import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(), z.string().max(12_000), z.number().finite(), z.boolean(),
  z.array(jsonValue).max(500),
  z.record(z.string().max(200), jsonValue),
]));
const jsonObject = z.record(z.string().max(200), jsonValue);

export const ActivitySourceReferenceSchema = z.object({
  sourceRef: z.string().trim().min(1).max(2_000),
  excerpt: z.string().trim().min(1).max(3_000),
}).strict();

export const ActivityObjectiveSchema = z.object({
  id,
  concept: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(1_000),
  sourceRefs: z.array(ActivitySourceReferenceSchema).min(1).max(10),
}).strict();

export const ActivityArtifactSchema = z.object({
  id,
  capabilityId: id,
  config: jsonObject,
  editablePaths: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
}).strict();

export const ActivityCheckerSchema = z.object({
  id,
  capabilityId: id,
  config: jsonObject,
}).strict();

export const ActivityTaskSchema = z.object({
  id,
  objectiveId: id,
  prompt: z.string().trim().min(1).max(2_000),
  checkerId: id,
  artifactIds: z.array(id).min(1).max(30),
  hints: z.array(z.string().trim().min(1).max(1_000)).max(5).default([]),
  assessment: z.object({ mastery: z.enum(["bkt", "none"]) }).strict(),
}).strict();

export const ActivitySpecSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().positive().max(1_000_000),
  courseId: id,
  lessonId: id,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000),
  objectives: z.array(ActivityObjectiveSchema).min(1).max(20),
  artifacts: z.array(ActivityArtifactSchema).min(1).max(30),
  checkers: z.array(ActivityCheckerSchema).min(1).max(30),
  tasks: z.array(ActivityTaskSchema).min(1).max(30),
  interactions: z.object({ allowMove: z.boolean(), allowDrawing: z.boolean() }).strict(),
  transfer: jsonObject.optional(),
}).strict();

export const CheckerOutcomeSchema = z.enum(["correct", "incorrect", "unknown", "unsupported"]);
export const ActivityCheckerResultSchema = z.object({
  status: CheckerOutcomeSchema,
  checkerId: id,
  checkerVersion: z.number().int().positive(),
  summary: z.string().trim().min(1).max(1_000),
  details: jsonObject.optional(),
}).strict();

export const ActivityResponseSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
]);

export const ActivityAttemptSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  activityId: id,
  activityVersion: z.number().int().positive(),
  courseId: id,
  lessonId: id,
  canvasId: id,
  canvasRevision: z.number().int().nonnegative(),
  status: z.enum(["active", "completed"]),
  currentTaskIndex: z.number().int().nonnegative(),
  currentTaskId: id.nullable(),
  artifactBindings: z.record(id, z.record(id, id)),
  responses: z.array(z.object({
    taskId: id,
    response: ActivityResponseSchema,
    result: ActivityCheckerResultSchema,
    canvasRevision: z.number().int().positive(),
    submittedAt: z.string().datetime(),
    learningEventId: id.optional(),
  }).strict()).max(200),
  hintsUsed: z.array(z.object({ taskId: id, hintIndex: z.number().int().nonnegative() }).strict()).max(150),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const LearningEventSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  courseId: id,
  lessonId: id,
  activityAttemptId: id,
  activityId: id,
  activityVersion: z.number().int().positive(),
  objectiveId: id,
  conceptId: id,
  taskId: id,
  sourceRefs: z.array(z.object({ sourceRef: id, title: z.string().trim().min(1).max(240), excerpt: z.string().trim().min(1).max(3_000) }).strict()).min(1).max(10),
  canvas: z.object({ id, revision: z.number().int().positive() }).strict(),
  outcome: z.object({
    checkerId: id,
    checkerVersion: z.number().int().positive(),
    status: z.enum(["correct", "incorrect"]),
    response: ActivityResponseSchema,
    details: jsonObject.optional(),
  }).strict(),
  mastery: z.object({ previous: z.number().min(0).max(1), value: z.number().min(0).max(1) }).strict(),
  occurredAt: z.string().datetime(),
}).strict();

export type ActivitySourceReference = z.infer<typeof ActivitySourceReferenceSchema>;
export type ActivityObjective = z.infer<typeof ActivityObjectiveSchema>;
export type ActivityArtifact = z.infer<typeof ActivityArtifactSchema>;
export type ActivityChecker = z.infer<typeof ActivityCheckerSchema>;
export type ActivityTask = z.infer<typeof ActivityTaskSchema>;
export type ActivitySpec = z.infer<typeof ActivitySpecSchema>;
export type ActivityCheckerResult = z.infer<typeof ActivityCheckerResultSchema>;
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;
export type ActivityAttempt = z.infer<typeof ActivityAttemptSchema>;
export type LearningEvent = z.infer<typeof LearningEventSchema>;

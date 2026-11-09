import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { emptyCanvasDocument, parseCanvasDocument, type CanvasDocument } from "../../../src/canvas/model.js";
import { stableJson } from "../../../src/canvas/stable-json.js";
import { ActivityAttemptSchema, ActivityCheckerResultSchema, ActivityResponseSchema, ActivitySpecSchema, LearningEventSchema, type ActivityAttempt, type ActivityCheckerResult, type ActivityResponse, type ActivitySpec, type LearningEvent } from "../../../src/learning/activities/contracts.js";
import { saveCanvasDocument } from "../../canvas-persistence/service.js";
import { LearningService } from "../service.js";
import { artifactCapabilityPaths, artifactContexts, defaultActivityCapabilities, validateCapabilities, type ActivityCapabilityRegistry } from "./capabilities.js";
import { initializeActivitySchema } from "./schema.js";
import { resolveActivitySources, type ResolvedActivitySource } from "./sources.js";

const ScopeSchema = z.object({ courseId: z.string().trim().min(1).max(200), lessonId: z.string().trim().min(1).max(200) }).strict();
const SaveSpecInputSchema = z.object({ ...ScopeSchema.shape, spec: z.unknown() }).strict();
const StartInputSchema = z.object({ ...ScopeSchema.shape, activityId: z.string().trim().min(1).max(200) }).strict();
const SubmitInputSchema = z.object({
  ...ScopeSchema.shape,
  attemptId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200),
  canvasRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
  response: ActivityResponseSchema,
}).strict();
const HintInputSchema = z.object({
  ...ScopeSchema.shape,
  attemptId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200),
  hintIndex: z.number().int().nonnegative().max(4),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).strict();
const SaveActivityCanvasSchema = z.object({
  ...ScopeSchema.shape,
  attemptId: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().nonnegative(),
  document: z.unknown(),
}).strict();

type AttemptRow = { id: string; spec_key: string; course_id: string; lesson_id: string; canvas_id: string; state_json: string; artifact_bindings_json: string; initial_document_json: string; source_snapshot_json: string };
type SpecRow = { spec_key: string; spec_json: string };

export class ActivityServiceError extends Error {
  constructor(message: string, readonly status: number = 400, readonly code?: string) { super(message); this.name = "ActivityServiceError"; }
}

export class LearningActivityService {
  constructor(
    private readonly database: Database.Database,
    private readonly learning: LearningService,
    private readonly now: () => Date = () => new Date(),
    private readonly capabilities: ActivityCapabilityRegistry = defaultActivityCapabilities,
  ) {
    initializeActivitySchema(database);
  }

  saveSpec(raw: unknown) {
    const input = SaveSpecInputSchema.parse(raw);
    let spec = parseSpec(input.spec);
    assertScope(spec.courseId, spec.lessonId, input.courseId, input.lessonId);
    if (!this.database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) throw new ActivityServiceError("Lesson not found in this course.", 404, "lesson_not_found");
    validateCapabilities(spec, this.capabilities);
    resolveActivitySources(this.database, input.courseId, spec.objectives.flatMap((objective) => objective.sourceRefs));
    const current = this.database.prepare("SELECT MAX(version) AS version FROM learning_activity_specs WHERE course_id=? AND lesson_id=? AND id=?").get(input.courseId, input.lessonId, spec.id) as { version: number | null };
    const version = (current.version ?? 0) + 1;
    spec = ActivitySpecSchema.parse({ ...spec, version });
    const specKey = randomUUID();
    const createdAt = this.now().toISOString();
    this.database.prepare("INSERT INTO learning_activity_specs(spec_key,id,version,course_id,lesson_id,spec_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(specKey, spec.id, spec.version, input.courseId, input.lessonId, JSON.stringify(spec), createdAt);
    return { id: spec.id, version: spec.version, courseId: spec.courseId, lessonId: spec.lessonId, title: spec.title, createdAt };
  }

  listSpecs(raw: unknown) {
    const scope = ScopeSchema.parse(raw);
    const rows = this.database.prepare(`SELECT id,version,spec_json,created_at FROM learning_activity_specs
      WHERE course_id=? AND lesson_id=? AND version=(SELECT MAX(version) FROM learning_activity_specs s2 WHERE s2.course_id=? AND s2.lesson_id=? AND s2.id=learning_activity_specs.id)
      ORDER BY created_at DESC`).all(scope.courseId, scope.lessonId, scope.courseId, scope.lessonId) as Array<{ id: string; version: number; spec_json: string; created_at: string }>;
    return rows.map((row) => { const spec = parseSpec(JSON.parse(row.spec_json)); return { id: row.id, version: row.version, title: spec.title, createdAt: row.created_at }; });
  }

  loadSpec(raw: unknown) {
    const input = z.object({ ...ScopeSchema.shape, activityId: z.string().trim().min(1).max(200) }).strict().parse(raw);
    const row = this.latestSpecRow(input.courseId, input.lessonId, input.activityId);
    const spec = parseSpec(JSON.parse(row.spec_json));
    validateCapabilities(spec, this.capabilities);
    const sources = this.resolveSpecSources(spec);
    return { spec, sources };
  }

  async preview(raw: unknown) {
    const input = SaveSpecInputSchema.parse(raw);
    const spec = parseSpec(input.spec);
    assertScope(spec.courseId, spec.lessonId, input.courseId, input.lessonId);
    if (!this.database.prepare("SELECT 1 FROM lessons WHERE course_id=? AND id=?").get(input.courseId, input.lessonId)) throw new ActivityServiceError("Lesson not found in this course.", 404, "lesson_not_found");
    validateCapabilities(spec, this.capabilities);
    const sources = this.resolveSpecSources(spec);
    const { document } = await this.instantiateArtifactScene(spec);
    return { spec, sources, document };
  }

  listAttempts(raw: unknown) {
    const scope = ScopeSchema.parse(raw);
    const rows = this.database.prepare(`SELECT a.state_json,s.spec_json FROM learning_activity_attempts a
      JOIN learning_activity_specs s ON s.spec_key=a.spec_key WHERE a.course_id=? AND a.lesson_id=? ORDER BY a.updated_at DESC LIMIT 30`).all(scope.courseId, scope.lessonId) as Array<{ state_json: string; spec_json: string }>;
    return rows.map((row) => ({ attempt: ActivityAttemptSchema.parse(JSON.parse(row.state_json)), activityTitle: parseSpec(JSON.parse(row.spec_json)).title }));
  }

  async start(raw: unknown) {
    const input = StartInputSchema.parse(raw);
    const row = this.latestSpecRow(input.courseId, input.lessonId, input.activityId);
    const spec = parseSpec(JSON.parse(row.spec_json));
    validateCapabilities(spec, this.capabilities);
    const sourceSnapshot = this.resolveSpecSources(spec);
    const { document, bindings } = await this.instantiateArtifactScene(spec);
    const sourcesJson = JSON.stringify(sourceSnapshot);
    const attemptId = randomUUID();
    const canvasId = randomUUID();
    const createdAt = this.now().toISOString();
    const attempt = ActivityAttemptSchema.parse({
      schemaVersion: 1, id: attemptId, activityId: spec.id, activityVersion: spec.version,
      courseId: spec.courseId, lessonId: spec.lessonId, canvasId, canvasRevision: 0,
      status: "active", currentTaskIndex: 0, currentTaskId: spec.tasks[0]?.id ?? null,
      artifactBindings: bindings, responses: [], hintsUsed: [], createdAt, updatedAt: createdAt,
    });
    const create = this.database.transaction(() => {
      const canvas = saveCanvasDocument(this.database, { id: canvasId, courseId: input.courseId, lessonId: input.lessonId, name: `Activity · ${spec.title}`.slice(0, 120), expectedRevision: 0, document });
      if (canvas.status !== 200 || !canvas.body.revision) throw new ActivityServiceError(canvas.body.error ?? "Activity canvas could not be created.", canvas.status, canvas.body.code);
      const savedAttempt = ActivityAttemptSchema.parse({ ...attempt, canvasRevision: canvas.body.revision });
      this.database.prepare(`INSERT INTO learning_activity_attempts(id,spec_key,course_id,lesson_id,canvas_id,state_json,artifact_bindings_json,initial_document_json,source_snapshot_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(savedAttempt.id, row.spec_key, input.courseId, input.lessonId, canvasId, JSON.stringify(savedAttempt), JSON.stringify(bindings), JSON.stringify(document), sourcesJson, createdAt, createdAt);
      const savedCanvas = this.database.prepare("SELECT id,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(canvasId, input.courseId, input.lessonId) as { id: string; revision: number; document: string };
      return { attempt: savedAttempt, canvas: { id: savedCanvas.id, revision: savedCanvas.revision, document: parseCanvasDocument(JSON.parse(savedCanvas.document)) }, spec, sources: sourceSnapshot };
    });
    return create.immediate();
  }

  resume(raw: unknown) {
    const input = z.object({ ...ScopeSchema.shape, attemptId: z.string().trim().min(1).max(200) }).strict().parse(raw);
    const { attemptRow, spec, canvas } = this.scopedAttempt(input.attemptId, input.courseId, input.lessonId);
    const attempt = ActivityAttemptSchema.parse(JSON.parse(attemptRow.state_json));
    const current = ActivityAttemptSchema.parse({ ...attempt, canvasRevision: canvas.revision });
    const sourceSnapshot = parseSourceSnapshot(attemptRow.source_snapshot_json);
    const currentTask = current.currentTaskId ? spec.tasks[current.currentTaskIndex] ?? null : null;
    return { spec, attempt: current, canvas, currentTask, sources: sourceSnapshot, latestResult: current.responses.at(-1)?.result ?? null };
  }

  async submit(raw: unknown) {
    const input = SubmitInputSchema.parse(raw);
    const duplicate = this.database.prepare("SELECT attempt_id,payload_json FROM learning_activity_attempt_events WHERE idempotency_key=?").get(input.idempotencyKey) as { attempt_id: string; payload_json: string } | undefined;
    if (duplicate) {
      if (duplicate.attempt_id !== input.attemptId) throw new ActivityServiceError("Idempotency key belongs to another attempt.", 409, "idempotency_conflict");
      return JSON.parse(duplicate.payload_json) as { duplicate: boolean; result: ActivityCheckerResult; attempt: ActivityAttempt; learningEvent?: LearningEvent };
    }

    const { attemptRow, spec, canvas } = this.scopedAttempt(input.attemptId, input.courseId, input.lessonId);
    const attempt = ActivityAttemptSchema.parse(JSON.parse(attemptRow.state_json));
    if (attempt.status !== "active" || !attempt.currentTaskId) throw new ActivityServiceError("This activity attempt is already complete.", 409, "attempt_complete");
    if (attempt.currentTaskId !== input.taskId) throw new ActivityServiceError("The submitted task is not the active task.", 409, "task_mismatch");
    if (input.canvasRevision !== canvas.revision) throw new ActivityServiceError("Canvas revision is stale; reload the activity board before submitting.", 409, "stale_revision");

    const document = parseCanvasDocument(canvas.document);
    const initial = parseCanvasDocument(JSON.parse(attemptRow.initial_document_json));
    this.validateInteractions(spec, attempt, initial, document);

    const task = spec.tasks[attempt.currentTaskIndex];
    if (!task || task.id !== input.taskId) throw new ActivityServiceError("The active activity task is unavailable.", 409, "task_mismatch");
    const checkerSpec = spec.checkers.find((checker) => checker.id === task.checkerId);
    if (!checkerSpec) throw new ActivityServiceError("The activity checker is unavailable.", 409, "checker_unavailable");
    const capability = this.capabilities.checker(checkerSpec.capabilityId);
    const config = capability.configSchema.parse(checkerSpec.config) as Record<string, unknown>;
    const artifacts = artifactContexts(spec, attempt.artifactBindings, document.objects, this.capabilities);
    const result = ActivityCheckerResultSchema.parse(await capability.check({ spec: checkerSpec, config, artifacts, response: input.response }));
    const submittedAt = this.nextTimestamp();
    const responseEntry: ActivityAttempt["responses"][number] = { taskId: task.id, response: input.response, result, canvasRevision: canvas.revision, submittedAt };
    const complete = result.status === "correct" && attempt.currentTaskIndex === spec.tasks.length - 1;
    const nextIndex = result.status === "correct" ? attempt.currentTaskIndex + 1 : attempt.currentTaskIndex;
    const sourceSnapshot = parseSourceSnapshot(attemptRow.source_snapshot_json);
    const objective = spec.objectives.find((item) => item.id === task.objectiveId)!;
    const persist = this.database.transaction(() => {
      const existing = this.database.prepare("SELECT attempt_id,payload_json FROM learning_activity_attempt_events WHERE idempotency_key=?").get(input.idempotencyKey) as { attempt_id: string; payload_json: string } | undefined;
      if (existing) {
        if (existing.attempt_id !== attempt.id) throw new ActivityServiceError("Idempotency key belongs to another attempt.", 409, "idempotency_conflict");
        return JSON.parse(existing.payload_json);
      }
      const currentAttempt = this.database.prepare("SELECT state_json FROM learning_activity_attempts WHERE id=? AND course_id=? AND lesson_id=?").get(attempt.id, input.courseId, input.lessonId) as { state_json: string } | undefined;
      if (!currentAttempt || currentAttempt.state_json !== attemptRow.state_json) throw new ActivityServiceError("Activity attempt changed while this answer was being checked; reload before submitting.", 409, "stale_attempt");
      const currentCanvas = this.database.prepare("SELECT revision FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(canvas.id, input.courseId, input.lessonId) as { revision: number } | undefined;
      if (!currentCanvas || currentCanvas.revision !== input.canvasRevision) throw new ActivityServiceError("Canvas revision is stale; reload the activity board before submitting.", 409, "stale_revision");
      let learningEvent: LearningEvent | undefined;
      if (task.assessment.mastery === "bkt" && (result.status === "correct" || result.status === "incorrect")) {
        learningEvent = this.learning.recordActivityEvidence({
          courseId: spec.courseId, lessonId: spec.lessonId,
          activityAttemptId: attempt.id, activityId: spec.id, activityVersion: spec.version,
          objectiveId: objective.id, concept: objective.concept, taskId: task.id,
          sourceRefs: sourceSnapshot[objective.id], canvas: { id: canvas.id, revision: canvas.revision },
          outcome: { checkerId: result.checkerId, checkerVersion: result.checkerVersion, status: result.status, response: input.response, ...(result.details ? { details: result.details } : {}) },
        });
        responseEntry.learningEventId = learningEvent.id;
      }
      const nextAttempt = ActivityAttemptSchema.parse({
        ...attempt,
        canvasRevision: canvas.revision,
        status: complete ? "completed" : "active",
        currentTaskIndex: nextIndex,
        currentTaskId: complete ? null : spec.tasks[nextIndex].id,
        responses: [...attempt.responses, responseEntry],
        updatedAt: submittedAt,
      });
      const payload = { duplicate: false, result, attempt: nextAttempt, ...(learningEvent ? { learningEvent } : {}) };
      this.database.prepare(`INSERT INTO learning_activity_attempt_events(id,attempt_id,idempotency_key,kind,task_id,canvas_revision,payload_json,created_at)
        VALUES(?,?,?,'submission',?,?,?,?)`).run(randomUUID(), attempt.id, input.idempotencyKey, task.id, canvas.revision, JSON.stringify(payload), submittedAt);
      this.database.prepare("UPDATE learning_activity_attempts SET state_json=?,updated_at=? WHERE id=? AND course_id=? AND lesson_id=?")
        .run(JSON.stringify(nextAttempt), submittedAt, attempt.id, input.courseId, input.lessonId);
      return payload;
    });
    return persist.immediate();
  }

  useHint(raw: unknown) {
    const input = HintInputSchema.parse(raw);
    const { attemptRow, spec } = this.scopedAttempt(input.attemptId, input.courseId, input.lessonId);
    const attempt = ActivityAttemptSchema.parse(JSON.parse(attemptRow.state_json));
    if (attempt.status !== "active" || attempt.currentTaskId !== input.taskId) throw new ActivityServiceError("Hints are available only for the active task.", 409, "task_mismatch");
    const task = spec.tasks[attempt.currentTaskIndex];
    const used = attempt.hintsUsed.filter((hint) => hint.taskId === task.id).length;
    if (input.hintIndex !== used || input.hintIndex >= task.hints.length) throw new ActivityServiceError("Hints must be revealed one stage at a time.", 409, "hint_order");
    const createdAt = this.nextTimestamp();
    const nextAttempt = ActivityAttemptSchema.parse({ ...attempt, hintsUsed: [...attempt.hintsUsed, { taskId: task.id, hintIndex: input.hintIndex }], updatedAt: createdAt });
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const payload = { taskId: task.id, hintIndex: input.hintIndex, hint: task.hints[input.hintIndex], attempt: nextAttempt };
    const persist = this.database.transaction(() => {
      const existing = this.database.prepare("SELECT attempt_id,payload_json FROM learning_activity_attempt_events WHERE idempotency_key=?").get(idempotencyKey) as { attempt_id: string; payload_json: string } | undefined;
      if (existing) {
        if (existing.attempt_id !== attempt.id) throw new ActivityServiceError("Idempotency key belongs to another attempt.", 409, "idempotency_conflict");
        return JSON.parse(existing.payload_json);
      }
      const currentAttempt = this.database.prepare("SELECT state_json FROM learning_activity_attempts WHERE id=? AND course_id=? AND lesson_id=?").get(attempt.id, input.courseId, input.lessonId) as { state_json: string } | undefined;
      if (!currentAttempt || currentAttempt.state_json !== attemptRow.state_json) throw new ActivityServiceError("Activity attempt changed; reload before requesting another hint.", 409, "stale_attempt");
      this.database.prepare(`INSERT INTO learning_activity_attempt_events(id,attempt_id,idempotency_key,kind,task_id,canvas_revision,payload_json,created_at)
        VALUES(?,?,?,'hint',?,?,?,?)`).run(randomUUID(), attempt.id, idempotencyKey, task.id, attempt.canvasRevision, JSON.stringify(payload), createdAt);
      this.database.prepare("UPDATE learning_activity_attempts SET state_json=?,updated_at=? WHERE id=? AND course_id=? AND lesson_id=?")
        .run(JSON.stringify(nextAttempt), createdAt, attempt.id, input.courseId, input.lessonId);
      return payload;
    });
    return persist.immediate();
  }

  saveCanvas(raw: unknown) {
    const input = SaveActivityCanvasSchema.parse(raw);
    const { attemptRow } = this.scopedAttempt(input.attemptId, input.courseId, input.lessonId);
    const state = ActivityAttemptSchema.parse(JSON.parse(attemptRow.state_json));
    this.validateActivityCanvasWrite({ id: state.canvasId, courseId: input.courseId, lessonId: input.lessonId, document: input.document });
    const result = saveCanvasDocument(this.database, {
      id: state.canvasId, courseId: input.courseId, lessonId: input.lessonId, name: `Activity · ${state.activityId}`.slice(0, 120),
      expectedRevision: input.expectedRevision, document: input.document,
    });
    if (result.status !== 200) throw new ActivityServiceError(result.body.error ?? "Canvas save failed.", result.status, result.body.code);
    return result.body;
  }

  validateCanvasSave(raw: unknown) {
    const input = z.object({ id: z.string().trim().min(1).max(512), ...ScopeSchema.shape, document: z.unknown() }).passthrough().parse(raw);
    this.validateActivityCanvasWrite(input);
  }

  tutorContext(raw: unknown) {
    const input = z.object({ attemptId: z.string().trim().min(1).max(200), courseId: z.string().trim().min(1).max(200), lessonId: z.string().trim().min(1).max(200) }).strict().parse(raw);
    const { attemptRow, spec, canvas } = this.scopedAttempt(input.attemptId, input.courseId, input.lessonId);
    const attempt = ActivityAttemptSchema.parse(JSON.parse(attemptRow.state_json));
    const task = attempt.currentTaskId ? spec.tasks[attempt.currentTaskIndex] : undefined;
    if (!task) return { attemptId: attempt.id, status: attempt.status, activityTitle: spec.title, canvasId: canvas.id, canvasRevision: canvas.revision, observedResponses: attempt.responses.slice(-3) };
    const document = parseCanvasDocument(canvas.document);
    const required = new Set(task.artifactIds);
    const objectIds = new Set([...required].flatMap((artifactId) => Object.values(attempt.artifactBindings[artifactId] ?? {})));
    const objective = spec.objectives.find((item) => item.id === task.objectiveId)!;
    const checker = spec.checkers.find((item) => item.id === task.checkerId)!;
    return {
      attemptId: attempt.id,
      status: attempt.status,
      activity: { id: spec.id, version: spec.version, title: spec.title },
      objective: { id: objective.id, text: objective.text, sourceRefs: attemptRow.source_snapshot_json ? parseSourceSnapshot(attemptRow.source_snapshot_json)[objective.id] : [] },
      task: { id: task.id, prompt: task.prompt, checkerId: checker.capabilityId },
      canvas: { id: canvas.id, revision: canvas.revision, objects: document.objects.filter((item) => objectIds.has(item.id)) },
      observedResponses: attempt.responses.slice(-3).map((item) => ({ taskId: item.taskId, response: item.response, checker: item.result })),
      uncertainty: attempt.responses.slice(-3).filter((item) => item.result.status === "unknown" || item.result.status === "unsupported").map((item) => item.result.summary),
      inferredMisconceptions: [],
    };
  }

  private latestSpecRow(courseId: string, lessonId: string, activityId: string) {
    const row = this.database.prepare(`SELECT spec_key,spec_json FROM learning_activity_specs WHERE course_id=? AND lesson_id=? AND id=? ORDER BY version DESC LIMIT 1`)
      .get(courseId, lessonId, activityId) as SpecRow | undefined;
    if (!row) throw new ActivityServiceError("Activity was not found in this course and lesson.", 404, "activity_not_found");
    return row;
  }

  private scopedAttempt(attemptId: string, courseId: string, lessonId: string) {
    const row = this.database.prepare(`SELECT * FROM learning_activity_attempts WHERE id=? AND course_id=? AND lesson_id=?`).get(attemptId, courseId, lessonId) as AttemptRow | undefined;
    if (!row) throw new ActivityServiceError("Activity attempt was not found in this course and lesson.", 404, "attempt_not_found");
    const specRow = this.database.prepare("SELECT spec_json FROM learning_activity_specs WHERE spec_key=? AND course_id=? AND lesson_id=?").get(row.spec_key, courseId, lessonId) as { spec_json: string } | undefined;
    if (!specRow) throw new ActivityServiceError("Activity specification is no longer available in this course.", 404, "activity_not_found");
    const spec = parseSpec(JSON.parse(specRow.spec_json));
    validateCapabilities(spec, this.capabilities);
    const canvasRow = this.database.prepare("SELECT id,revision,document FROM canvases WHERE id=? AND course_id=? AND lesson_id=?").get(row.canvas_id, courseId, lessonId) as { id: string; revision: number; document: string } | undefined;
    if (!canvasRow) throw new ActivityServiceError("Activity canvas was not found in this course and lesson.", 404, "canvas_not_found");
    const canvas = { id: canvasRow.id, revision: canvasRow.revision, document: parseCanvasDocument(JSON.parse(canvasRow.document)) };
    return { attemptRow: row, spec, canvas };
  }

  private resolveSpecSources(spec: ActivitySpec) {
    return Object.fromEntries(spec.objectives.map((objective) => [objective.id, resolveActivitySources(this.database, spec.courseId, objective.sourceRefs)]));
  }

  private async instantiateArtifactScene(spec: ActivitySpec) {
    const objects: CanvasDocument["objects"] = [];
    const bindings: ActivityAttempt["artifactBindings"] = {};
    for (const definition of spec.artifacts) {
      const capability = this.capabilities.artifact(definition.capabilityId);
      const config = capability.configSchema.parse(definition.config) as Record<string, unknown>;
      const instance = await capability.create(config);
      const roles = Object.fromEntries(Object.entries(instance.objects).map(([role, object]) => [role, object.id]));
      if (!Object.keys(roles).length || Object.keys(roles).length > 10) throw new ActivityServiceError(`Artifact capability ${definition.capabilityId} returned an invalid object set.`);
      bindings[definition.id] = roles;
      objects.push(...Object.values(instance.objects));
    }
    return { document: parseCanvasDocument({ ...emptyCanvasDocument(), objects }), bindings };
  }

  private validateInteractions(spec: ActivitySpec, attempt: ActivityAttempt, initial: CanvasDocument, current: CanvasDocument) {
    if (!spec.interactions.allowDrawing && stableJson(initial.snapshot) !== stableJson(current.snapshot)) throw new ActivityServiceError("Freehand drawing is outside this activity's interaction policy.", 409, "interaction_not_allowed");
    if (initial.objects.length !== current.objects.length) throw new ActivityServiceError("Adding or removing canvas objects is outside this activity's interaction policy.", 409, "interaction_not_allowed");
    const beforeById = new Map(initial.objects.map((object) => [object.id, object]));
    const afterById = new Map(current.objects.map((object) => [object.id, object]));
    if (beforeById.size !== afterById.size || [...beforeById.keys()].some((id) => !afterById.has(id))) throw new ActivityServiceError("Canvas object identity changed during this activity.", 409, "interaction_not_allowed");
    const artifactByObject = new Map<string, { artifactId: string; role: string }>();
    for (const [artifactId, roles] of Object.entries(attempt.artifactBindings)) for (const [role, id] of Object.entries(roles)) artifactByObject.set(id, { artifactId, role });
    for (const [objectId, before] of beforeById) {
      const after = afterById.get(objectId)!;
      if (before.kind !== after.kind) throw new ActivityServiceError("Canvas artifact type changed during this activity.", 409, "interaction_not_allowed");
      const owner = artifactByObject.get(objectId);
      if (!owner) throw new ActivityServiceError("Canvas object is not owned by this activity.", 409, "interaction_not_allowed");
      const artifact = spec.artifacts.find((item) => item.id === owner.artifactId)!;
      const paths = artifactCapabilityPaths(artifact, this.capabilities);
      const changed = changedPaths(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
      for (const path of changed) {
        if (path === "id" || path === "kind") continue;
        if (spec.interactions.allowMove && (["x", "y", "width", "height", "geometry"].includes(path) || path.startsWith("geometry."))) continue;
        const rolePath = `${owner.role}.${path}`;
        if (paths.editable.some((allowed) => pathCovered(rolePath, allowed)) || paths.derived.some((allowed) => pathCovered(rolePath, allowed))) continue;
        throw new ActivityServiceError(`Changing ${rolePath} is outside this activity's interaction policy.`, 409, "interaction_not_allowed");
      }
    }
  }

  private validateActivityCanvasWrite(input: { id: string; courseId: string; lessonId: string; document: unknown }) {
    const row = this.database.prepare(`SELECT a.*,s.spec_json FROM learning_activity_attempts a JOIN learning_activity_specs s ON s.spec_key=a.spec_key
      WHERE a.canvas_id=? AND a.course_id=? AND a.lesson_id=? ORDER BY a.updated_at DESC LIMIT 1`).get(input.id, input.courseId, input.lessonId) as (AttemptRow & { spec_json: string }) | undefined;
    if (!row) return;
    const attempt = ActivityAttemptSchema.parse(JSON.parse(row.state_json));
    if (attempt.status !== "active") return;
    const spec = parseSpec(JSON.parse(row.spec_json));
    validateCapabilities(spec, this.capabilities);
    this.validateInteractions(spec, attempt, parseCanvasDocument(JSON.parse(row.initial_document_json)), parseCanvasDocument(input.document));
  }

  private nextTimestamp() {
    const current = this.now().getTime();
    const latest = this.database.prepare(`SELECT MAX(value) AS value FROM (
      SELECT MAX(created_at) AS value FROM learning_activity_attempt_events
      UNION ALL SELECT MAX(updated_at) AS value FROM learning_activity_attempts
    )`).get() as { value: string | null };
    const prior = latest.value ? Date.parse(latest.value) : 0;
    return new Date(Math.max(current, Number.isFinite(prior) ? prior + 1 : current)).toISOString();
  }
}

function parseSpec(value: unknown) {
  if (!isJsonValue(value, 0, { count: 0 })) throw new ActivityServiceError("Activity specifications must contain bounded JSON data only.", 400, "invalid_spec");
  if (JSON.stringify(value).length > 64_000) throw new ActivityServiceError("Activity specification exceeds the 64 KB limit.", 400, "invalid_spec");
  const spec = ActivitySpecSchema.parse(value);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(spec.artifacts.map((item) => item.id)) || !unique(spec.checkers.map((item) => item.id)) || !unique(spec.tasks.map((item) => item.id))) throw new ActivityServiceError("Activity artifact, checker, and task IDs must be unique.", 400, "invalid_spec");
  return spec;
}

function assertScope(specCourseId: string, specLessonId: string, courseId: string, lessonId: string) {
  if (specCourseId !== courseId || specLessonId !== lessonId) throw new ActivityServiceError("Activity scope does not match the selected course and lesson.", 403, "scope_mismatch");
}

function parseSourceSnapshot(value: string) {
  const parsed = JSON.parse(value) as Record<string, ResolvedActivitySource[]>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ActivityServiceError("Saved activity source provenance is invalid.", 500, "invalid_provenance");
  return parsed;
}

function changedPaths(before: Record<string, unknown>, after: Record<string, unknown>, prefix = ""): string[] {
  if (stableJson(before) === stableJson(after)) return [];
  const beforeObject = isRecord(before), afterObject = isRecord(after);
  if (!beforeObject || !afterObject) return prefix ? [prefix] : [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const paths: string[] = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in before) || !(key in after)) { paths.push(path); continue; }
    const left = before[key], right = after[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      if (stableJson(left) !== stableJson(right)) paths.push(path);
    } else if (isRecord(left) && isRecord(right)) paths.push(...changedPaths(left, right, path));
    else if (stableJson(left) !== stableJson(right)) paths.push(path);
  }
  return paths;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function pathCovered(path: string, allowed: string) { return path === allowed || path.startsWith(`${allowed}.`); }
function isJsonValue(value: unknown, depth: number, state: { count: number }): boolean {
  if (++state.count > 10_000 || depth > 24) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 12_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 500 && value.every((item) => isJsonValue(item, depth + 1, state));
  if (isRecord(value)) return Object.entries(value).length <= 200 && Object.entries(value).every(([key, item]) => key.length <= 200 && !["__proto__", "prototype", "constructor"].includes(key) && isJsonValue(item, depth + 1, state));
  return false;
}

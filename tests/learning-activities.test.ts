import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { emptyCanvasDocument, parseCanvasDocument } from "../src/canvas/model.js";
import { makeSourceReference } from "../server/document-intelligence/service.js";
import { LearningService } from "../server/learning/service.js";
import { LearningActivityService } from "../server/learning/activities/service.js";
import type { ActivitySpec } from "../src/learning/activities/contracts.js";

const sourceExcerpt = "Constant net force changes velocity at a rate determined by mass.";
const sourceRef = makeSourceReference({ documentId: "doc-a", unitType: "page", unitNumber: 2, chunkIndex: 0 });
const now = () => new Date("2026-11-09T12:00:00.000Z");
let database: Database.Database | undefined;
let temp: string | undefined;

function setup(path = ":memory:") {
  database = new Database(path);
  database.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,filename TEXT,mime_type TEXT,storage_path TEXT,content_hash TEXT);
    CREATE TABLE di_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,unit_type TEXT,unit_number INTEGER,chunk_index INTEGER,content TEXT);
    CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,name TEXT,document TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(course_id,lesson_id) REFERENCES lessons(course_id,id));
    INSERT INTO courses VALUES('course-a','Physics','','#000000');
    INSERT INTO courses VALUES('course-b','Other course','','#ffffff');
    INSERT INTO lessons VALUES('lesson-a','course-a','Motion');
    INSERT INTO lessons VALUES('lesson-b','course-b','Other lesson');
    INSERT INTO di_documents VALUES('doc-a','course-a','Motion notes','motion.pdf','application/pdf','', 'hash-a');
    INSERT INTO di_documents VALUES('doc-b','course-b','Other notes','other.pdf','application/pdf','', 'hash-b');
    INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES('doc-a','course-a','page',2,0,'${sourceExcerpt}');
    INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES('doc-b','course-b','page',2,0,'${sourceExcerpt}');`);
  const learning = new LearningService(database, now);
  const activities = new LearningActivityService(database, learning, now);
  return { database, learning, activities };
}

function objective(id: string, concept: string): ActivitySpec["objectives"][number] {
  return { id, concept, text: `Interpret ${concept}.`, sourceRefs: [{ sourceRef, excerpt: sourceExcerpt }] };
}

function forceSpec(id = "force-motion", mass = 2, right = 8, left = -2): ActivitySpec {
  return {
    schemaVersion: 1, id, version: 1, courseId: "course-a", lessonId: "lesson-a", title: "Force and motion", description: "Relate signed forces to acceleration and velocity-time graphs.",
    objectives: [objective("newton-2", "net force and acceleration"), objective("velocity-graph", "velocity-time graphs")],
    artifacts: [
      { id: "mass", capabilityId: "canvas.measurement", config: { label: "Mass", value: mass, units: "kg" }, editablePaths: ["object.value"] },
      { id: "velocity", capabilityId: "canvas.vector", config: { label: "Initial velocity", components: [3, 0, 0], units: "m/s" }, editablePaths: ["object.components"] },
      { id: "force-right", capabilityId: "canvas.force-vector", config: { label: "Applied force", components: [right, 0, 0], units: "N" }, editablePaths: ["object.components"] },
      { id: "force-left", capabilityId: "canvas.force-vector", config: { label: "Opposing force", components: [left, 0, 0], units: "N" }, editablePaths: ["object.components"] },
      { id: "motion-graph", capabilityId: "canvas.linear-graph", config: { slope: (right + left) / mass, intercept: 3, xRange: [0, 5], xLabel: "time (s)", yLabel: "velocity (m/s)" }, editablePaths: ["equation.variables", "equation.mathWorkspace.parameters"] },
    ],
    checkers: [
      { id: "acceleration-check", capabilityId: "physics.force-motion", config: { mode: "acceleration", massArtifactId: "mass", forceArtifactIds: ["force-right", "force-left"], tolerance: 0.01 } },
      { id: "velocity-check", capabilityId: "physics.force-motion", config: { mode: "velocity-after-time", massArtifactId: "mass", velocityArtifactId: "velocity", forceArtifactIds: ["force-right", "force-left"], timeSeconds: 2, tolerance: 0.01 } },
      { id: "graph-slope-check", capabilityId: "physics.force-motion", config: { mode: "velocity-time-graph", graphMode: "slope", massArtifactId: "mass", velocityArtifactId: "velocity", forceArtifactIds: ["force-right", "force-left"], graphArtifactId: "motion-graph", tolerance: 0.01 } },
      { id: "graph-intercept-check", capabilityId: "physics.force-motion", config: { mode: "velocity-time-graph", graphMode: "intercept", massArtifactId: "mass", velocityArtifactId: "velocity", forceArtifactIds: ["force-right", "force-left"], graphArtifactId: "motion-graph", tolerance: 0.01 } },
    ],
    tasks: [
      { id: "predict-acceleration", objectiveId: "newton-2", prompt: "Use the force diagram to predict acceleration in m/s².", checkerId: "acceleration-check", artifactIds: ["mass", "force-right", "force-left"], hints: ["Add the signed horizontal force components, then divide by mass."], assessment: { mastery: "bkt" } },
      { id: "predict-final-velocity", objectiveId: "newton-2", prompt: "Using the initial velocity and net force, predict velocity after 2 seconds.", checkerId: "velocity-check", artifactIds: ["mass", "velocity", "force-right", "force-left"], hints: ["Find acceleration first, then use final velocity = initial velocity + acceleration × time."], assessment: { mastery: "bkt" } },
      { id: "match-motion-graph-slope", objectiveId: "velocity-graph", prompt: "Update the graph to match the force model, then enter its slope in m/s².", checkerId: "graph-slope-check", artifactIds: ["mass", "velocity", "force-right", "force-left", "motion-graph"], hints: ["A velocity-time graph's slope equals acceleration."], assessment: { mastery: "bkt" } },
      { id: "match-motion-graph-intercept", objectiveId: "velocity-graph", prompt: "Set the graph's y-intercept to the initial velocity and enter that value in m/s.", checkerId: "graph-intercept-check", artifactIds: ["mass", "velocity", "force-right", "force-left", "motion-graph"], hints: ["At time zero, velocity equals the initial velocity."], assessment: { mastery: "bkt" } },
    ],
    interactions: { allowMove: true, allowDrawing: false },
  };
}

function graphSpec(id = "graph-interpretation", slope = 2, intercept = 3, mode: "slope" | "intercept" | "value" = "slope", x = 0): ActivitySpec {
  const task = mode === "slope" ? "What is the line's slope?" : mode === "intercept" ? "What is the y-intercept?" : `What value does the graph predict at x=${x}?`;
  return {
    schemaVersion: 1, id, version: 1, courseId: "course-a", lessonId: "lesson-a", title: "Interpret a linear graph", description: "Use a linked equation and graph to interpret a linear relationship.",
    objectives: [objective("linear-graphs", "linear graph interpretation")],
    artifacts: [{ id: "line", capabilityId: "canvas.linear-graph", config: { slope, intercept, xRange: [-5, 5], xLabel: "x", yLabel: "y" }, editablePaths: ["equation.variables", "equation.mathWorkspace.parameters"] }],
    checkers: [{ id: "line-check", capabilityId: "math.graph-interpretation", config: { mode, graphArtifactId: "line", atX: x, tolerance: 0.01 } }],
    tasks: [{ id: "interpret-line", objectiveId: "linear-graphs", prompt: task, checkerId: "line-check", artifactIds: ["line"], hints: ["Use the linked equation and the marked axes."], assessment: { mastery: "bkt" } }],
    interactions: { allowMove: true, allowDrawing: false },
  };
}

async function saveSpec(activities: LearningActivityService, spec: ActivitySpec) {
  return activities.saveSpec({ courseId: "course-a", lessonId: "lesson-a", spec });
}

afterEach(() => {
  database?.close();
  database = undefined;
  if (temp) for (const path of [temp, `${temp}-wal`, `${temp}-shm`]) try { unlinkSync(path); } catch {}
  temp = undefined;
});

describe("reusable learning activity runtime", () => {
  it("runs force and graph variants from validated data through the same lifecycle", async () => {
    const { activities } = setup();
    await saveSpec(activities, forceSpec());
    await saveSpec(activities, forceSpec("force-variant", 5, -6, -4));
    await saveSpec(activities, graphSpec());
    await saveSpec(activities, graphSpec("graph-variant", -4, 1, "value", 2));

    const force = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "force-motion" });
    expect(force.attempt.status).toBe("active");
    expect(force.canvas.document.objects.map((item) => item.kind)).toEqual(["measurement", "vector", "force", "force", "equation", "graph"]);
    const first = await activities.submit({ attemptId: force.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: force.attempt.canvasRevision, idempotencyKey: "force-1", response: "3" });
    expect(first).toMatchObject({ result: { status: "correct" }, attempt: { currentTaskId: "predict-final-velocity" } });
    const second = await activities.submit({ attemptId: force.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-final-velocity", canvasRevision: first.attempt.canvasRevision, idempotencyKey: "force-2", response: "9" });
    expect(second).toMatchObject({ result: { status: "correct" }, attempt: { currentTaskId: "match-motion-graph-slope" } });
    const third = await activities.submit({ attemptId: force.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "match-motion-graph-slope", canvasRevision: second.attempt.canvasRevision, idempotencyKey: "force-3", response: "3" });
    expect(third).toMatchObject({ result: { status: "correct" }, attempt: { currentTaskId: "match-motion-graph-intercept" } });
    const fourth = await activities.submit({ attemptId: force.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "match-motion-graph-intercept", canvasRevision: third.attempt.canvasRevision, idempotencyKey: "force-4", response: "3" });
    expect(fourth).toMatchObject({ result: { status: "correct" }, attempt: { status: "completed" } });
    expect(activities.resume({ attemptId: force.attempt.id, courseId: "course-a", lessonId: "lesson-a" }).attempt).toMatchObject({ status: "completed" });

    const forceVariant = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "force-variant" });
    const forceVariantResult = await activities.submit({ attemptId: forceVariant.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: forceVariant.attempt.canvasRevision, idempotencyKey: "force-variant-1", response: "-2" });
    expect(forceVariantResult.result.status).toBe("correct");

    const graph = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "graph-interpretation" });
    const graphResult = await activities.submit({ attemptId: graph.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "interpret-line", canvasRevision: graph.attempt.canvasRevision, idempotencyKey: "graph-1", response: "2" });
    expect(graphResult).toMatchObject({ result: { status: "correct" }, attempt: { status: "completed" } });
    const graphVariant = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "graph-variant" });
    const graphVariantResult = await activities.submit({ attemptId: graphVariant.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "interpret-line", canvasRevision: graphVariant.attempt.canvasRevision, idempotencyKey: "graph-variant-1", response: "-7" });
    expect(graphVariantResult.result.status).toBe("correct");
  });

  it("checks current canvas parameters and rejects stale or disallowed revisions", async () => {
    const { database, activities } = setup();
    await saveSpec(activities, forceSpec());
    const started = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "force-motion" });
    const preview = await activities.preview({ courseId: "course-a", lessonId: "lesson-a", spec: forceSpec("preview-only") });
    expect(preview.document.objects).toHaveLength(6);
    expect(database.prepare("SELECT count(*) total FROM learning_activity_specs").get()).toEqual({ total: 1 });
    const forceId = started.attempt.artifactBindings["force-right"].object;
    const changed = parseCanvasDocument({ ...started.canvas.document, objects: started.canvas.document.objects.map((item) => item.id === forceId && item.kind === "force" ? { ...item, components: [10, 0, 0] } : item) });
    const staleSave = activities.saveCanvas({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", expectedRevision: started.attempt.canvasRevision, document: changed });
    expect(staleSave.revision).toBe(2);
    await expect(activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: started.attempt.canvasRevision, idempotencyKey: "stale", response: "9" })).rejects.toThrow(/stale/i);
    const current = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: staleSave.revision!, idempotencyKey: "current", response: "4" });
    expect(current.result.status).toBe("correct");
    expect(database.prepare("SELECT count(*) total FROM learning_events").get()).toEqual({ total: 1 });
    expect(() => activities.saveCanvas({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", expectedRevision: current.attempt.canvasRevision, document: { ...changed, objects: [...changed.objects, { ...changed.objects[0], id: "foreign-object" }] } })).toThrow(/interaction/i);
  });

  it("requires the velocity-time graph to match the edited force and initial-velocity model", async () => {
    const { activities } = setup();
    await saveSpec(activities, forceSpec());
    const started = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "force-motion" });
    const forceId = started.attempt.artifactBindings["force-right"].object;
    const changedForce = parseCanvasDocument({ ...started.canvas.document, objects: started.canvas.document.objects.map((item) => item.id === forceId && item.kind === "force" ? { ...item, components: [10, 0, 0] } : item) });
    const forceSave = activities.saveCanvas({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", expectedRevision: started.attempt.canvasRevision, document: changedForce });
    const acceleration = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: forceSave.revision!, idempotencyKey: "model-a", response: "4" });
    const velocity = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-final-velocity", canvasRevision: acceleration.attempt.canvasRevision, idempotencyKey: "model-v", response: "11" });
    const staleGraph = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "match-motion-graph-slope", canvasRevision: velocity.attempt.canvasRevision, idempotencyKey: "model-g1", response: "4" });
    expect(staleGraph.result).toMatchObject({ status: "incorrect", details: { expected: 4, graphValue: 3 } });

    const equationId = started.attempt.artifactBindings["motion-graph"].equation;
    const correctedGraph = parseCanvasDocument({ ...changedForce, objects: changedForce.objects.map((item) => item.id === equationId && item.kind === "equation" && item.mathWorkspace ? { ...item, variables: { ...item.variables, m: 4 }, mathWorkspace: { ...item.mathWorkspace, parameters: { ...item.mathWorkspace.parameters, m: { ...item.mathWorkspace.parameters.m, value: 4 } } } } : item) });
    const graphSave = activities.saveCanvas({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", expectedRevision: velocity.attempt.canvasRevision, document: correctedGraph });
    const validGraph = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "match-motion-graph-slope", canvasRevision: graphSave.revision!, idempotencyKey: "model-g2", response: "4" });
    expect(validGraph.result.status).toBe("correct");
    const intercept = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "match-motion-graph-intercept", canvasRevision: validGraph.attempt.canvasRevision, idempotencyKey: "model-b", response: "3" });
    expect(intercept).toMatchObject({ result: { status: "correct" }, attempt: { status: "completed" } });
  });

  it("keeps unsupported outcomes out of mastery and accepts hints one stage at a time", async () => {
    const { database, activities } = setup();
    await saveSpec(activities, forceSpec());
    const started = await activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "force-motion" });
    const massId = started.attempt.artifactBindings.mass.object;
    const invalidMass = parseCanvasDocument({ ...started.canvas.document, objects: started.canvas.document.objects.map((item) => item.id === massId && item.kind === "measurement" ? { ...item, value: 0 } : item) });
    const saved = activities.saveCanvas({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", expectedRevision: started.attempt.canvasRevision, document: invalidMass });
    expect(activities.useHint({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", hintIndex: 0 })).toMatchObject({ hintIndex: 0 });
    expect(() => activities.useHint({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", hintIndex: 1 })).toThrow(/hint/i);
    const result = await activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "predict-acceleration", canvasRevision: saved.revision!, idempotencyKey: "unknown", response: "0" });
    expect(result.result.status).toBe("unknown");
    expect(database.prepare("SELECT count(*) total FROM learning_events").get()).toEqual({ total: 0 });
    expect(database.prepare("SELECT count(*) total FROM mastery_updates").get()).toEqual({ total: 0 });
  });

  it("rejects invalid specs and cross-course sources before persisting or creating a canvas", async () => {
    const { database, activities } = setup();
    const invalid = { ...forceSpec(), schemaVersion: 77 };
    expect(() => activities.saveSpec({ courseId: "course-a", lessonId: "lesson-a", spec: invalid })).toThrow();
    const crossCourse = { ...forceSpec("cross-course"), objectives: [{ ...objective("newton-2", "net force and acceleration"), sourceRefs: [{ sourceRef: makeSourceReference({ documentId: "doc-b", unitType: "page", unitNumber: 2, chunkIndex: 0 }), excerpt: sourceExcerpt }] }, objective("velocity-graph", "velocity-time graphs")] };
    expect(() => activities.saveSpec({ courseId: "course-a", lessonId: "lesson-a", spec: crossCourse })).toThrow(/source|course/i);
    expect(database.prepare("SELECT count(*) total FROM learning_activity_specs").get()).toEqual({ total: 0 });
    expect(database.prepare("SELECT count(*) total FROM canvases").get()).toEqual({ total: 0 });
    expect(database.prepare("SELECT count(*) total FROM mastery_updates").get()).toEqual({ total: 0 });
  });

  it("persists specs, canvas state, attempts, source evidence, and mastery across a database reopen", async () => {
    temp = join(process.cwd(), `.test-activities-${randomUUID()}.sqlite`);
    const initial = setup(temp);
    await saveSpec(initial.activities, graphSpec());
    const started = await initial.activities.start({ courseId: "course-a", lessonId: "lesson-a", activityId: "graph-interpretation" });
    const checked = await initial.activities.submit({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a", taskId: "interpret-line", canvasRevision: started.attempt.canvasRevision, idempotencyKey: "durable", response: "2" });
    expect(checked.result.status).toBe("correct");
    initial.database.close();
    database = new Database(temp);
    const learning = new LearningService(database, now);
    const activities = new LearningActivityService(database, learning, now);
    expect(activities.resume({ attemptId: started.attempt.id, courseId: "course-a", lessonId: "lesson-a" })).toMatchObject({ attempt: { status: "completed" }, spec: { id: "graph-interpretation", version: 1 } });
    expect(database.prepare("SELECT source_refs_json,mastery_after FROM learning_events").get()).toMatchObject({ source_refs_json: expect.stringContaining("doc-a"), mastery_after: expect.any(Number) });
    expect(() => activities.resume({ attemptId: started.attempt.id, courseId: "course-b", lessonId: "lesson-b" })).toThrow(/not found|scope/i);
  });
});

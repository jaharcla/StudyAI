import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { LearningService } from "../server/learning/service.js";
import { LearningActivityService } from "../server/learning/activities/service.js";
import { ActivityAttemptSchema, ActivitySpecSchema } from "../src/learning/activities/contracts.js";
import type { ActivitySpec } from "../src/learning/activities/contracts.js";

const excerpt = "Constant net force changes velocity at a rate determined by mass.";
const sourceRef = "studyai://document/doc-a/page/2?chunk=0";
const now = () => new Date("2026-11-24T12:00:00.000Z");
let database: Database.Database | undefined;

function setup() {
  database = new Database(":memory:");
  database.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE courses(id TEXT PRIMARY KEY,title TEXT,code TEXT,color TEXT);
    CREATE TABLE lessons(id TEXT,course_id TEXT,title TEXT,PRIMARY KEY(course_id,id));
    CREATE TABLE di_documents(id TEXT PRIMARY KEY,course_id TEXT,title TEXT,filename TEXT,mime_type TEXT,storage_path TEXT,content_hash TEXT);
    CREATE TABLE di_chunks(id INTEGER PRIMARY KEY,document_id TEXT,course_id TEXT,unit_type TEXT,unit_number INTEGER,chunk_index INTEGER,content TEXT);
    CREATE TABLE canvases(id TEXT PRIMARY KEY,course_id TEXT,lesson_id TEXT,name TEXT,document TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(course_id,lesson_id) REFERENCES lessons(course_id,id));
    INSERT INTO courses VALUES('course-a','Physics','','#000000');
    INSERT INTO lessons VALUES('lesson-a','course-a','Motion');
    INSERT INTO di_documents VALUES('doc-a','course-a','Motion notes','motion.pdf','application/pdf','','hash-a');
    INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES('doc-a','course-a','page',2,0,'${excerpt}');`);
  const learning = new LearningService(database, now);
  return { database, activities: new LearningActivityService(database, learning, now) };
}

const replayDescriptor = {
  exampleId: "worked-friction",
  sourceRefs: [sourceRef],
  states: [
    { id: "setup", narration: "Set up the incline.", reveal: ["question"], highlight: [] },
    { id: "forces", narration: "Add the forces.", reveal: ["gravity", "friction"], highlight: ["friction"] },
  ],
};

function replaySpec(): ActivitySpec {
  return {
    schemaVersion: 1, id: "steppable-activity", version: 1, courseId: "course-a", lessonId: "lesson-a",
    title: "Steppable friction", description: "Replay a worked example.",
    objectives: [{ id: "obj-1", concept: "friction", text: "Explain friction.", sourceRefs: [{ sourceRef, excerpt }] }],
    artifacts: [{ id: "line", capabilityId: "canvas.linear-graph", config: { slope: 2, intercept: 3, xRange: [-5, 5], xLabel: "x", yLabel: "y" }, editablePaths: ["equation.variables"] }],
    checkers: [{ id: "line-check", capabilityId: "math.graph-interpretation", config: { mode: "slope", graphArtifactId: "line", atX: 0, tolerance: 0.01 } }],
    tasks: [{ id: "task-1", objectiveId: "obj-1", prompt: "What is the slope?", checkerId: "line-check", artifactIds: ["line"], hints: [], assessment: { mastery: "bkt" } }],
    interactions: { allowMove: true, allowDrawing: false },
    replay: replayDescriptor,
  } as ActivitySpec;
}

const scope = { courseId: "course-a", lessonId: "lesson-a" };

afterEach(() => { database?.close(); database = undefined; });

describe("worked-example checkpoint reuse of Learning attempt storage (Task 3.1)", () => {
  it("pre-change spec and attempt JSON without replay still parse", () => {
    const spec = replaySpec() as unknown as Record<string, unknown>;
    delete spec.replay;
    expect(() => ActivitySpecSchema.parse(spec)).not.toThrow();
    const attempt = {
      schemaVersion: 1, id: "a1", activityId: "steppable-activity", activityVersion: 1,
      courseId: "course-a", lessonId: "lesson-a", canvasId: "c1", canvasRevision: 1,
      status: "active", currentTaskIndex: 0, currentTaskId: "task-1", artifactBindings: {},
      responses: [], hintsUsed: [], createdAt: now().toISOString(), updatedAt: now().toISOString(),
    };
    expect(() => ActivityAttemptSchema.parse(attempt)).not.toThrow();
  });

  it("saveSpec stores the replay descriptor and loadSpec returns it", () => {
    const { activities } = setup();
    activities.saveSpec({ ...scope, spec: replaySpec() });
    const loaded = activities.loadSpec({ ...scope, activityId: "steppable-activity" });
    expect(loaded.spec.replay).toEqual(replayDescriptor);
  });

  it("start initialises replay at step 0 and resume returns the saved cursor", async () => {
    const { activities } = setup();
    activities.saveSpec({ ...scope, spec: replaySpec() });
    const started = await activities.start({ ...scope, activityId: "steppable-activity" });
    expect(started.attempt.replay).toEqual({ exampleId: "worked-friction", stepIndex: 0, mode: "replay" });

    const moved = activities.setReplayPosition({
      ...scope, attemptId: started.attempt.id, exampleId: "worked-friction", stepIndex: 1, mode: "editing",
      expectedUpdatedAt: started.attempt.updatedAt,
    });
    expect(moved.replay).toEqual({ exampleId: "worked-friction", stepIndex: 1, mode: "editing" });
    const resumed = activities.resume({ ...scope, attemptId: started.attempt.id });
    expect(resumed.attempt.replay?.stepIndex).toBe(1);
    expect(resumed.attempt.replay?.mode).toBe("editing");
  });

  it("a stale expectedUpdatedAt is rejected and leaves state_json unchanged", async () => {
    const { activities, database } = setup();
    activities.saveSpec({ ...scope, spec: replaySpec() });
    const started = await activities.start({ ...scope, activityId: "steppable-activity" });
    const before = (database!.prepare("SELECT state_json FROM learning_activity_attempts WHERE id=?").get(started.attempt.id) as { state_json: string }).state_json;
    expect(() => activities.setReplayPosition({
      ...scope, attemptId: started.attempt.id, exampleId: "worked-friction", stepIndex: 1, mode: "replay",
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })).toThrowError(/another tab|stale/i);
    const after = (database!.prepare("SELECT state_json FROM learning_activity_attempts WHERE id=?").get(started.attempt.id) as { state_json: string }).state_json;
    expect(after).toBe(before);
  });

  it("rejects an out-of-range step index against the descriptor", async () => {
    const { activities } = setup();
    activities.saveSpec({ ...scope, spec: replaySpec() });
    const started = await activities.start({ ...scope, activityId: "steppable-activity" });
    expect(() => activities.setReplayPosition({
      ...scope, attemptId: started.attempt.id, exampleId: "worked-friction", stepIndex: 99, mode: "replay",
      expectedUpdatedAt: started.attempt.updatedAt,
    })).toThrowError(/outside|invalid_step/i);
  });

  it("adds no table and no attempt_events kind change", () => {
    const { database } = setup();
    const tables = (database!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);
    expect(tables.some((name) => /replay|steppable/i.test(name))).toBe(false);
    const events = database!.prepare("SELECT sql FROM sqlite_master WHERE name='learning_activity_attempt_events'").get() as { sql: string };
    expect(events.sql).toContain("CHECK(kind IN ('submission','hint'))");
  });
});

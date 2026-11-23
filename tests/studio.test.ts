import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeDocumentIntelligenceSchema } from "../server/document-intelligence/schema.js";
import { initializeCanvasSceneSchema, saveCanvasSceneGraph } from "../server/canvas-intelligence/scene/store.js";
import { LearningService } from "../server/learning/service.js";
import { buildGrounding, STUDIO_GROUNDING_CAPS } from "../server/studio/grounding.js";
import {
  generateStudioArtifact, getStudioArtifact, importStudioArtifact, listStudioArtifacts,
} from "../server/studio/service.js";
import type { StudioGenerator } from "../server/studio/service.js";

const COURSE = "course-1";
const LESSON = "lesson-1";
const EXCERPT = "At equilibrium the vector sum of all forces is zero, so horizontal components cancel.";
const REF = "studyai://document/doc-1/page/1?chunk=0";

let db: Database.Database;
let learning: LearningService;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, code TEXT NOT NULL, color TEXT NOT NULL);
    CREATE TABLE lessons (id TEXT NOT NULL, course_id TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY(course_id,id));
    CREATE TABLE documents (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE document_chunks (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, course_id TEXT NOT NULL, page INTEGER, content TEXT NOT NULL);
    CREATE TABLE canvases (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, name TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL);
  `);
  db.prepare("INSERT INTO courses(id,title,code,color) VALUES(?,?,?,?)").run(COURSE, "Physics", "PHYS", "#abc");
  db.prepare("INSERT INTO lessons(id,course_id,title) VALUES(?,?,?)").run(LESSON, COURSE, "Forces");
  initializeDocumentIntelligenceSchema(db);
  db.prepare("INSERT INTO di_documents(id,course_id,title,filename,mime_type,storage_path,content_hash,lesson_id) VALUES(?,?,?,?,?,?,?,?)")
    .run("doc-1", COURSE, "notes.pdf", "notes.pdf", "application/pdf", "notes.pdf", "hash-1", LESSON);
  db.prepare("INSERT INTO di_units(document_id,unit_type,unit_number,title,content) VALUES(?,?,?,?,?)")
    .run("doc-1", "page", 1, "Equilibrium", EXCERPT);
  db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)")
    .run("doc-1", COURSE, "page", 1, 0, EXCERPT);
  learning = new LearningService(db);
});

describe("Studio grounding", () => {
  it("caps excerpts and uses exact chunk text for citations", () => {
    const long = "force equilibrium vector ".repeat(120);
    for (let index = 1; index <= 20; index += 1) {
      db.prepare("INSERT INTO di_chunks(document_id,course_id,unit_type,unit_number,chunk_index,content) VALUES(?,?,?,?,?,?)")
        .run("doc-1", COURSE, "page", 1, index, `${long} chunk ${index}`);
    }
    const grounding = buildGrounding(db, COURSE, LESSON, "force equilibrium");
    expect(grounding.sources.length).toBeLessThanOrEqual(STUDIO_GROUNDING_CAPS.excerpts);
    for (const source of grounding.sources) {
      expect(source.excerpt.length).toBeLessThanOrEqual(STUDIO_GROUNDING_CAPS.excerptChars);
    }
  });

  it("reads existing learning concepts and canvas knowledge", () => {
    db.prepare("INSERT INTO learning_concepts(id,course_id,lesson_id,name) VALUES(?,?,?,?)").run("c1", COURSE, LESSON, "Equilibrium");
    const grounding = buildGrounding(db, COURSE, LESSON, "equilibrium");
    expect(grounding.concepts).toContain("Equilibrium");
  });
});

describe("Studio generation", () => {
  it("drops invented mind-map citations", async () => {
    const generator: StudioGenerator = async () => ({
      nodes: [
        { id: "root", label: "Forces", parentId: null },
        { id: "good", label: "Equilibrium", parentId: "root", sourceRef: REF },
        { id: "bad", label: "Invented", parentId: "root", sourceRef: "studyai://document/nope/page/9?chunk=0" },
      ],
    });
    const artifact = await generateStudioArtifact(db, { courseId: COURSE, lessonId: LESSON, kind: "mind-map", focus: "equilibrium" }, generator);
    const content = artifact.content as { nodes: Array<{ id: string; sourceRef?: string }> };
    expect(content.nodes.map((node) => node.id)).not.toContain("bad");
    expect(artifact.sourceRefs).toEqual([REF]);
    expect(getStudioArtifact(db, artifact.id, COURSE)?.title).toBeTruthy();
    expect(listStudioArtifacts(db, COURSE, LESSON, "mind-map")).toHaveLength(1);
  });

  it("accepts a canvas scene ref as mind-map provenance", async () => {
    initializeCanvasSceneSchema(db);
    db.prepare("INSERT INTO canvases(id,course_id,lesson_id,name,revision,document) VALUES(?,?,?,?,?,?)").run("board-1", COURSE, LESSON, "Board", 1, "{}");
    saveCanvasSceneGraph(db, {
      schemaVersion: 1,
      scope: { boardId: "board-1", courseId: COURSE, lessonId: LESSON },
      revision: 1, revisionHash: "hash-1", snapshotHash: "snapshot-1", builderVersion: "test",
      builtAt: new Date().toISOString(), edges: [], warnings: [], truncated: false,
      nodes: [{
        id: "node-1", kind: "scientific-object", ref: { scope: "science", id: "node-1" },
        bounds: { x: 0, y: 0, width: 10, height: 10 }, boundsBasis: "source",
        text: "Equilibrium", recordType: "concept", origin: "science", verificationStatus: "source",
        confidence: 1, sourceRefs: [], geometry: null, uncertaintyReasons: [],
      }],
    });
    const generator: StudioGenerator = async () => ({
      nodes: [
        { id: "root", label: "Forces", parentId: null },
        { id: "canvas", label: "Equilibrium", parentId: "root", sourceRef: "canvas:science:node-1" },
      ],
    });
    const artifact = await generateStudioArtifact(db, { courseId: COURSE, lessonId: LESSON, kind: "mind-map", focus: "equilibrium" }, generator);
    expect(artifact.sourceRefs).toContain("canvas:science:node-1");
  });

  it("filters uncited study-guide sections and key terms", async () => {
    const generator: StudioGenerator = async () => ({
      overview: "Forces cancel at rest.",
      sections: [
        { heading: "Grounded", body: "The vector sum is zero.", sourceRefs: [REF, "studyai://document/fake/page/1?chunk=0"] },
        { heading: "Ungrounded", body: "Made up.", sourceRefs: ["studyai://document/fake/page/1?chunk=0"] },
      ],
      keyTerms: [{ term: "Equilibrium", definition: "ΣF = 0", sourceRef: REF }],
    });
    const artifact = await generateStudioArtifact(db, { courseId: COURSE, lessonId: LESSON, kind: "study-guide", focus: "equilibrium" }, generator);
    const content = artifact.content as { sections: Array<{ heading: string; sourceRefs: string[] }> };
    expect(content.sections).toHaveLength(1);
    expect(content.sections[0].sourceRefs).toEqual([REF]);
  });
});

describe("Studio to learning integration", () => {
  it("imports generated practice into the existing BKT/FSRS engine", async () => {
    const generator: StudioGenerator = async () => ({
      cards: [{ front: "What is equilibrium?", back: "ΣF = 0", concept: "Equilibrium", sourceRef: REF }],
      questions: [{
        concept: "Equilibrium", prompt: "What is the vector sum at rest?",
        choices: [{ id: "a", text: "Zero" }, { id: "b", text: "Weight" }], correctChoice: "a",
        explanation: "Forces cancel.", sourceRef: REF,
      }],
    });
    const artifact = await generateStudioArtifact(db, { courseId: COURSE, lessonId: LESSON, kind: "practice", focus: "equilibrium" }, generator);
    const result = importStudioArtifact(db, learning, { artifactId: artifact.id, cards: [0], questions: [0] });
    expect(result).toMatchObject({ cardsAdded: 1, questionsAdded: 1, errors: [] });
    expect(learning.ask(COURSE, LESSON)?.prompt).toBe("What is the vector sum at rest?");
    expect(learning.dueCards(COURSE, LESSON)[0]).toMatchObject({ front: "What is equilibrium?", back: "ΣF = 0" });
  });

  it("refuses practice whose only citation was invented by the model", async () => {
    const generator: StudioGenerator = async () => ({
      cards: [],
      questions: [{
        concept: "Equilibrium", prompt: "Invented?", choices: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }],
        correctChoice: "a", explanation: "No.", sourceRef: "studyai://document/fake/page/9?chunk=0",
      }],
    });
    await expect(generateStudioArtifact(db, { courseId: COURSE, lessonId: LESSON, kind: "practice", focus: "equilibrium" }, generator))
      .rejects.toThrow("No grounded practice items");
  });
});

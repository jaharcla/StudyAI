import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { compilePackage } from "../server/artifact-intelligence/service";
import { initializeStudioSchema } from "../server/studio/schema";
import { listStudioArtifacts, saveStudioArtifact, setStudioArtifactAcceptance } from "../server/studio/service";
import type { InfographicContent } from "../server/studio/contracts";
import { parseArtifactPackage } from "../src/artifacts/package";
import { DEFAULT_VIEWPORT } from "../src/canvas/ai/teaching-scene";
import { buildInfographicFigure } from "../src/studio/infographic";

const REF = "studyai://document/module-1/text/4?chunk=0";
const CHUNKS = [{ ref: REF, text: "Friction opposes the motion down the slope." }];

const diagramContent = {
  title: "Forces on a slope",
  surfaceAngleDeg: 20,
  forces: [
    { label: "gravity", components: [0, -9.8] as [number, number] },
    { label: "normal", components: [3.4, 9.2] as [number, number], position: { x: 20, y: 100 } },
  ],
};

const infographicPackage = () => parseArtifactPackage({
  schemaVersion: 1,
  id: "info-pkg",
  objective: "Forces on a slope",
  courseId: "c1",
  lessonId: "l1",
  format: "infographic",
  components: [{ id: "d1", kind: "diagram", ...diagramContent, sourceRefs: [REF] }],
}, [REF], CHUNKS);

describe("Phase B first-class study guides and infographics", () => {
  it("compiles a diagram package into a studio infographic with no canvas projection", () => {
    const pkg = infographicPackage();
    const result = compilePackage(pkg, {
      courseId: "c1", lessonId: "l1", boardId: "", occupancy: [], viewport: DEFAULT_VIEWPORT,
      anchors: new Map(), retrievedRefs: [REF], retrievedChunks: CHUNKS,
    });
    expect(result.report.ok).toBe(true);
    expect(result.canvas).toBeUndefined();
    expect(result.learning).toBeUndefined();
    expect(result.studio?.kind).toBe("infographic");
    expect(result.studio?.sourceRefs).toEqual([REF]);
    expect((result.studio?.content as InfographicContent).diagram.forces.map((force) => force.label)).toEqual(["gravity", "normal"]);
  });

  it("keeps a summary package compiling to a studio study guide", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "guide-pkg", objective: "Friction", courseId: "c1", lessonId: "l1",
      format: "study-guide",
      components: [{ id: "s1", kind: "summary", title: "Friction recap", sourceRefs: [REF], sections: [{ heading: "Direction", body: "Opposes motion." }] }],
    }, [REF], CHUNKS);
    const result = compilePackage(pkg, {
      courseId: "c1", lessonId: "l1", boardId: "", occupancy: [], viewport: DEFAULT_VIEWPORT,
      anchors: new Map(), retrievedRefs: [REF], retrievedChunks: CHUNKS,
    });
    expect(result.studio?.kind).toBe("study-guide");
  });

  it("lays out an infographic deterministically with accessible labels", () => {
    const figure = buildInfographicFigure(diagramContent);
    expect(buildInfographicFigure(diagramContent)).toEqual(figure);
    expect(figure.arrows.map((arrow) => arrow.label)).toEqual(["gravity", "normal"]);
    expect(figure.angleDeg).toBe(20);
    expect(figure.arrows.every((arrow) => Number.isFinite(arrow.x2) && Number.isFinite(arrow.y2))).toBe(true);
  });

  it("persists and accepts an artifact through the one shared studio store", () => {
    const db = new Database(":memory:");
    initializeStudioSchema(db);
    const artifact = compilePackage(infographicPackage(), {
      courseId: "c1", lessonId: "l1", boardId: "", occupancy: [], viewport: DEFAULT_VIEWPORT,
      anchors: new Map(), retrievedRefs: [REF], retrievedChunks: CHUNKS,
    }).studio!;
    saveStudioArtifact(db, artifact);
    expect(listStudioArtifacts(db, "c1", "l1", "infographic")).toHaveLength(1);
    const accepted = setStudioArtifactAcceptance(db, artifact.id, "accept");
    expect(accepted?.acceptance).toBe("accept");
    expect(listStudioArtifacts(db, "c1", "l1")[0]?.acceptance).toBe("accept");
    db.close();
  });

  it("adds the acceptance column additively to a pre-breadth database", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE studio_artifacts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, source_refs TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    db.prepare("INSERT INTO studio_artifacts(id,course_id,lesson_id,kind,title,content,source_refs) VALUES(?,?,?,?,?,?,?)")
      .run("legacy", "c1", "l1", "study-guide", "Old", "{}", "[]");
    initializeStudioSchema(db);
    expect(listStudioArtifacts(db, "c1", "l1")[0]?.acceptance).toBe("pending");
    db.close();
  });
});

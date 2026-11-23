import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { artifactCapabilitiesSchema, getArtifactCapabilities } from "../server/artifact-intelligence/capabilities";
import { parseArtifactPackage } from "../src/artifacts/package";
import { projectPackage } from "../src/artifacts/project";

const TEN_KINDS = [
  "explanation", "worked-example", "diagram", "equation", "graph",
  "question", "flashcard", "mind-map", "interactive-exercise", "summary",
];

describe("getArtifactCapabilities", () => {
  it("describes every component kind with exactly one owner", () => {
    const capabilities = getArtifactCapabilities();
    expect(capabilities.readOnly).toBe(true);
    expect(capabilities.applyVerb).toBe("author_board");
    expect(capabilities.maxItems).toBe(8);
    expect(capabilities.componentKinds.map((entry) => entry.kind).sort()).toEqual([...TEN_KINDS].sort());
    for (const entry of capabilities.componentKinds) expect(["canvas", "studio", "learning"]).toContain(entry.owner);
    expect(capabilities.componentKinds.filter((entry) => entry.kind === "summary")[0]?.owner).toBe("studio");
    expect(capabilities.componentKinds.filter((entry) => entry.kind === "interactive-exercise")[0]?.owner).toBe("learning");
    expect(capabilities.validators).toContain("force-diagram");
    expect(capabilities.validators).toContain("geometry");
  });

  it("is a pure read with no board handle", () => {
    expect(getArtifactCapabilities()).toEqual(getArtifactCapabilities());
    expect(() => artifactCapabilitiesSchema.parse({})).not.toThrow();
    expect(() => artifactCapabilitiesSchema.parse({ mutate: true })).toThrow();
  });

  it("matches the actual package ownership projection for every kind", () => {
    const REF = "studyai://document/module-1/text/4?chunk=0";
    const pkg = parseArtifactPackage({
      schemaVersion: 1,
      id: "owner-pkg",
      objective: "Ownership",
      courseId: "c1",
      lessonId: "l1",
      components: [
        { id: "e1", kind: "explanation", text: "Prose.", sourceRefs: [REF] },
        { id: "we1", kind: "worked-example", prompt: "Work it.", steps: ["Step"], answer: "Done.", sourceRefs: [REF] },
        { id: "d1", kind: "diagram", title: "D", sourceRefs: [REF], forces: [{ label: "g", components: [0, -1] }] },
        { id: "eq1", kind: "equation", expression: "F=m*a", sourceRefs: [REF] },
        { id: "g1", kind: "graph", expression: "x", xRange: [-1, 1], sourceRefs: [REF] },
        { id: "q1", kind: "question", prompt: "Q?", sourceRefs: [REF] },
        { id: "fc1", kind: "flashcard", front: "F", back: "B", sourceRefs: [REF] },
        { id: "mm1", kind: "mind-map", title: "M", nodes: [{ id: "n", label: "N" }], sourceRefs: [REF] },
        { id: "ix1", kind: "interactive-exercise", prompt: "I", sourceRefs: [REF], exercise: { mode: "graph-interpretation", slope: 1, intercept: 0, xRange: [-1, 1], atX: 1 } },
        { id: "s1", kind: "summary", title: "S", sections: [{ heading: "H", body: "B" }], sourceRefs: [REF] },
      ],
    }, [REF]);
    const projection = projectPackage(pkg);
    for (const entry of getArtifactCapabilities().componentKinds) {
      const id = pkg.components.find((component) => component.kind === entry.kind)?.id;
      expect(id).toBeDefined();
      expect(projection[entry.owner]).toContain(id);
    }
  });

  it("keeps author_board force-bound and does not import a board write path", () => {
    const agent = readFileSync("server/agent.ts", "utf8");
    expect(agent).toContain("author_board");
    expect(agent).toContain("recommendedToolsForQuery");
    expect(agent).toContain("get_artifact_capabilities");
    const source = readFileSync("server/artifact-intelligence/capabilities.ts", "utf8");
    for (const forbidden of ["canvas-persistence", "postDocument", "proposeArtifactBrief"]) expect(source).not.toContain(forbidden);
  });
});

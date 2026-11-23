import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { artifactCapabilitiesSchema, getArtifactCapabilities } from "../server/artifact-intelligence/capabilities";

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

  it("keeps author_board force-bound and does not import a board write path", () => {
    const agent = readFileSync("server/agent.ts", "utf8");
    expect(agent).toContain("author_board");
    expect(agent).toContain("recommendedToolsForQuery");
    expect(agent).toContain("get_artifact_capabilities");
    const source = readFileSync("server/artifact-intelligence/capabilities.ts", "utf8");
    for (const forbidden of ["canvas-persistence", "postDocument", "proposeArtifactBrief"]) expect(source).not.toContain(forbidden);
  });
});

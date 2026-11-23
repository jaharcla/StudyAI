import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recommendedToolsForQuery, shouldRetrieveCourseDocuments } from "../server/tutor-retrieval-policy";
import { getArtifactCapabilities } from "../server/artifact-intelligence/capabilities";

type Baseline = {
  availableTools: string[];
  cases: Array<{ query: string; retrieve: boolean; expectedRoutes: string[] }>;
};

const baseline = JSON.parse(readFileSync("docs/verification/tutor-route-correctness-baseline.json", "utf8")) as Baseline;

describe("deterministic route correctness", () => {
  it("matches every recorded query against the committed baseline", () => {
    expect(baseline.cases.length).toBeGreaterThanOrEqual(6);
    const failures = baseline.cases.filter((testCase) => {
      const routes = recommendedToolsForQuery(testCase.query, baseline.availableTools);
      return shouldRetrieveCourseDocuments(testCase.query) !== testCase.retrieve
        || JSON.stringify(routes) !== JSON.stringify(testCase.expectedRoutes);
    });
    expect(failures.map((failure) => failure.query)).toEqual([]);
  });

  it("never returns a tool name that was not supplied as available", () => {
    for (const testCase of baseline.cases) {
      const routes = recommendedToolsForQuery(testCase.query, baseline.availableTools);
      for (const name of routes) expect(baseline.availableTools).toContain(name);
    }
  });
});

describe("insufficient course context", () => {
  it("retrieves again without inventing a new verb", () => {
    const query = "I need more course context before I answer";
    expect(shouldRetrieveCourseDocuments(query)).toBe(true);
    const routes = recommendedToolsForQuery(query, baseline.availableTools);
    for (const name of routes) expect(baseline.availableTools).toContain(name);
    const agent = readFileSync("server/agent.ts", "utf8");
    expect(agent).toContain("search_course_documents");
    expect(agent).not.toMatch(/get_more_context|retrieve_again/);
  });

  it("keeps capability discovery advisory and author_board the only apply verb", () => {
    const capabilities = getArtifactCapabilities();
    expect(capabilities.readOnly).toBe(true);
    expect(capabilities.applyVerb).toBe("author_board");
  });
});

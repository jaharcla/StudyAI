import { describe, expect, it } from "vitest";
import type { ConceptGraphNode } from "../server/concept-graph.js";
import { selectPreflightConcepts } from "../src/today/preflight.js";

function node(id: string, mastery: number, sourceRef?: string): ConceptGraphNode {
  return {
    id,
    label: `Concept ${id}`,
    parentId: null,
    ...(sourceRef ? { sourceRef } : {}),
    lessonId: "lesson-1",
    lessonTitle: "Lesson 1",
    mastery,
    canPractice: false,
  };
}

const REF = "studyai://document/doc-1/page/1?chunk=0";

describe("selectPreflightConcepts", () => {
  it("returns the weakest cited concepts first", () => {
    const selected = selectPreflightConcepts([
      node("c", 0.8, REF),
      node("a", 0.2, REF),
      node("b", 0.5, REF),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("excludes concepts without a source reference", () => {
    const selected = selectPreflightConcepts([
      node("uncited", 0.1),
      node("cold", 0.6, REF),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["cold"]);
  });

  it("breaks equal-mastery ties on id so the order is stable", () => {
    const selected = selectPreflightConcepts([
      node("z", 0.4, REF),
      node("a", 0.4, REF),
      node("m", 0.4, REF),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["a", "m", "z"]);
  });

  it("honours the limit", () => {
    const selected = selectPreflightConcepts([
      node("a", 0.1, REF),
      node("b", 0.2, REF),
      node("c", 0.3, REF),
      node("d", 0.4, REF),
    ], 2);
    expect(selected.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for empty input and never invents a concept", () => {
    expect(selectPreflightConcepts([])).toEqual([]);
    expect(selectPreflightConcepts([node("uncited", 0.1)])).toEqual([]);
  });
});

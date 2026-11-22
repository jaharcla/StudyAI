import { describe, expect, it } from "vitest";
import { recommendedToolsForQuery } from "../server/tutor-retrieval-policy.js";

const available = [
  "search_course_documents",
  "propose_canvas_edit",
  "propose_canvas_action",
  "get_canvas_state",
  "get_canvas_scene",
  "read_canvas_ink",
  "search_canvas_evidence",
  "propose_scientific_object",
  "describe_canvas",
  "search_fact_checks",
];

describe("recommendedToolsForQuery", () => {
  it("routes a natural add-object request to propose_scientific_object", () => {
    expect(recommendedToolsForQuery("Add a concept object to my board titled Resultant vectors.", available)).toContain("propose_scientific_object");
  });

  it("routes an implicit edit request to propose_canvas_edit", () => {
    expect(recommendedToolsForQuery("Correct the force vector on my board.", available)).toContain("propose_canvas_edit");
  });

  it("routes ink reading to read_canvas_ink", () => {
    expect(recommendedToolsForQuery("Read the handwriting on my canvas.", available)).toContain("read_canvas_ink");
  });

  it("only returns tools that are actually bound", () => {
    const result = recommendedToolsForQuery("Add a concept object.", ["search_fact_checks"]);
    expect(result).toEqual([]);
  });

  it("caps the hint at three tools", () => {
    const result = recommendedToolsForQuery("create a shape near the arrow and read the ink", available);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

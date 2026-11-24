import { describe, expect, it } from "vitest";
import type { ScientificObject } from "../../src/canvas/model";
import { buildNarrationSegments, redactIds } from "../../src/narration/segments";

const force: Extract<ScientificObject, { kind: "force" }> = {
  id: "force-abc-123",
  kind: "force",
  x: 0,
  y: 0,
  width: 10,
  height: 80,
  components: [0, 9.8, 0],
  units: "N",
  label: "F_N",
  provenance: { status: "generated-unverified", sourceRefs: ["doc:chapter-4"] },
};

describe("narration segment generation", () => {
  it("builds one grounded segment per object without leaking raw IDs", () => {
    const segments = buildNarrationSegments([force]);
    expect(segments).toHaveLength(1);
    expect(segments[0].objectId).toBe("force-abc-123");
    expect(segments[0].text).toContain("F_N");
    for (const segment of segments) {
      expect(segment.caption).toBe(segment.text);
      expect(segment.text).not.toContain("force-abc-123");
      expect(segment.caption).not.toMatch(/\b(?:q|s|mw):/);
    }
  });

  it("labels grounding from object provenance and general labels", () => {
    const noEvidence: Extract<ScientificObject, { kind: "force" }> = {
      ...force,
      provenance: { status: "generated-unverified", sourceRefs: [] },
    };
    const general: Extract<ScientificObject, { kind: "anatomy" }> = {
      id: "anatomy-1", kind: "anatomy", x: 0, y: 0, width: 100, height: 100,
      structureId: "heart", system: "circulatory", labels: [],
    };
    expect(buildNarrationSegments([noEvidence])[0].grounding).toBe("no-evidence");
    expect(buildNarrationSegments([noEvidence])[0].groundingLabel).toBe("No course evidence");
    expect(buildNarrationSegments([general])[0].groundingLabel).toBe("General label");
    expect(buildNarrationSegments([{ ...force, provenance: undefined }])[0].grounding).toBe("board");
  });

  it("keeps transcript source labels human-readable and speech text free of math commands", () => {
    const equation: Extract<ScientificObject, { kind: "equation" }> = {
      id: "equation-xyz", kind: "equation", x: 0, y: 0, width: 200, height: 100,
      expression: "$v = 10\\,\\text{m}\\cdot\\text{s}^{-1}$", variables: {},
    };
    const segment = buildNarrationSegments([force, equation])[1];
    expect(segment.sourceLabels).toEqual([]);
    expect(buildNarrationSegments([force])[0].sourceLabels).toEqual(["Source 1"]);
    expect(buildNarrationSegments([force])[0].text).not.toContain("doc:chapter-4");
    expect(segment.text).not.toContain("\\");
    expect(segment.text).not.toContain("$");
    expect(redactIds("q:shape:abc123 stays hidden")).not.toContain("q:shape:abc123");
  });
});

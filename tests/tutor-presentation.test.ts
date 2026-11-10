import { describe, expect, it } from "vitest";
import { presentTutorResponse, projectTutorContexts, renderTutorResponse } from "../server/tutor-presentation";

const cited = { sourceRef: "source:lecture:2", filename: "chemistry.pdf", unitType: "page", unitNumber: 2, score: -1.5, excerpt: "The supported claim." };
const unused = { sourceRef: "source:lecture:3", filename: "unrelated.pdf", unitType: "page", unitNumber: 3, score: -0.2, excerpt: "An unrelated claim." };

describe("Tutor student response", () => {
  it("returns only validated sources cited in the answer", () => {
    const answer = `The claim is supported [wrong label](#studyai-citation=${encodeURIComponent(cited.sourceRef)}). [fake](#studyai-citation=unknown-ref)`;
    const response = presentTutorResponse(answer, [cited, unused]);

    expect(response.answer).toContain("[chemistry.pdf · page 2](#studyai-citation=");
    expect(response.answer).not.toContain("unrelated.pdf");
    expect(response.answer).not.toContain("unknown-ref");
    expect(response.citations).toEqual([{ sourceRef: cited.sourceRef, filename: cited.filename, unitType: cited.unitType, unitNumber: cited.unitNumber }]);
    expect(response.rejectedCitationCount).toBe(1);
  });

  it("canonicalizes Groq full-width citation labels against validated candidates", () => {
    const answer = `The value is supported 【invented label · 0](#studyai-citation=${encodeURIComponent(cited.sourceRef)})`;
    const response = presentTutorResponse(answer, [cited]);

    expect(response.answer).toContain(`[chemistry.pdf · page 2](#studyai-citation=${encodeURIComponent(cited.sourceRef)})`);
    expect(response.citations).toEqual([{ sourceRef: cited.sourceRef, filename: cited.filename, unitType: cited.unitType, unitNumber: cited.unitNumber }]);
  });

  it("turns raw source references inside full-width brackets into validated links", () => {
    const answer = `The value is supported 【${cited.sourceRef}】 and 【studyai://document/unknown/text/1?chunk=0】`;
    const response = presentTutorResponse(answer, [cited]);

    expect(response.answer).toContain(`[chemistry.pdf · page 2](#studyai-citation=${encodeURIComponent(cited.sourceRef)})`);
    expect(response.answer).not.toContain("unknown");
    expect(response.citations).toHaveLength(1);
    expect(response.rejectedCitationCount).toBe(1);
  });

  it("canonicalizes direct studyai URI links in Groq citation style", () => {
    const sourceRef = "studyai://document/lecture-2/text/1?chunk=0";
    const candidate = { ...cited, sourceRef };
    const answer = `The value appears here 【invented label](studyai://document/lecture-2/text/1?chunk=0)`;
    const response = presentTutorResponse(answer, [candidate]);

    expect(response.answer).toContain(`[chemistry.pdf · page 2](#studyai-citation=${encodeURIComponent(sourceRef)})`);
    expect(response.citations).toEqual([{ sourceRef, filename: cited.filename, unitType: cited.unitType, unitNumber: cited.unitNumber }]);
  });

  it("maps Groq HTTPS citation aliases only to matching retrieved sources", () => {
    const sourceRef = "studyai://document/lecture-2/text/1?chunk=0";
    const candidate = { ...cited, sourceRef };
    const answer = `Valid 【smoke.txt · 0 (https://studyai.org/document/lecture-2/text/1?chunk=0)】; invalid 【missing (https://studyai.org/document/other/text/1?chunk=0)】.`;
    const response = presentTutorResponse(answer, [candidate]);

    expect(response.answer).toContain(`[chemistry.pdf · page 2](#studyai-citation=${encodeURIComponent(sourceRef)})`);
    expect(response.answer).not.toContain("https://studyai.org");
    expect(response.citations).toHaveLength(1);
    expect(response.rejectedCitationCount).toBe(1);
  });

  it("preserves exact-output answers without adding sources", () => {
    const response = presentTutorResponse("STUDYAI-GROQ-CONNECTED", [cited, unused]);
    expect(renderTutorResponse(response)).toBe("STUDYAI-GROQ-CONNECTED");
    expect(response.citations).toEqual([]);
  });
});

describe("Tutor semantic canvas context", () => {
  it("describes an arrow and nearby label without IDs or coordinates", () => {
    const contexts = projectTutorContexts([
      { description: "StudyAI active scientific canvas objects", value: { objects: [] } },
      { description: "Active Quickdraw board context", value: {
        scope: { boardId: "board-17", courseId: "chem-120", lessonId: "lesson-3" },
        selected: [],
        visible: [
          { id: "shape-arrow-1", type: "arrow", position: { x: 10, y: 20, rotation: 0, z: 1 }, bounds: { x: 10, y: 20, w: 100, h: 0 }, arrow: { from: { x: 10, y: 20 }, to: { x: 110, y: 20 }, bend: 0 } },
          { id: "shape-label-1", type: "text", text: "50 m", position: { x: 120, y: 20, rotation: 0, z: 2 }, bounds: { x: 120, y: 20, w: 30, h: 20 } },
        ],
        nearbyObjects: [],
        spatialRelationships: [{ fromId: "shape-arrow-1", relation: "left of", toId: "shape-label-1" }],
        truncated: false,
      } },
    ], false);
    const projected = JSON.stringify(contexts);

    expect(projected).toContain("50 m");
    expect(projected).toMatch(/arrow.{0,80}(right|east)|arrow.{0,80}label/i);
    expect(projected).not.toContain("shape-arrow-1");
    expect(projected).not.toContain('"x"');
    expect(projected).not.toContain("board-17");
  });

  it("keeps observations separate from uncertain interpretations", () => {
    const contexts = projectTutorContexts([{ description: "StudyAI canvas analysis result", value: {
      analysisStatus: "complete",
      observedEvidence: { items: [{ text: "50 m", origin: "native", uncertain: false, sourceIds: ["shape-1"] }] },
      inferredInterpretations: { items: [{ statement: "The arrow represents velocity", confidence: 0.62, uncertainty: ["Arrow meaning is not labeled"], verificationStatus: "unverified", sourceObjectIds: ["shape-1"] }] },
    } }], false);
    const projected = JSON.stringify(contexts);

    expect(projected).toContain("50 m");
    expect(projected).toContain("The arrow represents velocity");
    expect(projected).toContain("unverified");
    expect(projected).not.toContain("shape-1");
  });

  it("states that freehand marks are uninterpreted and retains raw context only on request", () => {
    const raw = [{ description: "Active Quickdraw board context", value: { selected: [{ id: "draw-1", type: "draw", strokeSummary: { pointCount: 12, bounds: { x: 1, y: 2, w: 3, h: 4 }, simplified: [{ x: 1, y: 2 }] } }] } }];
    const ordinary = JSON.stringify(projectTutorContexts(raw, false));

    expect(ordinary).toContain("meaning cannot be determined");
    expect(ordinary).not.toContain("draw-1");
    expect(ordinary).not.toContain('"x"');
    expect(projectTutorContexts(raw, true)).toBe(raw);
  });
});

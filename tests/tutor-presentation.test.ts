import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("canonicalizes reference-style StudyAI links emitted by Groq", () => {
    const sourceRef = "studyai://document/lecture-2/page/2?chunk=0";
    const candidate = { ...cited, sourceRef };
    const answer = "The source supports this claim [lecture excerpt][" + sourceRef + "].";
    const response = presentTutorResponse(answer, [candidate]);

    expect(response.answer).toContain("[chemistry.pdf · page 2](#studyai-citation=" + encodeURIComponent(sourceRef) + ")");
    expect(response.answer).not.toContain("[lecture excerpt]");
    expect(response.citations).toEqual([{ sourceRef, filename: cited.filename, unitType: cited.unitType, unitNumber: cited.unitNumber }]);
  });

  it("links a uniquely mentioned retrieved source when Groq describes it as plain text", () => {
    const candidate = { ...cited, filename: "force-motion-lecture.pdf", unitNumber: 1 };
    const answer = "The calculation gives 4 m/s².\nSource: force‑motion‑lecture.pdf, page 1 – excerpt from the imported lecture.";
    const response = presentTutorResponse(answer, [candidate], { linkMentionedSource: true });

    expect(response.answer).toContain(`[force-motion-lecture.pdf · page 1](#studyai-citation=${encodeURIComponent(candidate.sourceRef)})`);
    expect(response.answer).not.toContain("excerpt from the imported lecture");
    expect(response.citations).toEqual([{ sourceRef: candidate.sourceRef, filename: candidate.filename, unitType: candidate.unitType, unitNumber: candidate.unitNumber }]);
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
      { description: "Active canvas scene", value: {
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
    expect(projected).toContain('"boardId":"board-17"');
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

  it("projects grounded candidate associations with aliases while withholding internal IDs and coordinates", () => {
    const contexts = projectTutorContexts([{ description: "StudyAI canvas analysis result", value: {
      analysisStatus: "complete",
      observedEvidence: {
        items: [{
          id: "ev:ocr", text: "F = 5 N", origin: "ocr", uncertain: true,
          uncertaintyReasons: ["Groq OCR confidence unavailable", "Region-level proximity is not user-confirmed"],
          sourceIds: ["stroke-17"], sourceRegionId: "stroke-group:stroke-17", worldRegion: { x: 100, y: 120, width: 80, height: 32 }, locationPrecision: "region",
          association: { status: "ambiguous", basis: "stroke-region", geometricDistance: 12, candidateRefs: [{ scope: "science", id: "force-a" }, { scope: "science", id: "force-b" }] },
        }],
        selectedContext: { sourceRecords: [], scientificObjects: [{ id: "force-a", kind: "force" }, { id: "force-b", kind: "force" }] },
      },
    } }], false);
    const projected = JSON.stringify(contexts);

    expect(projected).toContain("F = 5 N");
    expect(projected).toContain("ambiguous");
    expect(projected).toContain("force arrow 1");
    expect(projected).toContain("force arrow 2");
    expect(projected).toContain("not user-confirmed");
    expect(projected).not.toContain("stroke-17");
    expect(projected).not.toContain("force-a");
    expect(projected).not.toContain('"worldRegion"');
    expect(projected).not.toContain('"geometricDistance"');
  });

  it("redacts raw identifiers in the actual saved-board analysis response", () => {
    const savedResponse = JSON.parse(readFileSync("tests/fixtures/canvas-grounding/saved-board-analysis-response.json", "utf8"));
    const projected = JSON.stringify(projectTutorContexts([{ description: "StudyAI canvas analysis result", value: savedResponse }], false));

    expect(projected).toContain("ambiguous");
    expect(projected).toContain("verified");
    expect(projected).not.toMatch(/\bmw[a-z0-9]+\b/i);
    for (const source of savedResponse.observedEvidence.selectedContext.sourceRecords) {
      expect(projected).not.toContain(source.id);
      expect(projected).not.toContain(source.id.split(":").at(-1));
    }
  });

  it("projects scene evidence with status and confidence without raw node IDs", () => {    const contexts = projectTutorContexts([{ description: "Active canvas scene", value: {
      scene: {
        scope: { boardId: "board-17" },
        nodes: [
          { id: "g:abc", kind: "stroke-group", text: null, verificationStatus: "derived", confidence: null, uncertaintyReasons: [] },
          { id: "o:1", kind: "ocr-item", text: "F = ma", verificationStatus: "unconfirmed", confidence: 0.62, uncertaintyReasons: ["Ink transcription"] },
        ],
        edges: [{ id: "e:1", kind: "recognizes", from: "o:1", to: "g:1", distance: null }],
        truncated: false,
      },
      selectedIds: [],
      viewport: { x: 0, y: 0, w: 100, h: 100 },
      warnings: [],
    } }], false);
    const projected = JSON.stringify(contexts);
    expect(projected).toContain("F = ma");
    expect(projected).toContain("unconfirmed");
    expect(projected).toContain("0.62");
    expect(projected).toContain("g:abc");
    expect(projected).not.toContain("o:1");
  });

  it("includes transition lengths and levels from the native shape projection", () => {
    const shapes = {
      scope: { boardId: "board-17" }, selected: [], nearbyObjects: [], spatialRelationships: [],
      visible: [
        { kind: "line", direction: "right" },
        { kind: "arrow", direction: "down", arrow: { from: { x: 330, y: 66 }, to: { x: 330, y: 245 }, bend: 0, length: 178, label: "a", fromLevel: "4", toLevel: "2" } },
      ],
    };
    const projected = JSON.stringify(projectTutorContexts([{ description: "Active canvas scene", value: { scene: { scope: { boardId: "board-17" }, nodes: [], edges: [], truncated: false }, shapes, selectedIds: [] } }], false));
    expect(projected).toContain('"label":"a"');
    expect(projected).toContain('"fromLevel":"4"');
    expect(projected).toContain('"toLevel":"2"');
    expect(projected).toContain('"length":178');
  });

  it("states that freehand marks are uninterpreted and retains raw context only on request", () => {
    const raw = [{ description: "Active canvas scene", value: { selected: [{ id: "draw-1", type: "draw", strokeSummary: { pointCount: 12, bounds: { x: 1, y: 2, w: 3, h: 4 }, simplified: [{ x: 1, y: 2 }] } }] } }];
    const ordinary = JSON.stringify(projectTutorContexts(raw, false));

    expect(ordinary).toContain("meaning cannot be determined");
    expect(ordinary).not.toContain("draw-1");
    expect(ordinary).not.toContain('"x"');
    expect(projectTutorContexts(raw, true)).toBe(raw);
  });
});

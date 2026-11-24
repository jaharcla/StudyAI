import { describe, expect, it } from "vitest";
import { recommendedToolsForQuery, requestsCanvasAction, requestsCanvasMetadata, shouldRetrieveCourseDocuments } from "../server/tutor-retrieval-policy";

describe("Tutor retrieval intent", () => {
  it("skips a greeting", () => {
    expect(shouldRetrieveCourseDocuments("Hello!")).toBe(false);
  });

  it("skips exact-output requests", () => {
    expect(shouldRetrieveCourseDocuments("Reply with exactly: STUDYAI-GROQ-CONNECTED")).toBe(false);
  });

  it("keeps retrieval for a question about something drawn on the board", () => {
    // Regression pin: a rule used to veto retrieval whenever the sentence mentioned the board,
    // which silenced course grounding for exactly the questions that need it most.
    expect(shouldRetrieveCourseDocuments("why does the spring in my diagram overshoot the equilibrium position")).toBe(true);
    expect(shouldRetrieveCourseDocuments("is the upward arrow I drew a real force or just a reaction")).toBe(true);
    expect(shouldRetrieveCourseDocuments("does the curve I drew fall to zero after five of these")).toBe(true);
    expect(shouldRetrieveCourseDocuments("Explain this canvas.")).toBe(true);
  });

  it("keeps retrieval for source-grounded academic questions", () => {
    expect(shouldRetrieveCourseDocuments("According to my lecture, why does ionic bonding transfer electrons?")).toBe(true);
    expect(shouldRetrieveCourseDocuments("Explain the diagram according to my lecture notes.")).toBe(true);
    expect(shouldRetrieveCourseDocuments("Calculate the net force on the object.")).toBe(true);
  });

  it("declines only messages that ask nothing", () => {
    expect(shouldRetrieveCourseDocuments("Tell me a joke.")).toBe(true);
    expect(shouldRetrieveCourseDocuments("")).toBe(false);
  });
});

describe("Tutor canvas action intent", () => {
  it("does not treat a question about change as an edit", () => {
    expect(requestsCanvasAction("Which change in orbit level will produce a photon with the shortest wavelength? a, b or c?")).toBe(false);
    expect(requestsCanvasAction("What happens if I move the shape?")).toBe(false);
  });

  it("still detects explicit edit requests", () => {
    expect(requestsCanvasAction("Change the label to F.")).toBe(true);
    expect(requestsCanvasAction("Can you move the arrow to the right?")).toBe(true);
    expect(requestsCanvasAction("Please add a text label.")).toBe(true);
  });
});

describe("Tutor library artifact intent", () => {
  const available = ["make_library_artifact", "search_course_documents", "author_board"];

  it("routes quiz, cards and slides requests to the library tool", () => {
    expect(recommendedToolsForQuery("Quiz me on this lesson", available)).toContain("make_library_artifact");
    expect(recommendedToolsForQuery("Make cards for these notes", available)).toContain("make_library_artifact");
    expect(recommendedToolsForQuery("Make slides from this lesson", available)).toContain("make_library_artifact");
  });

  it("does not hijack ordinary questions or canvas authoring", () => {
    expect(recommendedToolsForQuery("What is on the board?", available)).not.toContain("make_library_artifact");
  });
});

describe("Tutor canvas metadata intent", () => {
  it("keeps raw canvas metadata for edits and explicit inspection", () => {
    expect(requestsCanvasMetadata("Move the arrow label to the right.")).toBe(true);
    expect(requestsCanvasMetadata("Use propose_canvas_edit for the selected vector.")).toBe(true);
    expect(requestsCanvasMetadata("Show me the shape IDs and coordinates.")).toBe(true);
  });

  it("does not expose raw metadata for ordinary descriptions", () => {
    expect(requestsCanvasMetadata("What is on the board?")).toBe(false);
  });
});

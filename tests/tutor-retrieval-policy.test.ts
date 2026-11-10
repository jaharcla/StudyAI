import { describe, expect, it } from "vitest";
import { requestsCanvasMetadata, shouldRetrieveCourseDocuments } from "../server/tutor-retrieval-policy";

describe("Tutor retrieval intent", () => {
  it("skips a greeting", () => {
    expect(shouldRetrieveCourseDocuments("Hello!")).toBe(false);
  });

  it("skips exact-output requests", () => {
    expect(shouldRetrieveCourseDocuments("Reply with exactly: STUDYAI-GROQ-CONNECTED")).toBe(false);
  });

  it("skips simple canvas descriptions", () => {
    expect(shouldRetrieveCourseDocuments("Can you tell me what is on the board?")).toBe(false);
    expect(shouldRetrieveCourseDocuments("Explain this canvas.")).toBe(false);
  });

  it("keeps retrieval for source-grounded academic questions", () => {
    expect(shouldRetrieveCourseDocuments("According to my lecture, why does ionic bonding transfer electrons?")).toBe(true);
    expect(shouldRetrieveCourseDocuments("Explain the diagram according to my lecture notes.")).toBe(true);
    expect(shouldRetrieveCourseDocuments("Calculate the net force on the object.")).toBe(true);
  });

  it("skips casual nonacademic requests", () => {
    expect(shouldRetrieveCourseDocuments("Tell me a joke.")).toBe(false);
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

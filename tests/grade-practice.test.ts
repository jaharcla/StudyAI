import { describe, expect, it } from "vitest";
import { gradePracticeAnswer } from "../src/learning/grade-practice";
import type { PracticeQuestion } from "../src/studio/api";

const REF = "studyai://document/doc-1/page/4?chunk=0";
const EXCERPT = "Water is H2O, composed of hydrogen and oxygen.";

function question(overrides: Partial<PracticeQuestion> = {}): PracticeQuestion {
  return {
    concept: "Water composition",
    prompt: "What is water's formula?",
    choices: [
      { id: "a", text: "H2O" },
      { id: "b", text: "CO2" },
      { id: "c", text: "NaCl" },
      { id: "d", text: "O2" },
    ],
    correctChoice: "a",
    explanation: "Two hydrogen atoms and one oxygen atom.",
    sourceRef: REF,
    sourceDocumentId: "doc-1",
    sourcePage: 4,
    sourceExcerpt: EXCERPT,
    ...overrides,
  };
}

describe("local practice grading", () => {
  it("grades against the stored key with no provider or network call", () => {
    const result = gradePracticeAnswer(question(), "a");
    expect(result).toMatchObject({
      correct: true,
      correctChoiceId: "a",
      correctAnswerText: "H2O",
      explanation: "Two hydrogen atoms and one oxygen atom.",
      source: { page: 4, excerpt: EXCERPT, sourceRef: REF },
    });
    expect(result.source.title).toBeTruthy();
  });

  it("shows the same answer key and citation when the student misses", () => {
    const result = gradePracticeAnswer(question(), "c");
    expect(result.correct).toBe(false);
    expect(result.correctChoiceId).toBe("a");
    expect(result.correctAnswerText).toBe("H2O");
    expect(result.source.excerpt).toBe(EXCERPT);
  });

  it("stays deterministic across repeated checks of the same answer", () => {
    const item = question();
    expect(gradePracticeAnswer(item, "b")).toEqual(gradePracticeAnswer(item, "b"));
  });
});

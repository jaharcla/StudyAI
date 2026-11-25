import { sourceLabel, type PracticeQuestion } from "../studio/api";

export type PracticeAnswerResult = {
  correct: boolean;
  correctChoiceId: string;
  correctAnswerText: string;
  explanation: string;
  source: { title: string; page: number | null; excerpt: string; sourceRef: string };
};

/** Grades one answer from the answer key stored in the artifact. No model, no network. */
export function gradePracticeAnswer(question: PracticeQuestion, choiceId: string): PracticeAnswerResult {
  const correctAnswerText = question.choices.find((choice) => choice.id === question.correctChoice)?.text ?? "";
  return {
    correct: choiceId === question.correctChoice,
    correctChoiceId: question.correctChoice,
    correctAnswerText,
    explanation: question.explanation,
    source: {
      title: sourceLabel(question.sourceRef),
      page: question.sourcePage,
      excerpt: question.sourceExcerpt,
      sourceRef: question.sourceRef,
    },
  };
}

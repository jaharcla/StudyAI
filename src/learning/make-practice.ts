import { generateArtifact, importPractice, type PracticeType, type StudioArtifact } from "../studio/api";

/** One click from a lesson: a practice-test artifact with an answer key and a citation per question. */
export async function makePracticeTest(input: { courseId: string; lessonId: string; focus: string; count?: number }): Promise<StudioArtifact> {
  try {
    return await generateArtifact({
      courseId: input.courseId, lessonId: input.lessonId, kind: "practice",
      focus: input.focus, practiceType: "quiz", count: input.count ?? 10,
    });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    const raw = error instanceof Error ? error.message : "";
    if (status === 429 || /429|rate limit|502|503|fetch failed|network|isn't responding/i.test(raw)) {
      throw new Error("The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment.");
    }
    throw error instanceof Error ? error : new Error("Your practice test couldn't be made. Try again.");
  }
}

export type MakePracticeInput = {
  courseId: string;
  lessonId: string;
  focus: string;
  practiceType: PracticeType;
  count?: number;
};

export async function makePractice(input: MakePracticeInput): Promise<{ cardsAdded: number; questionsAdded: number }> {
  const count = input.count ?? 10;
  let artifact;
  try {
    artifact = await generateArtifact({
      courseId: input.courseId,
      lessonId: input.lessonId,
      kind: "practice",
      focus: input.focus,
      practiceType: input.practiceType,
      count,
    });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    const raw = error instanceof Error ? error.message : "";
    if (status === 429 || /429|rate limit|502|503|fetch failed|network|isn't responding/i.test(raw)) {
      throw new Error("The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment.");
    }
    throw error instanceof Error ? error : new Error("Generation didn't complete. Your course material is unchanged. Try again.");
  }

  const content = artifact.content as { cards?: unknown[]; questions?: unknown[] };
  const cardIndices = (content.cards ?? []).map((_, index) => index);
  const questionIndices = (content.questions ?? []).map((_, index) => index);

  const result = await importPractice(artifact.id, cardIndices, questionIndices);
  if ((result.cardsAdded ?? 0) === 0 && (result.questionsAdded ?? 0) === 0) {
    throw new Error("This lesson didn't yield a usable practice item. Try again with another source.");
  }
  return { cardsAdded: result.cardsAdded, questionsAdded: result.questionsAdded };
}

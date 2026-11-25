import { useEffect } from "react";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { makePractice } from "../learning/make-practice";
import { generateSlideDeck } from "../artifacts/api";

export const libraryArtifactSchema = z.object({
  kind: z.enum(["quiz", "cards", "slides"]),
  focus: z.string().min(1).max(300),
  count: z.number().int().min(2).max(12).optional(),
}).strict();

export type LibraryArtifactInput = z.infer<typeof libraryArtifactSchema>;
export type LibraryArtifactResult = { status: "ok" | "error"; message: string };

function plainError(error: unknown, kind: LibraryArtifactInput["kind"]): string {
  const raw = error instanceof Error ? error.message : "";
  if (/429|rate limit|502|503|fetch failed|network|isn't responding/i.test(raw)) {
    return "The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment.";
  }
  if (kind === "slides") return "Slides could not be built from this lesson. Your course material is unchanged. Try again.";
  return "That practice set could not be built from this lesson. Your course material is unchanged. Try again.";
}

export async function makeLibraryArtifact(courseId: string, lessonId: string, input: LibraryArtifactInput): Promise<LibraryArtifactResult> {
  if (!courseId || !lessonId) return { status: "error", message: "Select a lesson before creating an artifact." };
  try {
    if (input.kind === "slides") {
      const deck = await generateSlideDeck({ courseId, lessonId, focus: input.focus });
      const notice = (deck as { notice?: string }).notice;
      if (notice) return { status: "ok", message: notice };
      return { status: "ok", message: `Slide deck “${deck.title}” is in your Library.` };
    }
    const result = await makePractice({ courseId, lessonId, focus: input.focus, practiceType: input.kind, count: input.count });
    const label = input.kind === "quiz" ? "Quiz questions" : "Flashcards";
    return { status: "ok", message: `${label} added to your Library: ${result.questionsAdded} questions, ${result.cardsAdded} cards.` };
  } catch (error) {
    return { status: "error", message: plainError(error, input.kind) };
  }
}

type Props = { courseId: string; lessonId: string };

/** Registered from the Tutor rail so chat requests create real Library items.
 * The model only proposes the schema-shaped input; the app does the work. */
export function LibraryArtifactTool({ courseId, lessonId }: Props) {
  const handler = (input: LibraryArtifactInput) => makeLibraryArtifact(courseId, lessonId, input);
  useFrontendTool({
    name: "make_library_artifact",
    description: "Consequential: creates a real, course-grounded artifact in the shared Library. Use only when the student asks to quiz me, make cards or flashcards, or make slides. Never invent content or citations; the app generates from this lesson's retrieved course material and reports an honest failure when generation is unavailable.",
    parameters: libraryArtifactSchema,
    handler,
  }, [handler]);

  useEffect(() => {
    const host = window as Window & { __studyaiMakeLibraryArtifact?: typeof handler };
    if (import.meta.env.DEV) host.__studyaiMakeLibraryArtifact = handler;
    return () => { delete host.__studyaiMakeLibraryArtifact; };
  }, [handler]);
  return null;
}

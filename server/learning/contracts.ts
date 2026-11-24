import { z } from "zod";

export const RatingSchema = z.enum(["Again", "Hard", "Good", "Easy"]);
export const SubmitAttemptSchema = z.object({ presentationId: z.string().min(1), idempotencyKey: z.string().min(1).max(200), choiceId: z.string().min(1) });
export const RateCardSchema = z.object({ cardId: z.string().min(1), idempotencyKey: z.string().min(1).max(200), rating: RatingSchema });
export const PracticeAnswerSchema = z.object({
  courseId: z.string().min(1), lessonId: z.string().min(1), artifactId: z.string().min(1),
  questionIndex: z.number().int().nonnegative().max(20),
  choiceId: z.string().min(1), idempotencyKey: z.string().min(1).max(200),
});
export const CardInputSchema = z.object({ courseId: z.string().min(1), lessonId: z.string().min(1), conceptId: z.string().trim().min(1), front: z.string().min(1), back: z.string().min(1), sourceDocumentId: z.string().optional(), sourcePage: z.number().nullable().optional(), sourceExcerpt: z.string().optional() });
const COPY_STYLE_QUESTION_PATTERNS = [
  /\baccording to (the )?(excerpt|passage|source(?:\s+text|\s+material)?|text|article)\b/i,
  /\bthe (excerpt|passage|source text) (says|states|mentions|tells|describes|indicates)\b/i,
  /\bwhat does the (excerpt|passage|source) (say|state|mention)\b/i,
];

export function isCopyStyleQuestionPrompt(prompt: string): boolean {
  return COPY_STYLE_QUESTION_PATTERNS.some((pattern) => pattern.test(prompt));
}

export const ReviewedQuestionSchema = z.object({ courseId: z.string().min(1), lessonId: z.string().min(1), concept: z.string().trim().min(1).max(160), prompt: z.string().trim().min(1).max(2000).refine((value) => !isCopyStyleQuestionPrompt(value), "Question must not use excerpt giveaway phrasing."), choices: z.array(z.object({ id: z.string().min(1), text: z.string().trim().min(1).max(500) })).min(2).max(8), correctChoice: z.string().min(1), explanation: z.string().trim().min(1).max(2000), sourceDocumentId: z.string().min(1), sourcePage: z.number().int().positive().nullable().optional(), sourceExcerpt: z.string().trim().min(1).max(3000), reviewed: z.literal(true) });
export type Rating = z.infer<typeof RatingSchema>;

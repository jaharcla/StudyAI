import { z } from "zod";

export const RatingSchema = z.enum(["Again", "Hard", "Good", "Easy"]);
export const SubmitAttemptSchema = z.object({ presentationId: z.string().min(1), idempotencyKey: z.string().min(1).max(200), choiceId: z.string().min(1) });
export const RateCardSchema = z.object({ cardId: z.string().min(1), idempotencyKey: z.string().min(1).max(200), rating: RatingSchema });
export const ReviewedQuestionSchema = z.object({ courseId: z.string().min(1), lessonId: z.string().min(1), concept: z.string().trim().min(1).max(160), prompt: z.string().trim().min(1).max(2000), choices: z.array(z.object({ id: z.string().min(1), text: z.string().trim().min(1).max(500) })).min(2).max(8), correctChoice: z.string().min(1), explanation: z.string().trim().min(1).max(2000), sourceDocumentId: z.string().min(1), sourcePage: z.number().int().positive().nullable().optional(), sourceExcerpt: z.string().trim().min(1).max(3000), reviewed: z.literal(true) });
export type Rating = z.infer<typeof RatingSchema>;

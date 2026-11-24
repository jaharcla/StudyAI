import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { CardInputSchema, RateCardSchema, ReviewedQuestionSchema } from "./contracts.js";
import { LearningService } from "./service.js";

const FIELD_LABELS: Record<string, string> = {
  courseId: "Course", lessonId: "Lesson", concept: "Concept", prompt: "Prompt",
  choices: "Choices", correctChoice: "Correct choice", explanation: "Explanation",
  sourceDocumentId: "Source document", sourcePage: "Source page", sourceExcerpt: "Source excerpt",
  cardId: "Card", choiceId: "Answer", rating: "Rating", front: "Front text", back: "Back text",
};

/** Student-facing validation copy. Never return Zod paths, codes or internal field names. */
function validationMessage(error: ZodError): string {
  const labels = [...new Set(error.issues.map((issue) => FIELD_LABELS[String(issue.path[0] ?? "")]).filter((label): label is string => Boolean(label)))];
  return labels.length ? `Check ${labels.join(", ")} and try again.` : "Check the form and try again.";
}

export function createLearningHandler(service: LearningService, origin: string | ((req: IncomingMessage) => string) = "http://127.0.0.1:5173") {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const requestOrigin = typeof origin === "function" ? origin(req) : origin;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": requestOrigin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }); res.end(JSON.stringify(value)); };
    if (req.method === "OPTIONS") { send(204, {}); return true; }
    try {
      if (req.method === "GET" && url.pathname === "/api/study/ask") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        const question = service.ask(course, lesson, url.searchParams.get("concept") ?? "");
        if (question) { send(200, question); return true; }
        const suggestedSource = service.sources(course)[0] ?? null;
        send(200, {
          status: "no-reviewed-questions",
          reason: "No reviewed questions for this lesson yet. Start from an excerpt of your course material, then answer and rate it to build mastery.",
          nextAction: { kind: "author-question", label: "Create a question from course text" },
          suggestedSource,
        });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/study/sources") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        send(200, { sources: service.sources(course) });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/study/resume") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        send(200, service.resume(course, lesson));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/study/cards") {
        send(201, service.registerCard(CardInputSchema.parse(JSON.parse(await readBody(req)))));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/study/cards") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        send(200, service.dueCards(course, lesson));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/study/card-reviews") {
        send(200, service.rateCard(RateCardSchema.parse(JSON.parse(await readBody(req)))));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/study/questions") {
        const input = ReviewedQuestionSchema.parse(JSON.parse(await readBody(req)));
        const { reviewed: _reviewed, ...draft } = input;
        send(201, service.addReviewedQuestion(draft));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/study/attempts") {
        send(200, service.submit(JSON.parse(await readBody(req))));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/study/reviews") {
        send(200, service.rate(JSON.parse(await readBody(req))));
        return true;
      }
      return false;
    } catch (error) {
      if (error instanceof ZodError) { send(400, { error: validationMessage(error) }); return true; }
      if (error instanceof SyntaxError) { send(400, { error: "The request could not be read. Try again." }); return true; }
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) { send(409, { error: "That item is already saved. Try a different prompt or name." }); return true; }
      send(409, { error: error instanceof Error ? error.message : "Invalid request" });
      return true;
    }
  };
}

function readBody(req: IncomingMessage, limit = 50_000) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; if (body.length > limit) reject(new Error("Payload too large.")); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

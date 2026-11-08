import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { ReviewedQuestionSchema } from "./contracts.js";
import { LearningService } from "./service.js";

export function createLearningHandler(service: LearningService, origin = "http://127.0.0.1:5173") {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }); res.end(JSON.stringify(value)); };
    if (req.method === "OPTIONS") { send(204, {}); return true; }
    try {
      if (req.method === "GET" && url.pathname === "/api/study/ask") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        const question = service.ask(course, lesson);
        send(question ? 200 : 404, question ?? { error: "No reviewed questions are available for this lesson." });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/study/resume") {
        const course = url.searchParams.get("course") ?? "", lesson = url.searchParams.get("lesson") ?? "";
        if (!course || !lesson) { send(400, { error: "course and lesson are required." }); return true; }
        send(200, service.resume(course, lesson));
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
      send(error instanceof ZodError ? 400 : 409, { error: error instanceof Error ? error.message : "Invalid request" });
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

import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { ActivityServiceError, LearningActivityService } from "./service.js";

export function createLearningActivityHandler(service: LearningActivityService, origin = "http://127.0.0.1:5173") {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "OPTIONS") { send(204, {}); return true; }
    try {
      if (request.method === "GET" && url.pathname === "/api/activities") {
        const courseId = url.searchParams.get("course") ?? "", lessonId = url.searchParams.get("lesson") ?? "";
        if (!courseId || !lessonId) { send(400, { error: "course and lesson are required." }); return true; }
        send(200, { specs: service.listSpecs({ courseId, lessonId }), attempts: service.listAttempts({ courseId, lessonId }) });
        return true;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/activities/specs/")) {
        const activityId = decodeURIComponent(url.pathname.slice("/api/activities/specs/".length));
        send(200, service.loadSpec({ activityId, courseId: url.searchParams.get("course") ?? "", lessonId: url.searchParams.get("lesson") ?? "" }));
        return true;
      }
      if (request.method === "POST" && url.pathname === "/api/activities/preview") {
        send(200, await service.preview(JSON.parse(await readBody(request))));
        return true;
      }
      if (request.method === "POST" && url.pathname === "/api/activities/specs") {
        send(201, service.saveSpec(JSON.parse(await readBody(request))));
        return true;
      }
      if (request.method === "POST" && url.pathname === "/api/activities/start") {
        send(201, await service.start(JSON.parse(await readBody(request))));
        return true;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/activities/attempts/")) {
        const suffix = url.pathname.slice("/api/activities/attempts/".length);
        const [attemptId, action] = suffix.split("/").map(decodeURIComponent);
        const scope = { attemptId, courseId: url.searchParams.get("course") ?? "", lessonId: url.searchParams.get("lesson") ?? "" };
        if (!action) { send(200, service.resume(scope)); return true; }
      }
      if (request.method === "POST" && url.pathname.startsWith("/api/activities/attempts/")) {
        const suffix = url.pathname.slice("/api/activities/attempts/".length);
        const [attemptId, action] = suffix.split("/").map(decodeURIComponent);
        const body = JSON.parse(await readBody(request));
        if (action === "submit") { send(200, await service.submit({ ...body, attemptId })); return true; }
        if (action === "hints") { send(200, service.useHint({ ...body, attemptId })); return true; }
      }
      return false;
    } catch (error) {
      if (error instanceof ActivityServiceError) send(error.status, { error: error.message, code: error.code });
      else if (error instanceof PayloadTooLargeError) send(413, { error: error.message });
      else if (error instanceof ZodError || error instanceof SyntaxError) send(400, { error: error.message });
      else send(409, { error: error instanceof Error ? error.message : "Activity request failed." });
      return true;
    }
  };
}

class PayloadTooLargeError extends Error {}

function readBody(request: IncomingMessage, limit = 100_000) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; if (body.length > limit) reject(new PayloadTooLargeError("Activity request is too large.")); });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

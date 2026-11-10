import { tool } from "@langchain/core/tools";
import { z } from "zod";

const FACT_CHECK_ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 10;
const REQUEST_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ASSESSMENT_NOTE = "Ratings are the named publishers' assessments, not independently established verdicts. A missing match does not establish whether the claim is true or false.";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  languageCode: z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).optional(),
  maxResults: z.number().int().min(1).max(MAX_RESULTS).optional(),
}).strict();

export type FactCheckStatus = "matches_found" | "no_matches" | "api_unavailable" | "rate_limited" | "configuration_missing" | "invalid_input";

export type FactCheckResponse = {
  query: string;
  status: FactCheckStatus;
  results: Array<{
    claim: string;
    claimant: string | null;
    publisher: string | null;
    rating: string | null;
    ratingSource: "publisher";
    claimDate: string | null;
    reviewDate: string | null;
    url: string;
  }>;
  assessmentNote: string;
};

export class FactCheckRateLimiter {
  private readonly requests: number[] = [];

  constructor(private readonly limit = 10, private readonly windowMs = RATE_LIMIT_WINDOW_MS) {}

  allow(now = Date.now()): boolean {
    while (this.requests.length && now - this.requests[0] >= this.windowMs) this.requests.shift();
    if (this.requests.length >= this.limit) return false;
    this.requests.push(now);
    return true;
  }
}

const rateLimiter = new FactCheckRateLimiter();

function response(query: string, status: FactCheckStatus, results: FactCheckResponse["results"] = []): FactCheckResponse {
  return { query, status, results, assessmentNote: ASSESSMENT_NOTE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function safeReviewUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
  if (!response.body) throw new Error("response_body_missing");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new Error("response_too_large");
    }
    body += decoder.decode(item.value, { stream: true });
  }
  return body + decoder.decode();
}

function isQuotaFailure(body: string): boolean {
  return /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(body);
}

function normalizeClaims(payload: unknown, query: string, maxResults: number): FactCheckResponse {
  if (!isRecord(payload) || !Array.isArray(payload.claims)) return response(query, "api_unavailable");
  if (!payload.claims.length) return response(query, "no_matches");

  const results: FactCheckResponse["results"] = [];
  for (const item of payload.claims) {
    if (!isRecord(item)) continue;
    const claim = boundedText(item.text, 2_000);
    if (!claim || !Array.isArray(item.claimReview)) continue;
    for (const review of item.claimReview) {
      if (!isRecord(review)) continue;
      const url = safeReviewUrl(review.url);
      if (!url) continue;
      const publisherValue = isRecord(review.publisher) ? review.publisher.name ?? review.publisher.site : undefined;
      results.push({
        claim,
        claimant: boundedText(item.claimant, 300),
        publisher: boundedText(publisherValue, 300),
        rating: boundedText(review.textualRating, 500),
        ratingSource: "publisher",
        claimDate: dateOnly(item.claimDate),
        reviewDate: dateOnly(review.reviewDate),
        url,
      });
      if (results.length >= maxResults) break;
    }
    if (results.length >= maxResults) break;
  }
  return results.length ? response(query, "matches_found", results) : response(query, "api_unavailable");
}

function invalidQuery(input: unknown): string {
  if (!isRecord(input) || typeof input.query !== "string") return "";
  return input.query.trim().slice(0, MAX_QUERY_LENGTH);
}

export async function searchFactChecks(input: unknown, limiter = rateLimiter): Promise<FactCheckResponse> {
  const parsed = inputSchema.safeParse(input);
  const query = parsed.success ? parsed.data.query : invalidQuery(input);
  if (!parsed.success) return response(query, "invalid_input");

  const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY?.trim();
  if (!apiKey) return response(query, "configuration_missing");
  if (!limiter.allow()) return response(query, "rate_limited");

  const params = new URLSearchParams({ query, pageSize: String(parsed.data.maxResults ?? 5) });
  if (parsed.data.languageCode) params.set("languageCode", parsed.data.languageCode);
  const url = `${FACT_CHECK_ENDPOINT}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await fetch(url, { headers: { Accept: "application/json", "x-goog-api-key": apiKey }, signal: controller.signal, redirect: "error", cache: "no-store" });
      if (result.status === 429) return response(query, "rate_limited");
      if (result.status >= 500 && result.status <= 599) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        return response(query, "api_unavailable");
      }
      const body = await readLimitedBody(result);
      if (result.status === 403) return response(query, isQuotaFailure(body) ? "rate_limited" : "api_unavailable");
      if (!result.ok) return response(query, "api_unavailable");
      let payload: unknown;
      try { payload = JSON.parse(body); } catch { return response(query, "api_unavailable"); }
      return normalizeClaims(payload, query, parsed.data.maxResults ?? 5);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return response(query, "api_unavailable");
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      return response(query, "api_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  return response(query, "api_unavailable");
}

export function createFactCheckTool() {
  return tool(async (input) => JSON.stringify(await searchFactChecks(input)), {
    name: "search_fact_checks",
    description: "Search published Google ClaimReview fact-checks for an external factual claim when the user asks for verification or the claim is disputed or current. Do not use for math, subjective questions, or ordinary course-only questions. Ratings are the publishers' assessments; no match is inconclusive.",
    schema: inputSchema,
  });
}

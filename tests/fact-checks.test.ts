import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FactCheckRateLimiter, searchFactChecks } from "../server/fact-checks";

const originalApiKey = process.env.GOOGLE_FACT_CHECK_API_KEY;
const fetchMock = vi.fn();

function apiResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.GOOGLE_FACT_CHECK_API_KEY = "test-google-key";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.GOOGLE_FACT_CHECK_API_KEY;
  else process.env.GOOGLE_FACT_CHECK_API_KEY = originalApiKey;
});

describe("searchFactChecks", () => {
  it("normalizes one published review and calls the fixed Google endpoint", async () => {
    fetchMock.mockResolvedValue(apiResponse({ claims: [{
      text: "The example claim.", claimant: "Example speaker", claimDate: "2025-01-02T12:00:00Z",
      claimReview: [{ publisher: { name: "Example Fact Check", site: "example.org" }, url: "https://example.org/check", textualRating: "Mostly false", reviewDate: "2025-03-04T00:00:00Z" }],
    }] }));

    const result = await searchFactChecks({ query: "  The example claim  ", languageCode: "en-US", maxResults: 3 }, new FactCheckRateLimiter());

    expect(result).toMatchObject({ query: "The example claim", status: "matches_found", results: [{
      claim: "The example claim.", claimant: "Example speaker", publisher: "Example Fact Check", rating: "Mostly false",
      ratingSource: "publisher", claimDate: "2025-01-02", reviewDate: "2025-03-04", url: "https://example.org/check",
    }] });
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).origin + new URL(url).pathname).toBe("https://factchecktools.googleapis.com/v1alpha1/claims:search");
    expect(new URL(url).searchParams.get("query")).toBe("The example claim");
    expect(new URL(url).searchParams.get("languageCode")).toBe("en-US");
    expect(new URL(url).searchParams.get("pageSize")).toBe("3");
    expect(new URL(url).searchParams.has("key")).toBe(false);
    expect(options.headers["x-goog-api-key"]).toBe("test-google-key");
    expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(JSON.stringify(result)).not.toContain("test-google-key");
  });

  it("preserves separate publishers reviewing the same claim", async () => {
    fetchMock.mockResolvedValue(apiResponse({ claims: [{ text: "Shared claim", claimReview: [
      { publisher: { name: "Publisher A" }, textualRating: "False", reviewDate: "2025-01-01", url: "https://a.example/review" },
      { publisher: { name: "Publisher B" }, textualRating: "Misleading", reviewDate: "2025-02-01", url: "https://b.example/review" },
    ] }] }));

    const result = await searchFactChecks({ query: "Shared claim" }, new FactCheckRateLimiter());

    expect(result.results.map(({ publisher, rating }) => [publisher, rating])).toEqual([["Publisher A", "False"], ["Publisher B", "Misleading"]]);
    expect(result.assessmentNote).toContain("publishers' assessments");
  });

  it("reports an empty claims list as no_matches", async () => {
    fetchMock.mockResolvedValue(apiResponse({ claims: [] }));
    await expect(searchFactChecks({ query: "unreviewed claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "no_matches", results: [] });
  });

  it("reports missing credentials without making a request", async () => {
    delete process.env.GOOGLE_FACT_CHECK_API_KEY;
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "configuration_missing", results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { query: "   " },
    { query: "claim", maxResults: 11 },
    { query: "claim", languageCode: "en--US" },
    { query: "x".repeat(501) },
  ])("rejects invalid input %#", async (input) => {
    await expect(searchFactChecks(input, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "invalid_input", results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns api_unavailable on request timeout without exposing the error", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "AbortError"));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "api_unavailable", results: [] });
  });

  it("maps HTTP 429 and Google quota 403 responses to rate_limited", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 429));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "rate_limited" });
    fetchMock.mockResolvedValueOnce(apiResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "rate_limited" });
  });

  it("retries one transient server error and accepts a later response", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 503)).mockResolvedValueOnce(apiResponse({ claims: [] }));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "no_matches" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed API payloads and unsafe publisher links", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse("not json"));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "api_unavailable" });
    fetchMock.mockResolvedValueOnce(apiResponse({ claims: [{ text: "claim", claimReview: [{ url: "javascript:alert(1)" }] }] }));
    await expect(searchFactChecks({ query: "claim" }, new FactCheckRateLimiter())).resolves.toMatchObject({ status: "api_unavailable", results: [] });
  });

  it("enforces an in-process request rate limit", async () => {
    fetchMock.mockResolvedValue(apiResponse({ claims: [] }));
    const limiter = new FactCheckRateLimiter(1, 60_000);
    await expect(searchFactChecks({ query: "first" }, limiter)).resolves.toMatchObject({ status: "no_matches" });
    await expect(searchFactChecks({ query: "second" }, limiter)).resolves.toMatchObject({ status: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

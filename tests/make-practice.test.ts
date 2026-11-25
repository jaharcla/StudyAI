import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePractice } from "../src/learning/make-practice";

const fetchMock = vi.fn();

function apiResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("makePractice", () => {
  it("calls generate then import with all indices and returns counts", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ id: "art1", courseId: "c", lessonId: "l", kind: "practice", title: "t", content: { cards: [{}, {}], questions: [{}] }, sourceRefs: [], createdAt: "x" }, 201))
      .mockResolvedValueOnce(apiResponse({ cardsAdded: 2, questionsAdded: 1, errors: [] }, 200));

    const result = await makePractice({ courseId: "c", lessonId: "l", focus: "focus", practiceType: "quiz" });
    expect(result).toEqual({ cardsAdded: 2, questionsAdded: 1 });

    const [genUrl, genInit] = fetchMock.mock.calls[0];
    expect(genUrl).toBe("/api/studio/generate");
    expect(JSON.parse(genInit.body)).toMatchObject({ kind: "practice", focus: "focus", practiceType: "quiz", count: 10 });
    expect(genInit.headers).not.toHaveProperty("Origin");

    const [impUrl, impInit] = fetchMock.mock.calls[1];
    expect(impUrl).toBe("/api/studio/import");
    expect(JSON.parse(impInit.body)).toEqual({ artifactId: "art1", cards: [0, 1], questions: [0] });
    expect(impInit.headers).not.toHaveProperty("Origin");
  });

  it("throws the 429 message on a 429 generation response", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({}, 429));
    await expect(makePractice({ courseId: "c", lessonId: "l", focus: "f", practiceType: "cards" })).rejects.toThrow(
      "The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment."
    );
  });

  it("throws the zero-count message when import adds nothing", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ id: "art1", courseId: "c", lessonId: "l", kind: "practice", title: "t", content: { cards: [], questions: [] }, sourceRefs: [], createdAt: "x" }, 201))
      .mockResolvedValueOnce(apiResponse({ cardsAdded: 0, questionsAdded: 0, errors: [] }, 200));
    await expect(makePractice({ courseId: "c", lessonId: "l", focus: "f", practiceType: "both" })).rejects.toThrow(
      "This lesson didn't yield a usable practice item. Try again with another source."
    );
  });
});
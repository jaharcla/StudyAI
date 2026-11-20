import { describe, expect, it } from "vitest";
import { scoreClaimAnswer, summarizeClaimArm } from "../server/tutor-claims-score.js";

const expected = {
  boardId: "board-1",
  question: "What does the handwritten expression say?",
  expectedClaims: [{ subject: "expression", value: "N(t)=N_0 2^{-t/t_{1/2}}", cite: "g:" }],
  mustFlagUnreadable: true,
};

describe("tutor claim scoring", () => {
  it("matches normalized claims and requires an honest unreadable flag", () => {
    const score = scoreClaimAnswer(expected, {
      boardId: "board-1",
      question: expected.question,
      answer: "The group is unreadable; I cannot read it confidently.",
      toolCalls: ["read_canvas_ink"],
      latencyMs: 1200,
    });
    expect(score.matched).toBe(0);
    expect(score.missing).toHaveLength(1);
    expect(score.unreadableHonest).toBe(true);
    expect(score.toolCalls).toBe(1);
  });

  it("counts a matched claim and a valid citation", () => {
    const score = scoreClaimAnswer(expected, {
      boardId: "board-1",
      question: expected.question,
      answer: "It reads N(t) = N_0 2^{-t/t_{1/2}} (canvas: g:abc).",
    });
    expect(score.claimScore).toBe(1);
    expect(score.citationValid).toBe(true);
    expect(score.unreadableHonest).toBe(false);
  });

  it("summarizes an arm", () => {
    const summary = summarizeClaimArm([
      { claimScore: 1, matched: 1, total: 1, missing: [], citationValid: true, unreadableHonest: true, toolCalls: 1, latencyMs: 100 },
      { claimScore: 0.5, matched: 1, total: 2, missing: ["x"], citationValid: false, unreadableHonest: true, toolCalls: 2, latencyMs: 300 },
    ]);
    expect(summary.averageClaimScore).toBe(0.75);
    expect(summary.citationValidRate).toBe(0.5);
    expect(summary.averageToolCalls).toBe(1.5);
    expect(summary.p95LatencyMs).toBe(300);
  });
});

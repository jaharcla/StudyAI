import { describe, expect, it } from "vitest";
import { normalizeLatex, scoreConceptCoverage, scoreKeywordCoverage, scoreMathOCR } from "../server/canvas-intelligence/benchmark-score.js";
import { consumeProviderUsage, recordProviderUsage, resetProviderUsage } from "../server/canvas-intelligence/provider-usage.js";

describe("canvas benchmark scoring", () => {
  it("normalizes common LaTeX wrappers and commands", () => {
    expect(normalizeLatex("$$\\nabla I=(I_x,I_y)$$")).toBe("nabla i i x i y");
    expect(normalizeLatex("\\frac{1}{2} \\sum_{i=1}^{n} x_i")).toBe("frac 1 2 sum i 1 n x i");
  });

  it("scores an exact math OCR match", () => {
    const score = scoreMathOCR("\\nabla I=(I_x,I_y)", "$$\\nabla I = (I_x, I_y)$$");
    expect(score.exact).toBe(true);
    expect(score.tokenF1).toBe(1);
  });

  it("scores a close math OCR reading without treating it as exact", () => {
    const score = scoreMathOCR("N(t)=N_0 2^{-t/t_{1/2}}", "N(t)=N_0 2^{-t/T}");
    expect(score.exact).toBe(false);
    expect(score.tokenF1).toBeGreaterThan(0.7);
  });

  it("scores diagram keyword coverage", () => {
    expect(scoreKeywordCoverage(["wall", "spring", "graph"], "The wall and spring are visible; the graph is empty.")).toEqual({ matched: ["wall", "spring", "graph"], total: 3, rate: 1 });
  });

  it("scores single-letter diagram labels without matching inside words", () => {
    expect(scoreConceptCoverage(["wall", "spring", "o", "a", "f", "n", "axis", "graph"], "The wall and spring; labels O, A, F, N; horizontal axis; graph")).toEqual({ matched: ["wall", "spring", "o", "a", "f", "n", "axis", "graph"], total: 8, rate: 1 });
    expect(scoreConceptCoverage(["a"], "wall spring graph").rate).toBe(0);
  });

  it("accumulates and consumes provider usage", () => {
    resetProviderUsage();
    recordProviderUsage("openrouter", { promptTokens: 100, completionTokens: 20, costUsd: 0.0003 });
    recordProviderUsage("openrouter", { promptTokens: 50, completionTokens: 10, costUsd: 0.0002 });
    expect(consumeProviderUsage()).toEqual([{ provider: "openrouter", calls: 2, promptTokens: 150, completionTokens: 30, costUsd: 0.0005 }]);
    expect(consumeProviderUsage()).toEqual([]);
  });
});

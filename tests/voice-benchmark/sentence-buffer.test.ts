import { describe, expect, it } from "vitest";
import { SentenceBuffer } from "./sentence-buffer.js";

function emit(tokens: string[], options?: { minClauseChars?: number }): string[] {
  const buffer = new SentenceBuffer(options);
  const out: string[] = [];
  for (const token of tokens) out.push(...buffer.push(token));
  out.push(...buffer.flush());
  return out;
}

describe("SentenceBuffer", () => {
  it("emits a finished sentence as soon as its punctuation arrives", () => {
    const buffer = new SentenceBuffer();
    expect(buffer.push("Ground-state atoms fill orbitals")).toEqual([]);
    expect(buffer.push(" in energy order.")).toEqual(["Ground-state atoms fill orbitals in energy order."]);
  });

  it("splits mid-token streams without losing words", () => {
    expect(emit(["The a", "tom has ", "six elec", "trons. Next."])).toEqual([
      "The atom has six electrons.",
      "Next.",
    ]);
  });

  it("treats sentence, clause and line boundaries as flush points", () => {
    expect(emit(["First? Second! Third; fourth, then done", "\nFifth."])).toEqual([
      "First?",
      "Second!",
      "Third;",
      "fourth, then done",
      "Fifth.",
    ]);
  });

  it("keeps a short comma inside the clause", () => {
    expect(emit(["A, B, C. Done."], { minClauseChars: 12 })).toEqual(["A, B, C.", "Done."]);
  });

  it("flushes the trailing fragment without waiting for punctuation", () => {
    const buffer = new SentenceBuffer();
    expect(buffer.push("No ending here")).toEqual([]);
    expect(buffer.flush()).toEqual(["No ending here"]);
    expect(buffer.flush()).toEqual([]);
  });

  it("does not split on common abbreviations", () => {
    expect(emit(["See Fig. 2 for the d orbital. Next."])).toEqual([
      "See Fig. 2 for the d orbital.",
      "Next.",
    ]);
  });

  it("ignores empty tokens and does not emit whitespace-only chunks", () => {
    expect(emit(["  ", "   .  ", "Okay."])).toEqual(["Okay."]);
  });
});

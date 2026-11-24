import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { generateSlideDeck, listSlideDecks } from "../server/presentations/service";
import { initializeStudioSchema } from "../server/studio/schema";
import type { Grounding } from "../server/studio/contracts";

const REF = "studyai://document/module-1/text/4?chunk=0";
const grounding: Grounding = {
  focus: "friction",
  sources: [{ ref: REF, documentId: "module-1", title: "Notes", location: "text 4", excerpt: "Friction opposes motion.", sourcePage: null }],
  concepts: ["friction"],
  canvas: [],
  packet: "Friction opposes motion.",
};

const input = { courseId: "chem-120", lessonId: "lesson-03", focus: "friction" };
const goodText = `# Friction\n# Friction opposes motion\nFriction opposes motion.\n> Source: text 4`;
const badText = `# Friction\n# Friction opposes motion\nInvented claim.\n> Source: invented#p9`;

function setup(texts: string[]) {
  const db = new Database(":memory:");
  initializeStudioSchema(db);
  let index = 0;
  const renderer = vi.fn(async () => ({ presentationId: `p${index}`, pptxPath: `p${index}/final.pptx`, editPath: "/e" }));
  const readDeckText = vi.fn(async () => texts[index++] ?? texts[texts.length - 1]);
  const ground = vi.fn(() => grounding);
  const inspect = vi.fn(async (_presentationId: string): Promise<Array<Record<string, unknown>>> => []);
  return { db, renderer, readDeckText, ground, inspect, deps: { renderer, readDeckText, ground, inspect } };
}

describe("generateSlideDeck", () => {
  it("stores one grounded artifact after a single successful generation", async () => {
    const { db, deps, renderer } = setup([goodText]);
    const artifact = await generateSlideDeck(db, input, deps);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(artifact.kind).toBe("slide_deck");
    expect(artifact.sourceRefs).toEqual([REF]);
    expect(listSlideDecks(db, "chem-120")).toHaveLength(1);
  });

  it("performs exactly one repair and keeps the repaired result", async () => {
    const { db, deps, renderer } = setup([badText, goodText]);
    const artifact = await generateSlideDeck(db, input, deps);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(artifact.sourceRefs).toEqual([REF]);
    expect(listSlideDecks(db, "chem-120")).toHaveLength(1);
  });

  it("normalizes symbol-font glyphs from course evidence", async () => {
    const cleanText = `# Friction\n# Notes\n- For ν ≥ ν₀, electrons were ejected.\n> Source: text 4`;
    const { db, deps } = setup([cleanText]);
    deps.ground = vi.fn(() => ({
      ...grounding,
      sources: [{ ...grounding.sources[0], excerpt: "For    o , electrons were ejected." }],
    }));
    const artifact = await generateSlideDeck(db, input, deps);
    expect(artifact.content.slides[1].claims[0].claim).toBe("For ν ≥ ν₀, electrons were ejected.");
  });

  it("fails generation when the rendered deck contains truncated fields", async () => {
    const { db, deps } = setup([goodText]);
    deps.inspect = vi.fn(async () => [{ title: "Solving Linked Models by", body: "This method is useful in bioenginee" }]);
    await expect(generateSlideDeck(db, input, deps)).rejects.toThrow(/validation failed/i);
    expect(listSlideDecks(db, "chem-120")).toHaveLength(0);
  });

  it("refuses to store a deck that fails after the one allowed repair", async () => {
    const { db, deps } = setup([badText, badText]);
    await expect(generateSlideDeck(db, input, deps)).rejects.toThrow(/validation failed/i);
    expect(listSlideDecks(db, "chem-120")).toHaveLength(0);
  });
});

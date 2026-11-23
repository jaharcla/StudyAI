import { describe, expect, it } from "vitest";
import { validateDeckText } from "../server/presentations/validate";
import { decideRepair } from "../server/presentations/repair";
import type { SlideDeckComponent } from "../src/artifacts/package";

const REF = "studyai://document/module-1/text/4?chunk=0";
const retrieved = new Map([[REF, "Friction opposes motion. It acts uphill."]]);
const deck: SlideDeckComponent = {
  id: "sd1", kind: "slide_deck", sourceRefs: [REF], claims: [],
  objective: "Understand friction", templateId: "general-en", language: "en",
  slides: [
    { role: "title", title: "Friction", claims: [] },
    {
      role: "mechanism", title: "Friction opposes motion",
      claims: [{ claim: "Friction opposes motion.", sourceRef: REF, excerpt: "Friction opposes motion.", relationship: "direct" }],
      visual: { kind: "diagram", altText: "Force arrows" },
    },
  ],
};

describe("validateDeckText", () => {
  it("accepts a deck whose direct excerpt is contained in the retrieved chunk", () => {
    const report = validateDeckText("# Friction\n# Friction opposes motion\nFriction opposes motion.\n> Source: " + REF, deck, retrieved);
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("accepts a compiled bullet line before a source citation", () => {
    const report = validateDeckText("# Friction\n# Friction opposes motion\n- Friction opposes motion.\n> Source: " + REF, deck, retrieved);
    expect(report.ok).toBe(true);
  });

  it("rejects an invented sourceRef", () => {
    const report = validateDeckText("> Source: invented#p99", deck, retrieved);
    expect(report.problems.some((p) => p.validator === "citation-containment")).toBe(true);
  });

  it("rejects a direct excerpt that is not in the retrieved chunk", () => {
    const report = validateDeckText("Friction accelerates motion.\n> Source: " + REF, deck, retrieved);
    expect(report.problems.some((p) => p.validator === "citation-containment")).toBe(true);
  });

  it("rejects duplicate slide titles", () => {
    const duplicate = { ...deck, slides: [deck.slides[0], { ...deck.slides[1], title: "Friction" }] };
    const report = validateDeckText("# Friction\n# Friction", duplicate, retrieved);
    expect(report.problems.some((p) => p.validator === "slide-titles")).toBe(true);
  });

  it("rejects leftover placeholder text and missing alt text", () => {
    const noAlt = { ...deck, slides: [deck.slides[0], { ...deck.slides[1], visual: { kind: "photo" as const, altText: "" } }] };
    const report = validateDeckText("TODO: Click to add title", noAlt, retrieved);
    expect(report.problems.some((p) => p.validator === "placeholder-text")).toBe(true);
    expect(report.problems.some((p) => p.validator === "alt-text")).toBe(true);
  });
});

describe("decideRepair", () => {
  it("allows one repair and preserves unaffected slides", () => {
    const report = validateDeckText("> Source: invented#p99", deck, retrieved);
    const decision = decideRepair(report, 1);
    expect(decision.needsRepair).toBe(true);
    expect(decision.preserve).toContain("Friction");
  });

  it("stops after one repair", () => {
    const report = validateDeckText("> Source: invented#p99", deck, retrieved);
    expect(decideRepair(report, 2).needsRepair).toBe(false);
  });
});

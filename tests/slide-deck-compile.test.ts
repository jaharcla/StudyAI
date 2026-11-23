import { describe, expect, it } from "vitest";
import { compileSlideDeck, imagePlan, type PresentonGenerateRequest } from "../server/presentations/compile";
import type { SlideDeckComponent } from "../src/artifacts/package";
import { findDeckTemplate } from "../server/presentations/templates";

const REF = "studyai://document/module-1/text/4?chunk=0";
const component: SlideDeckComponent = {
  id: "sd1", kind: "slide_deck", sourceRefs: [REF], claims: [],
  objective: "Understand friction", templateId: "general-en", language: "en",
  slides: [
    { role: "title", title: "Friction", claims: [], notes: "Set the scene." },
    {
      role: "mechanism", title: "Friction opposes motion",
      claims: [{ claim: "Friction opposes motion.", sourceRef: REF, excerpt: "Friction opposes motion.", relationship: "direct" }],
      visual: { kind: "diagram", altText: "Force arrows on an inclined plane" },
      notes: "Explain the direction.",
    },
  ],
};

describe("compileSlideDeck", () => {
  it("produces a Presenton request with no geometry or style fields", () => {
    const request: PresentonGenerateRequest = compileSlideDeck(component, findDeckTemplate("general-en"));
    expect(request.content).toBe("");
    expect(request.language).toBe("English");
    expect(request.export_as).toBe("pptx");
    expect(request.n_slides).toBe(2);
    expect(request.template).toBe("general");
    expect(request.slides_markdown[0]).toContain("# Friction");
    expect(request.slides_markdown[1]).toContain("# Friction opposes motion");
    expect(request.slides_markdown[1]).toContain("Friction opposes motion.");
    expect(request.slides_markdown[1]).toContain(`> Source: ${REF}`);
    expect(request.slides_markdown[1]).toContain("> Notes: Explain the direction.");
    const serialized = JSON.stringify(request);
    for (const forbidden of ["left", "top", "width", "height", "shapeId", "fontFace", "#FFFFFF"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("places each source citation immediately after its own claim", () => {
    const secondRef = "studyai://document/module-1/text/5?chunk=0";
    const twoClaims: SlideDeckComponent = {
      ...component,
      slides: [{
        ...component.slides[1],
        claims: [
          ...component.slides[1].claims ?? [],
          { claim: "Normal force is perpendicular.", sourceRef: secondRef, excerpt: "Normal force is perpendicular.", relationship: "direct" },
        ],
      }],
    };
    const markdown = compileSlideDeck(twoClaims, findDeckTemplate("general-en")).slides_markdown[0];
    expect(markdown).toContain(`- Friction opposes motion.\n> Source: ${REF}\n- Normal force is perpendicular.\n> Source: ${secondRef}`);
  });

  it("renders a computed worked example with steps and verification", () => {
    const worked: SlideDeckComponent = {
      ...component,
      slides: [{
        role: "example", title: "Two-variable example", claims: [],
        math: { equations: ["x + y = 60", "8x + 12y = 600"], variables: ["x", "y"] },
        notes: "Check the solution in both equations.",
      }],
    };
    const markdown = compileSlideDeck(worked, findDeckTemplate("general-en")).slides_markdown[0];
    expect(markdown).toContain("y = 60 - x");
    expect(markdown).toContain("8x + 12(60 - x) = 600");
    expect(markdown).toContain("x = 30");
    expect(markdown).toContain("y = 30");
    expect(markdown).toContain("30 + 30 = 60");
    expect(markdown).toContain("8*30 + 12*30 = 600");
    expect(markdown).toContain("| 30 | 30 | 30 |");
    expect(markdown).toContain("Plot two lines on an x-y plane");
  });

  it("extracts visual intents without a query for diagrams", () => {
    const plan = imagePlan(component);
    expect(plan).toEqual([{
      kind: "diagram",
      altText: "Force arrows on an inclined plane",
    }]);
  });
});

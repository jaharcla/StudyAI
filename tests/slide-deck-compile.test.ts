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

  it("extracts visual intents without a query for diagrams", () => {
    const plan = imagePlan(component);
    expect(plan).toEqual([{
      kind: "diagram",
      altText: "Force arrows on an inclined plane",
    }]);
  });
});

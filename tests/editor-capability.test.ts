import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = () => readFileSync("src/canvas/CanvasStudio.tsx", "utf8");

describe("notebook editor keeps every scientific field", () => {
  it("preserves molecule construction, resonance and OpenChemLib controls", () => {
    const source = editor();
    for (const token of ["MoleculeEditor", "Resonance form", "Add atom", "Add bond", "Bond order", "Convert with OpenChemLib", "Nonbonding electrons", "Formal charge"]) expect(source).toContain(token);
  });

  it("preserves graph, equation, measurement, relationship and learning fields", () => {
    const source = editor();
    for (const token of ["Graph expression", "x minimum", "x maximum", "EquationVariables", "MathWorkspaceEditor", "Units per canvas unit", "Relationship", "Add to review deck", "resonanceForms", "onCreateLinkedGraph"]) expect(source).toContain(token);
  });

  it("uses notebook editor container classes without changing field logic", () => {
    const source = editor();
    expect(source).toContain('className="canvas-object-editor notebook-editor"');
    expect(source).toContain("notebook-editor");
  });
});

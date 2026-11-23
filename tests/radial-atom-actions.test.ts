import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = () => readFileSync("src/canvas/RadialAtomActions.tsx", "utf8");
const interaction = () => readFileSync("src/canvas/MoleculeInteraction.tsx", "utf8");

describe("radial atom actions", () => {
  it("renders eight icon-first actions in a tight ring", () => {
    const source = component();
    for (const id of ["radial-add-pair", "radial-remove-pair", "radial-element", "radial-charge", "radial-remove", "radial-bond-from", "radial-bond-order", "radial-resonance"]) expect(source).toContain(`id: "${id}"`);
    expect(source).toContain('className="radial-actions"');
    expect(source).toContain("* 40");
    expect(source).toContain("r={11}");
  });

  it("is wired to the selected atom's existing callbacks", () => {
    const source = interaction();
    expect(source).toContain("<RadialAtomActions");
    expect(source).toContain("radialAtom={selectedAtom}");
    expect(source).toContain("onAddPair=");
    expect(source).toContain("onRemovePair=");
    expect(source).toContain("onElement=");
    expect(source).toContain("onRemoveAtom=");
  });
});

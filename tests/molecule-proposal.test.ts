import { describe, expect, it } from "vitest";
import { createObject, formalChargeForAtom, moleculeBonds } from "../src/canvas/model";
import { applyCanvasObjectProposal, proposeMolecule } from "../src/canvas/tutor";

describe("flat molecule proposals", () => {
  const context = { boardId: "board-1", courseId: "chem-120", lessonId: "lesson-03", revision: 4, objects: [] as ReturnType<typeof createObject>[] };
  const ethene = {
    boardId: "board-1",
    name: "Ethene (C2H4)",
    x: 100,
    y: 100,
    atoms: [
      { element: "C" as const, nonbondingElectrons: 0 },
      { element: "C" as const, nonbondingElectrons: 0 },
      { element: "H" as const, nonbondingElectrons: 0 },
      { element: "H" as const, nonbondingElectrons: 0 },
      { element: "H" as const, nonbondingElectrons: 0 },
      { element: "H" as const, nonbondingElectrons: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 2 as const },
      { from: 0, to: 2, order: 1 as const },
      { from: 0, to: 3, order: 1 as const },
      { from: 1, to: 4, order: 1 as const },
      { from: 1, to: 5, order: 1 as const },
    ],
    reason: "Draw the ethene Lewis structure",
  };

  it("builds a C2H4 molecule with a C=C double bond and applies it", () => {
    const proposal = proposeMolecule(context, ethene);
    expect(proposal.object.kind).toBe("molecule");
    if (proposal.object.kind !== "molecule") throw new Error("Expected molecule");
    expect(proposal.object.atoms.map((atom) => atom.element)).toEqual(["C", "C", "H", "H", "H", "H"]);
    expect(moleculeBonds(proposal.object).filter((bond) => bond.order === 2)).toHaveLength(1);
    const applied = applyCanvasObjectProposal(context, proposal);
    expect(applied).toHaveLength(1);
    expect(applied[0].kind).toBe("molecule");
  });

  it("rejects invalid bond endpoints", () => {
    expect(() => proposeMolecule(context, { ...ethene, bonds: [{ from: 0, to: 0, order: 1 }] })).toThrow();
    expect(() => proposeMolecule(context, { ...ethene, bonds: [{ from: 0, to: 9, order: 1 }] })).toThrow();
  });

  it("keeps formal charges computable on both carbons", () => {
    const proposal = proposeMolecule(context, ethene);
    if (proposal.object.kind !== "molecule") throw new Error("Expected molecule");
    const carbon = proposal.object.atoms.find((atom) => atom.element === "C");
    if (!carbon) throw new Error("Expected carbon");
    const sum = moleculeBonds(proposal.object).filter((bond) => bond.from === carbon.id || bond.to === carbon.id).reduce((total, bond) => total + bond.order, 0);
    expect(formalChargeForAtom(carbon, sum)).toBe(0);
  });
});

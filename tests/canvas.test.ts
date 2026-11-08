import { describe, expect, it } from "vitest";
import { bondOrderSum, emptyCanvasDocument, formalChargeForAtom, makeMolecule, moleculeBonds, parseCanvasDocument, sampleSquare } from "../src/canvas/model";

describe("structured canvas documents", () => {
  it("stores Lewis atoms, bond orders, and resonance forms as editable data", () => {
    const molecule = makeMolecule(100, 200);
    const oxygen = molecule.atoms[0];
    expect(bondOrderSum(molecule, oxygen.id)).toBe(2);
    expect(formalChargeForAtom(oxygen, bondOrderSum(molecule, oxygen.id))).toBe(0);

    const alternate = { ...molecule.resonanceForms[0], id: "form-alt", name: "Alternate", bonds: moleculeBonds(molecule).map((bond, index) => ({ ...bond, order: index === 0 ? 1 as const : 2 as const })) };
    molecule.resonanceForms.push(alternate);
    molecule.activeResonanceId = alternate.id;
    expect(bondOrderSum(molecule, oxygen.id)).toBe(1);
    expect(formalChargeForAtom(oxygen, bondOrderSum(molecule, oxygen.id))).toBe(1);
  });

  it("round-trips structured objects and legacy Quickdraw snapshots", () => {
    const molecule = makeMolecule(10, 20);
    const document = { ...emptyCanvasDocument(), objects: [molecule] };
    expect(parseCanvasDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(parseCanvasDocument({ document: { store: {} } }).objects).toEqual([]);
  });

  it("samples graph points from the displayed square model", () => {
    expect(sampleSquare([-2, 2])).toHaveLength(13);
    expect(sampleSquare([-2, 2])[0]).toEqual([-2, 4]);
    expect(sampleSquare([-2, 2])[6]).toEqual([0, 0]);
    expect(sampleSquare([-2, 2])[12]).toEqual([2, 4]);
  });
});

describe("OpenChemLib conversion", () => {
  it("converts a Lewis structure to a canonical molecular representation", async () => {
    const { validateWithOpenChemLib } = await import("../src/canvas/chemistry");
    const result = validateWithOpenChemLib(makeMolecule(0, 0));
    expect(result.smiles).toBe("O=C=O");
    expect(result.atomCount).toBe(3);
    expect(result.bondCount).toBe(2);
  });
});

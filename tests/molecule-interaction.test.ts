import { expect, it } from "vitest";
import { atomWorldPosition, connectAtoms, moveAtom, placeAtom } from "../src/canvas/molecules";
import { bondOrderSum, emptyCanvasDocument, formalChargeForAtom, parseCanvasDocument } from "../src/canvas/model";

it("constructs a molecule from placed atoms and bonds without a seeded structure", () => {
  let molecule = placeAtom(undefined, { x: 100, y: 100 }, "O");
  expect(molecule.atoms).toHaveLength(1); expect(molecule.resonanceForms[0].bonds).toHaveLength(0);
  molecule = placeAtom(molecule, { x: 180, y: 100 }, "C");
  molecule = connectAtoms(molecule, molecule.atoms[0].id, molecule.atoms[1].id, 2);
  const ids = [molecule.id, ...molecule.atoms.map((atom) => atom.id), molecule.resonanceForms[0].id, molecule.resonanceForms[0].bonds[0].id];
  const moved = moveAtom(molecule, molecule.atoms[1].id, { x: 210, y: 150 });
  expect(atomWorldPosition(moved, moved.atoms[1])).toEqual({ x: 210, y: 150 });
  expect([moved.id, ...moved.atoms.map((atom) => atom.id), moved.resonanceForms[0].id, moved.resonanceForms[0].bonds[0].id]).toEqual(ids);
  expect(parseCanvasDocument({ ...emptyCanvasDocument(), objects: [moved] }).objects[0]).toEqual(moved);
});

it("updates bond order and formal charge while retaining the bond ID and resonance data", () => {
  let molecule = placeAtom(undefined, { x: 0, y: 0 }, "O");
  molecule = placeAtom(molecule, { x: 90, y: 0 }, "C");
  molecule = connectAtoms(molecule, molecule.atoms[0].id, molecule.atoms[1].id, 1);
  molecule = { ...molecule, atoms: molecule.atoms.map((atom, index) => index ? atom : { ...atom, nonbondingElectrons: 4 }), resonanceForms: [...molecule.resonanceForms, { id: "alternate", name: "Alternate", bonds: [] }] };
  expect(formalChargeForAtom(molecule.atoms[0], bondOrderSum(molecule, molecule.atoms[0].id))).toBe(1);
  const bondId = molecule.resonanceForms[0].bonds[0].id;
  const next = connectAtoms(molecule, molecule.atoms[0].id, molecule.atoms[1].id, 2);
  expect(next.resonanceForms[0].bonds[0].id).toBe(bondId);
  expect(next.resonanceForms[1]).toEqual(molecule.resonanceForms[1]);
  expect(formalChargeForAtom(next.atoms[0], bondOrderSum(next, next.atoms[0].id))).toBe(0);
});

import { Molecule } from "openchemlib";
import { formalChargeForAtom, moleculeBonds, type ScientificObject } from "./model";

const atomicNumbers = { H: 1, C: 6, N: 7, O: 8, F: 9, P: 15, S: 16, Cl: 17, Br: 35, I: 53 } as const;

export function validateWithOpenChemLib(data: Extract<ScientificObject, { kind: "molecule" }>) {
  const bonds = moleculeBonds(data);
  const atomIndices = new Map(data.atoms.map((atom, index) => [atom.id, index]));
  if (!data.atoms.length) throw new Error("Add at least one atom.");
  const molecule = new Molecule(data.atoms.length, bonds.length);
  data.atoms.forEach((atom) => molecule.addAtom(atomicNumbers[atom.element]));
  for (const bond of bonds) {
    const from = atomIndices.get(bond.from), to = atomIndices.get(bond.to);
    if (from === undefined || to === undefined || from === to) throw new Error("Each bond must connect two different atoms on this molecule.");
    const index = molecule.addBond(from, to);
    const type = bond.order === 1 ? Molecule.cBondTypeSingle : bond.order === 1.5 ? Molecule.cBondTypeDelocalized : bond.order === 2 ? Molecule.cBondTypeDouble : Molecule.cBondTypeTriple;
    molecule.setBondOrder(index, type);
  }
  data.atoms.forEach((atom, index) => {
    const bondOrderSum = bonds.reduce((sum, bond) => sum + ((bond.from === atom.id || bond.to === atom.id) ? bond.order : 0), 0);
    molecule.setAtomCharge(index, formalChargeForAtom(atom, bondOrderSum));
  });
  molecule.ensureHelperArrays(Molecule.cHelperNeighbours);
  molecule.validate();
  return { smiles: molecule.toSmiles(), atomCount: molecule.getAllAtoms(), bondCount: molecule.getAllBonds() };
}

import { newId, moleculeBonds, type Point, type MoleculeAtom, type ScientificObject, type BondOrder } from "./model";
import type { Element } from "../science";

export type ScientificMolecule = Extract<ScientificObject, { kind: "molecule" }>;

export function atomWorldPosition(molecule: ScientificMolecule, atom: MoleculeAtom): Point {
  const position = atom.position ?? { x: (molecule.atoms.indexOf(atom) - (molecule.atoms.length - 1) / 2) * 60, y: 0 };
  return { x: molecule.x + position.x, y: molecule.y + position.y };
}

export function placeAtom(molecule: ScientificMolecule | undefined, point: Point, element: Element): ScientificMolecule {
  const form = newId("form");
  const base: ScientificMolecule = molecule ?? { id: newId("molecule"), kind: "molecule", name: "Molecule", x: point.x, y: point.y, width: 220, height: 110, atoms: [], resonanceForms: [{ id: form, name: "Resonance form 1", bonds: [] }], activeResonanceId: form };
  return { ...base, atoms: [...base.atoms, { id: newId("atom"), element, nonbondingElectrons: 0, position: { x: point.x - base.x, y: point.y - base.y } }] };
}

export function connectAtoms(molecule: ScientificMolecule, from: string, to: string, order: BondOrder): ScientificMolecule {
  if (from === to || !molecule.atoms.some((atom) => atom.id === from) || !molecule.atoms.some((atom) => atom.id === to)) throw new Error("Choose two different atoms on this molecule.");
  const existing = moleculeBonds(molecule).find((bond) => (bond.from === from && bond.to === to) || (bond.from === to && bond.to === from));
  return { ...molecule, resonanceForms: molecule.resonanceForms.map((form) => form.id !== molecule.activeResonanceId ? form : { ...form, bonds: existing ? form.bonds.map((bond) => bond.id === existing.id ? { ...bond, order } : bond) : [...form.bonds, { id: newId("bond"), from, to, order }] }) };
}

export function moveAtom(molecule: ScientificMolecule, atomId: string, point: Point): ScientificMolecule {
  return { ...molecule, atoms: molecule.atoms.map((atom) => atom.id !== atomId ? atom : { ...atom, position: { x: point.x - molecule.x, y: point.y - molecule.y } }) };
}

export function moleculeBounds(molecule: ScientificMolecule) {
  const positions = molecule.atoms.map((atom) => atomWorldPosition(molecule, atom));
  const xs = positions.map((point) => point.x), ys = positions.map((point) => point.y);
  const x = Math.min(...xs, molecule.x) - 28, y = Math.min(...ys, molecule.y) - 28;
  return { x, y, width: Math.max(60, Math.max(...xs, molecule.x) + 28 - x), height: Math.max(60, Math.max(...ys, molecule.y) + 28 - y) };
}

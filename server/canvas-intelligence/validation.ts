import { bondOrderSum, formalChargeForAtom, moleculeBonds } from "../../src/canvas/model.js";
import type { CanvasInput } from "./types.js";

export function validateCanvasScience(input: CanvasInput) {
  const results: Array<{ objectId: string; checks: string[]; issues: string[] }> = [];
  for (const object of input.scientificObjects) {
    const checks: string[] = [], issues: string[] = [];
    if ((object.kind === "vector" || object.kind === "force") && Array.isArray(object.components) && object.components.length === 3 && object.components.every((n) => typeof n === "number" && Number.isFinite(n))) checks.push(`magnitude=${Math.hypot(...object.components as number[]).toFixed(6)}`);
    if (object.kind === "molecule") {
      const molecule = object as unknown as Parameters<typeof moleculeBonds>[0];
      const atoms = new Set(molecule.atoms.map((atom) => atom.id));
      for (const bond of moleculeBonds(molecule)) if (!atoms.has(bond.from) || !atoms.has(bond.to) || bond.from === bond.to) issues.push(`Bond ${bond.id} references invalid atom endpoints`);
      for (const atom of molecule.atoms) checks.push(`formalCharge:${atom.id}=${formalChargeForAtom(atom, bondOrderSum(molecule, atom.id))}`);
      if (!issues.length) checks.push("molecule bonds reference existing distinct atoms");
    }
    if (checks.length || issues.length) results.push({ objectId: object.id, checks, issues });
  }
  return results;
}

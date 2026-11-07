const valence = { H: 1, C: 4, N: 5, O: 6, F: 7, P: 5, S: 6, Cl: 7, Br: 7, I: 7 } as const;
export type Element = keyof typeof valence;

export function formalCharge(element: Element, nonbondingElectrons: number, bondOrderSum: number) {
  if (!Number.isInteger(nonbondingElectrons) || nonbondingElectrons < 0 || !Number.isFinite(bondOrderSum) || bondOrderSum < 0) throw new Error("Electron counts and bond order must be non-negative.");
  return valence[element] - nonbondingElectrons - bondOrderSum;
}

export function vectorMagnitude(x: number, y: number, z = 0) { return Math.hypot(x, y, z); }
export function vectorDot(a: [number, number, number], b: [number, number, number]) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }

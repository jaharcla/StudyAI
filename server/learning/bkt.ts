export type BktParameters = { pInit: number; pLearn: number; pGuess: number; pSlip: number };
export const DEFAULT_BKT: BktParameters = { pInit: 0.1, pLearn: 0.2, pGuess: 0.2, pSlip: 0.1 };

export function updateMastery(prior: number, correct: boolean, parameters: BktParameters = DEFAULT_BKT): number {
  const { pLearn, pGuess, pSlip } = parameters;
  const observed = correct
    ? prior * (1 - pSlip) / (prior * (1 - pSlip) + (1 - prior) * pGuess)
    : prior * pSlip / (prior * pSlip + (1 - prior) * (1 - pGuess));
  return observed + (1 - observed) * pLearn;
}

export function selectWeakest<T extends { mastery: number; id: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => a.mastery - b.mastery || a.id.localeCompare(b.id))[0];
}

import type { DocumentData, UnitType } from "./api.js";

export type DocumentMatch = { unitNumber: number; unitType: UnitType; offset: number };

export function findDocumentMatches(document: DocumentData | undefined, query: string, limit = 200): DocumentMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || !document) return [];
  return document.units.flatMap((unit) => {
    const text = unit.text.toLocaleLowerCase();
    const found: DocumentMatch[] = [];
    let offset = 0;
    while (found.length < limit) {
      const next = text.indexOf(needle, offset);
      if (next < 0) break;
      found.push({ unitNumber: unit.number, unitType: unit.type, offset: next });
      offset = next + needle.length;
    }
    return found;
  });
}

export function nextMatchIndex(index: number, delta: number, count: number): number {
  return count > 0 ? (index + delta + count) % count : 0;
}

export function clampUnitNumber(value: number, unitType: UnitType, document: DocumentData): number {
  const maximum = unitType === "text" ? Math.max(1, document.units.length) : Math.max(1, ...document.units.filter((unit) => unit.type === unitType).map((unit) => unit.number));
  return Math.min(maximum, Math.max(1, Math.floor(value) || 1));
}

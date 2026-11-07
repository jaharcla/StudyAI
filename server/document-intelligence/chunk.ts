import type { ExtractedUnit } from "./types.js";

export type TextChunk = { unitType: ExtractedUnit["type"]; unitNumber: number; chunkIndex: number; content: string };

export function chunkUnits(units: ExtractedUnit[], size = 1200, overlap = 160): TextChunk[] {
  if (!Number.isInteger(size) || !Number.isInteger(overlap) || size < 100 || overlap < 0 || overlap >= size) throw new Error("Invalid chunk size or overlap.");
  const result: TextChunk[] = [];
  for (const unit of units) {
    const text = unit.text.trim();
    if (!text) continue;
    let start = 0;
    let chunkIndex = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + size);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + Math.floor(size * 0.65)) end = boundary;
      }
      const content = text.slice(start, end).trim();
      if (content) result.push({ unitType: unit.type, unitNumber: unit.number, chunkIndex: chunkIndex++, content });
      if (end === text.length) break;
      start = Math.max(start + 1, end - overlap);
    }
  }
  return result;
}

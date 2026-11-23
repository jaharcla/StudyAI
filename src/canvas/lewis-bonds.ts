import type { BondOrder } from "./model";

/** Literal line glyphs for the Lewis bond menu: one line per bond order. */
export function bondOrderGlyph(order: BondOrder): string {
  if (order === 1.5) return "– · –";
  return Array.from({ length: order }, () => "—").join("\n");
}

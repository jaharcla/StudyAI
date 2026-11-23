/**
 * Course PDFs rendered with symbol fonts often extract private-use glyphs
 * (Wingdings/Symbol) instead of the intended physics notation. Normalize only
 * those known glyphs; real Greek and mathematical characters are preserved.
 */
const THRESHOLD = /\uF06E\s*o/g;
const GLYPHS: Record<string, string> = {
  "\uF06E": "ν",
  "\uF0B3": "≥",
};

export function sanitizeCourseText(text: string): string {
  return text
    .replace(THRESHOLD, "ν₀")
    .replace(/[\uF06E\uF0B3]/g, (glyph) => GLYPHS[glyph] ?? glyph)
    .replace(/\s+([,.;:])/g, "$1");
}

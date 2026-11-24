/**
 * Course PDFs rendered with symbol fonts often extract private-use glyphs
 * (Wingdings/Symbol) instead of the intended physics notation. Normalize only
 * those known glyphs; real Greek and mathematical characters are preserved.
 */
const THRESHOLD = /\uF06E\s*o/g;
const GLYPHS: Record<string, string> = {
  "\uF06E": "ν",
  "\uF0B3": "≥",
  "\u{1D465}\u{1D465}": "x",
  "\u{1D466}\u{1D466}": "y",
  "\u{1D467}\u{1D467}": "z",
  "\u{1D465}": "x",
  "\u{1D466}": "y",
  "\u{1D467}": "z",
  "∗": "*",
  "𝑎𝑎𝑎𝑎𝑎𝑎": "and",
  "𝑚𝑚𝑚𝑚": "min",
  "𝑎𝑎": "and",
};

export function sanitizeCourseText(text: string): string {
  let result = text.replace(THRESHOLD, "ν₀");
  for (const glyph of Object.keys(GLYPHS).sort((a, b) => b.length - a.length)) {
    result = result.split(glyph).join(GLYPHS[glyph]);
  }
  return result.replace(/\s+([,.;:])/g, "$1");
}

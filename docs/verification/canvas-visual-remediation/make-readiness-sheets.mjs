import sharp from "sharp";
import { resolve } from "node:path";

const dir = resolve("docs/verification/canvas-visual-remediation");
const kinds = ["atom", "bond", "molecule", "equation", "vector", "force", "measurement", "graph", "anatomy", "concept", "relationship", "linked-note", "linked-document", "question", "flashcard", "mindmap"];
const cell = { w: 280, h: 140 };

async function sheet(suffix, theme, out) {
  const tiles = await Promise.all(kinds.map(async (kind, index) => {
    const x = 340 + (index % 3) * 340;
    const y = 120 + Math.floor(index / 3) * 150;
    const dark = theme === "dark" ? "-dark" : "";
    const input = resolve(dir, `${kind}-${suffix}${dark}.png`);
    const meta = await sharp(input).metadata();
    const left = Math.min(Math.max(x - 140, 0), meta.width - cell.w);
    const top = Math.min(Math.max(y - 70, 0), meta.height - cell.h);
    return sharp(input).extract({ left, top, width: cell.w, height: cell.h })
      .composite([{ input: Buffer.from(`<svg width="${cell.w}" height="18"><rect width="100%" height="100%" fill="#1d222b"/><text x="6" y="13" fill="#ffffff" font-family="sans-serif" font-size="11">${kind}</text></svg>`), top: 0, left: 0 }])
      .png().toBuffer();
  }));
  const composites = tiles.map((input, i) => ({ input, top: Math.floor(i / 2) * cell.h, left: (i % 2) * cell.w }));
  await sharp({ create: { width: 2 * cell.w, height: Math.ceil(tiles.length / 2) * cell.h, channels: 4, background: "#ffffff" } })
    .composite(composites).png().toFile(resolve(dir, out));
}

await sheet("readiness-before", "light", "readiness-contact-before-light.png");
await sheet("readiness-after", "light", "readiness-contact-after-light.png");
await sheet("readiness-before", "dark", "readiness-contact-before-dark.png");
await sheet("readiness-after", "dark", "readiness-contact-after-dark.png");
console.log("readiness contact sheets written");

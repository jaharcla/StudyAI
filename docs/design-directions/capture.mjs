// Screenshots each of the four surface artboards in every direction mockup.
// Uses the native global Playwright install; no network, no product server.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Owner/AppData/Roaming/npm/node_modules/playwright");

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "screenshots");
mkdirSync(shots, { recursive: true });

const files = [
  ["direction-1-quiet-scholarly.html", "direction-1"],
  ["direction-2-immersive-studio.html", "direction-2"],
  ["direction-3-cool-ledger.html", "direction-3"],
];
const names = ["01-sidebar", "02-lesson-home", "03-canvas-tutor", "04-coach-prompt"];

const browser = await chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1512, height: 1000 }, deviceScaleFactor: 1 });

for (const [file, prefix] of files) {
  const url = "file:///" + join(here, file).replace(/\\/g, "/");
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const surfaces = page.locator(".surface");
  const count = await surfaces.count();
  if (count !== 4) throw new Error(`${file}: expected 4 surfaces, got ${count}`);
  for (let i = 0; i < count; i++) {
    const out = join(shots, `${prefix}-${names[i]}.png`);
    await surfaces.nth(i).screenshot({ path: out, animations: "disabled" });
    console.log(out);
  }
}
await browser.close();

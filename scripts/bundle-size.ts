import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const folder = resolve(process.argv[2] ?? "dist");
const files = (path: string): string[] => readdirSync(path).flatMap((name) => {
  const full = join(path, name);
  return statSync(full).isDirectory() ? files(full) : [full];
});
const assets = files(folder).map((path) => {
  const bytes = readFileSync(path);
  return { file: relative(folder, path).replaceAll("\\", "/"), bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
});
const html = readFileSync(join(folder, "index.html"), "utf8");
const entryPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1].replace(/^\//, "");
const report = {
  entry: assets.find((asset) => asset.file === entryPath),
  total: { files: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0) },
  pdfWorker: assets.find((asset) => /pdf\.worker/.test(asset.file)),
  chemistry: assets.find((asset) => /chemistry-/.test(asset.file)),
  largest: [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 8),
};
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

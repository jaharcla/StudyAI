import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { scoreMathOCR } from "../server/canvas-intelligence/benchmark-score.js";

// Scores non-HTTP OCR tools on the same rendered crops the canvas benchmark uses.
// These tools have no LaTeX/JSON contract, so this measures transcription only.
type ManifestEntry = { boardId: string; name: string; expected: string; crops: Array<{ path: string }> };
const manifest = JSON.parse(readFileSync("data/canvas-benchmark/model-comparison/crops/manifest.json", "utf8")) as ManifestEntry[];
const outPath = "data/canvas-benchmark/model-comparison/ocr-tools.json";
const doclingPython = process.env.DOCLING_PYTHON ?? "C:\\Users\\Owner\\AppData\\Local\\Temp\\opencode\\docling-venv\\Scripts\\python.exe";
const tesseract = [process.env.TESSERACT_PATH, "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"].filter((value): value is string => !!value).find((value) => existsSync(value));

type Row = { boardId: string; name: string; tool: string; text: string; latencyMs: number; error: string | null; score: ReturnType<typeof scoreMathOCR> | null };
const rows: Row[] = [];

if (tesseract) {
  for (const entry of manifest) {
    for (const psm of ["6", "7"]) {
      const texts: string[] = [];
      const started = Date.now();
      let error: string | null = null;
      for (const crop of entry.crops) {
        try {
          texts.push(execFileSync(tesseract, [crop.path, "stdout", "-l", "eng", "--psm", psm], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
        } catch (failure) {
          error = failure instanceof Error ? failure.message.slice(0, 200) : "tesseract failed";
        }
      }
      const text = texts.filter(Boolean).join(" ");
      rows.push({ boardId: entry.boardId, name: entry.name, tool: `tesseract-psm${psm}`, text, latencyMs: Date.now() - started, error, score: entry.expected ? scoreMathOCR(entry.expected, text) : null });
    }
  }
} else {
  console.warn("tesseract executable not found; skipping");
}

async function runDocling() {
  if (!existsSync(doclingPython)) throw new Error(`docling python not found at ${doclingPython}`);
  const helper = "data/canvas-benchmark/model-comparison/docling_ocr.py";
  writeFileSync(helper, `import json, sys, time
from docling.document_converter import DocumentConverter, ImageFormatOption, InputFormat, PdfPipelineOptions
paths = json.loads(sys.argv[1])
options = PdfPipelineOptions(do_ocr=True, do_formula_enrichment=True, do_table_structure=False)
conv = DocumentConverter(format_options={InputFormat.IMAGE: ImageFormatOption(pipeline_options=options)})
out = []
for p in paths:
    started = time.time()
    try:
        result = conv.convert(p)
        out.append({"path": p, "text": result.document.export_to_markdown(), "latencyMs": int((time.time() - started) * 1000)})
    except Exception as failure:
        out.append({"path": p, "text": "", "error": str(failure)[:300], "latencyMs": int((time.time() - started) * 1000)})
print(json.dumps(out))
`);
  const flat = manifest.flatMap((entry) => entry.crops.map((crop) => crop.path));
  const result = JSON.parse(execFileSync(doclingPython, [helper, JSON.stringify(flat)], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 1_800_000 })) as Array<{ path: string; text: string; error?: string; latencyMs: number }>;
  let cursor = 0;
  for (const entry of manifest) {
    const chunks = result.slice(cursor, cursor + entry.crops.length);
    cursor += entry.crops.length;
    const text = chunks.map((chunk) => chunk.text).join(" ").replace(/\s+/g, " ").trim();
    rows.push({ boardId: entry.boardId, name: entry.name, tool: "docling", text, latencyMs: chunks.reduce((sum, chunk) => sum + chunk.latencyMs, 0), error: chunks.find((chunk) => chunk.error)?.error ?? null, score: entry.expected ? scoreMathOCR(entry.expected, text) : null });
  }
}

try { await runDocling(); } catch (failure) { console.warn(`docling skipped: ${failure instanceof Error ? failure.message : "failed"}`); }

writeFileSync(outPath, JSON.stringify(rows, null, 2));
for (const tool of [...new Set(rows.map((row) => row.tool))]) {
  const toolRows = rows.filter((row) => row.tool === tool);
  const math = toolRows.filter((row) => !row.name.startsWith("PhysAlign") && row.score);
  const exact = math.filter((row) => row.score!.exact).length;
  const f1 = math.reduce((sum, row) => sum + row.score!.tokenF1, 0) / Math.max(1, math.length);
  console.log(`${tool}: ${exact}/${math.length} exact, mean F1 ${f1.toFixed(3)}, mean ${Math.round(toolRows.reduce((sum, row) => sum + row.latencyMs, 0) / Math.max(1, toolRows.length))}ms`);
  for (const row of toolRows) console.log(`  ${row.name}: ${row.error ? `ERROR ${row.error}` : `f1=${row.score?.tokenF1 ?? "n/a"} :: ${row.text.slice(0, 90)}`}`);
}

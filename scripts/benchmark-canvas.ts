import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { understandCanvas } from "../server/canvas-intelligence/service.js";
import { normalizeCanvasInput } from "../server/canvas-intelligence/input.js";
import { groupQuickdrawStrokes } from "../server/canvas-intelligence/regions.js";
import { clampOCRRegionLimit, planCanvasOCRCrops, selectCanvasOCRGroups } from "../src/canvas/ocr-regions.js";
import { renderStrokeGroupPng } from "../server/canvas-intelligence/recognition/render.js";
import { scoreConceptCoverage, scoreMathOCR } from "../server/canvas-intelligence/benchmark-score.js";
import { providerBudgetSnapshot, resetProviderBudgetsForTests } from "../server/canvas-intelligence/provider-budget.js";
import { consumeProviderUsage, resetProviderUsage } from "../server/canvas-intelligence/provider-usage.js";

const updateBaseline = process.argv.includes("--update-baseline");
const dbPath = process.env.STUDYAI_BENCHMARK_DB ?? "data/canvas-dataset-benchmark/studyai.sqlite";
const truthPath = "data/canvas-dataset-benchmark/scoring/ground-truth.json";
const outputPath = "data/canvas-benchmark/latest.json";
const baselinePath = "docs/verification/canvas-benchmark-baseline.json";

type Truth = { mathWriting: Array<{ boardId: string; normalizedLabel: string }>; physAlign: { boardId: string; expectedReading: string } };
type BoardRow = { id: string; course_id: string; lesson_id: string; name: string; revision: number; document: string };

const db = new Database(dbPath, { readonly: true });
const allBoards = db.prepare("SELECT id,course_id,lesson_id,name,revision,document FROM canvases ORDER BY name").all() as BoardRow[];
db.close();
const only = process.env.CANVAS_BENCHMARK_BOARD;
const boards = only ? allBoards.filter((board) => board.id === only || board.name.toLowerCase().includes(only.toLowerCase())) : allBoards;
const truth = JSON.parse(readFileSync(truthPath, "utf8")) as Truth;

if (!process.env.GOOGLE_AI_API_KEY && process.env.OPENROUTER_API_KEY) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", { headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } });
    const payload = await response.json() as { data?: { total_credits?: number; total_usage?: number } };
    const credits = Number(payload.data?.total_credits ?? 0);
    const usage = Number(payload.data?.total_usage ?? 0);
    if (credits <= usage) console.warn(`warning: OpenRouter credits are exhausted (${credits} total, ${usage} used) and GOOGLE_AI_API_KEY is not set; math OCR will be partial.`);
  } catch {
    console.warn("warning: could not check OpenRouter credits; math OCR may be partial.");
  }
}
if (!process.env.GOOGLE_AI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GROQ_API_KEY) {
  console.warn("warning: no math OCR provider is configured.");
}

function pointsFor(input: ReturnType<typeof normalizeCanvasInput>) {
  const map = new Map<string, Array<{ x: number; y: number }>>();
  for (const record of input.nativeRecords) {
    const geometry = record.geometry && typeof record.geometry === "object" ? record.geometry as Record<string, unknown> : {};
    const values = Array.isArray(geometry.points) ? geometry.points : [];
    const points = values.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Record<string, unknown>;
      return typeof point.x === "number" && typeof point.y === "number" ? [{ x: point.x, y: point.y }] : [];
    });
    if (points.length) map.set(record.id, points);
  }
  return map;
}

async function regionsFor(input: ReturnType<typeof normalizeCanvasInput>) {
  const points = pointsFor(input);
  const records = input.nativeRecords.filter((record) => record.type === "draw" || record.type === "highlight").map((record) => ({ id: record.id, type: record.type, bounds: record.bounds, points: points.get(record.id) ?? [] }));
  const groups = groupQuickdrawStrokes(input);
  const relevanceBounds = [
    ...input.nativeRecords.filter((record) => record.bounds && record.type !== "draw" && record.type !== "highlight").map((record) => record.bounds!),
    ...input.scientificObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height })),
  ];
  const selection = selectCanvasOCRGroups(groups, { records, relevanceBounds, selectedIds: [], limit: clampOCRRegionLimit(process.env.CANVAS_OCR_MAX_REGIONS) });
  const regions = [];
  for (const plan of planCanvasOCRCrops(selection.selected, { padding: 12, pixelsPerWorld: 2 })) {
    const strokes = plan.sourceIds.map((id) => points.get(id) ?? []).filter((stroke) => stroke.length > 0);
    if (!strokes.length) continue;
    const rendered = await renderStrokeGroupPng(strokes, { size: 448 });
    regions.push({
      id: plan.id,
      base64: rendered.pngBase64,
      mimeType: "image/png" as const,
      worldBounds: plan.worldBounds,
      cropBounds: plan.cropBounds,
      sourceIds: plan.sourceIds,
      pixelWidth: rendered.width,
      pixelHeight: rendered.height,
      pixelToWorld: { scaleX: plan.cropBounds.width / rendered.width, scaleY: plan.cropBounds.height / rendered.height, offsetX: plan.cropBounds.x, offsetY: plan.cropBounds.y },
    });
  }
  return regions;
}

function structureText(output: Awaited<ReturnType<typeof understandCanvas>>) {
  return [
    ...output.structure.objects.map((object) => object.label ?? object.kind),
    ...output.structure.relationships.map((relationship) => relationship.relation),
    ...output.structure.observations.map((observation) => observation.description),
    output.answer ?? "",
  ].join(" ");
}

resetProviderBudgetsForTests();
const results: Array<Record<string, unknown>> = [];
for (const board of boards) {
  const document = JSON.parse(board.document) as { snapshot: unknown; objects: unknown[] };
  const input = normalizeCanvasInput({ boardId: board.id, courseId: board.course_id, lessonId: board.lesson_id, snapshot: document.snapshot, scientificObjects: document.objects, selectedIds: [] });
  const regions = await regionsFor(input);
  resetProviderUsage();
  const started = Date.now();
  let output: Awaited<ReturnType<typeof understandCanvas>> | null = null;
  let error: string | null = null;
  try {
    output = await understandCanvas({
      boardId: board.id,
      courseId: board.course_id,
      lessonId: board.lesson_id,
      snapshot: document.snapshot,
      scientificObjects: document.objects,
      selectedIds: [],
      image: { regions },
      userQuestion: "Analyze this persisted board. Separate observed canvas data from uncertain interpretations.",
      mode: "deep",
      recognition: { mode: "auto" },
    });
  } catch (failure) {
    error = failure instanceof Error ? failure.message : "analysis failed";
  }
  const latencyMs = Date.now() - started;
  const usage = consumeProviderUsage();
  const expected = truth.mathWriting.find((item) => item.boardId === board.id)?.normalizedLabel ?? (truth.physAlign.boardId === board.id ? truth.physAlign.expectedReading : "");
  const ocrText = output?.ocr?.items.map((item) => item.text).join(" ") ?? "";
  const mathScore = expected ? scoreMathOCR(expected, ocrText) : null;
  const physAlign = board.id === truth.physAlign.boardId;
  const structureScore = physAlign && output ? scoreConceptCoverage(["wall", "spring", "o", "a", "f", "n", "axis", "graph"], structureText(output)) : null;
  results.push({
    boardId: board.id,
    name: board.name,
    expected,
    latencyMs,
    partial: output?.partial ?? null,
    warnings: output?.warnings ?? [],
    error,
    ocrText,
    answer: output?.answer ?? "",
    structureText: output ? structureText(output) : "",
    mathScore,
    structureScore,
    recognition: (output?.recognition?.results ?? []).map((result) => ({ groupId: result.groupId, candidates: result.candidates.map((candidate) => `${candidate.label}@${candidate.confidence}`) })),
    structure: {
      objects: output?.structure.objects.length ?? 0,
      relationships: output?.structure.relationships.length ?? 0,
      observations: output?.structure.observations.length ?? 0,
    },
    usage,
    costUsd: usage.reduce((sum, entry) => sum + entry.costUsd, 0),
  });
  const score = physAlign ? structureScore?.rate : mathScore?.tokenF1;
  console.log(`${board.name}: ${error ? `ERROR ${error}` : `${latencyMs}ms f1=${score ?? "n/a"} exact=${mathScore?.exact ?? false} partial=${output?.partial} cost=$${(usage.reduce((sum, entry) => sum + entry.costUsd, 0)).toFixed(6)}`}`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

const latencies = results.map((result) => Number(result.latencyMs));
const math = results.filter((result) => result.mathScore && !String(result.name).startsWith("PhysAlign"));
const summary = {
  boardCount: results.length,
  hardFailures: results.filter((result) => result.error).length,
  mathExactCount: math.filter((result) => (result.mathScore as { exact: boolean }).exact).length,
  mathAverageF1: Number((math.reduce((sum, result) => sum + Number((result.mathScore as { tokenF1: number }).tokenF1), 0) / Math.max(1, math.length)).toFixed(3)),
  physAlignStructureCoverage: Number(results.find((result) => String(result.name).startsWith("PhysAlign"))?.structureScore ? (results.find((result) => String(result.name).startsWith("PhysAlign"))!.structureScore as { rate: number }).rate : 0),
  averageLatencyMs: Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / Math.max(1, latencies.length)),
  latencyP50Ms: percentile(latencies, 0.5),
  latencyP95Ms: percentile(latencies, 0.95),
  totalCostUsd: Number(results.reduce((sum, result) => sum + Number(result.costUsd), 0).toFixed(6)),
  providerBudget: providerBudgetSnapshot(),
};
const payload = { createdAt: new Date().toISOString(), summary, results };
mkdirSync("data/canvas-benchmark", { recursive: true });
writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log("\nsummary", JSON.stringify(summary, null, 2));

if (updateBaseline) {
  const providerPartial = results.some((result) => result.partial && (result.warnings as string[]).some((warning) => /OCR failed|credits|HTTP 402|HTTP 429|HTTP 503/i.test(warning)));
  if (providerPartial || summary.hardFailures > 0) {
    console.error("refusing to update baseline: a board failed or was partial because a provider failed");
    process.exitCode = 1;
  } else {
    mkdirSync("docs/verification", { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(payload, null, 2));
    console.log("baseline updated", baselinePath);
  }
} else if (only) {
  console.log("single-board run; baseline comparison skipped");
} else {
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as typeof payload;
    const failures: string[] = [];
    if (summary.hardFailures > baseline.summary.hardFailures) failures.push(`hard failures ${summary.hardFailures} > ${baseline.summary.hardFailures}`);
    if (summary.mathExactCount < baseline.summary.mathExactCount - 1) failures.push(`math exact ${summary.mathExactCount} < ${baseline.summary.mathExactCount - 1}`);
    if (summary.mathAverageF1 < baseline.summary.mathAverageF1 - 0.1) failures.push(`math F1 ${summary.mathAverageF1} < ${(baseline.summary.mathAverageF1 - 0.1).toFixed(3)}`);
    if (summary.physAlignStructureCoverage < baseline.summary.physAlignStructureCoverage - 0.15) failures.push(`PhysAlign coverage ${summary.physAlignStructureCoverage} regressed`);
    if (failures.length) {
      console.error("benchmark regression:", failures.join("; "));
      process.exitCode = 1;
    } else {
      console.log("benchmark passed against", baselinePath);
    }
  } catch {
    console.log("no baseline; run with --update-baseline to record one");
  }
}

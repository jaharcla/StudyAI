import { createCanvasSpatialIndex } from "../src/canvas/spatial/index.js";
import type { CanvasSceneBounds, CanvasSceneNode } from "../src/canvas/spatial/types.js";

/**
 * Spatial scene-index benchmark.
 *
 * Builds a deterministic synthetic graph of 10,000 nodes and times 1,000 mixed
 * rect/nearest queries. Prints build time and p50/p95/p99 query latency.
 * The ADR target is p95 < 5 ms; this script reports the measurement and never
 * fails the process on timing (item 6 records or tunes the result).
 *
 * Usage: npx tsx scripts/benchmark-canvas-scene.ts [--cell-size=N] [--max-cells=N] [--linear-threshold=N]
 */

const NODE_COUNT = 10_000;
const QUERY_COUNT = 1_000;
const BOARD = { width: 4_000, height: 3_000 };
const ADR_P95_TARGET_MS = 5;

function intArg(name: string): number | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return undefined;
  const value = Number(match.slice(prefix.length));
  return Number.isFinite(value) ? value : undefined;
}

const cellSize = intArg("cell-size");
const maxCellsPerNode = intArg("max-cells");
const linearThreshold = intArg("linear-threshold");

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(0x5eed);

function boundsAt(x: number, y: number, width: number, height: number): CanvasSceneBounds {
  return { x, y, width, height };
}

function nodeAt(index: number): CanvasSceneNode {
  // One in ten nodes is a wide object that spans many cells (overflow path);
  // the rest are stroke-sized.
  const large = index % 10 === 0;
  const width = large ? 600 + random() * 600 : 16 + random() * 48;
  const height = large ? 400 + random() * 400 : 16 + random() * 48;
  const x = random() * (BOARD.width - width);
  const y = random() * (BOARD.height - height);
  return {
    id: `node-${index}`,
    kind: large ? "scientific-object" : "stroke",
    ref: { scope: large ? "science" : "quickdraw", id: `source-${index}` },
    bounds: boundsAt(x, y, width, height),
    boundsBasis: "source",
    text: large ? `concept ${index}` : null,
    recordType: null,
    origin: "geometry",
    verificationStatus: "source",
    confidence: null,
    sourceRefs: [],
    geometry: null,
    uncertaintyReasons: [],
  };
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

const nodes = Array.from({ length: NODE_COUNT }, (_, index) => nodeAt(index));

const index = createCanvasSpatialIndex({ cellSize, maxCellsPerNode, linearThreshold });
const buildStart = performance.now();
for (const node of nodes) index.insert(node);
const buildMs = performance.now() - buildStart;

const WINDDOWN_QUERIES = 100;
function runQuery(turn: number): number {
  const start = performance.now();
  if (turn % 2 === 0) {
    const width = 32 + random() * 480;
    const height = 32 + random() * 480;
    index.query(boundsAt(random() * (BOARD.width - width), random() * (BOARD.height - height), width, height));
  } else {
    index.nearest({ x: random() * BOARD.width, y: random() * BOARD.height }, 6);
  }
  return performance.now() - start;
}

for (let turn = 0; turn < WINDDOWN_QUERIES; turn++) runQuery(turn);

const timings: number[] = [];
for (let turn = 0; turn < QUERY_COUNT; turn++) timings.push(runQuery(turn));

const p50 = percentile(timings, 0.5);
const p95 = percentile(timings, 0.95);
const p99 = percentile(timings, 0.99);
const max = Math.max(...timings);
const rectCount = Math.ceil(QUERY_COUNT / 2);
const nearestCount = QUERY_COUNT - rectCount;

const fmt = (value: number) => value.toFixed(3);
console.log(`nodes: ${index.size()} (${NODE_COUNT} inserted, ${NODE_COUNT / 10} large/overflow candidates)`);
console.log(`build time: ${fmt(buildMs)} ms`);
console.log(`queries: ${QUERY_COUNT} mixed (${rectCount} rect, ${nearestCount} nearest 6)`);
console.log(`query p50: ${fmt(p50)} ms`);
console.log(`query p95: ${fmt(p95)} ms`);
console.log(`query p99: ${fmt(p99)} ms`);
console.log(`query max: ${fmt(max)} ms`);
console.log(`cell size: ${cellSize ?? 128} | max cells per node: ${maxCellsPerNode ?? 256} | linear threshold: ${linearThreshold ?? 256}`);
console.log(`ADR target: p95 < ${ADR_P95_TARGET_MS} ms -> ${p95 < ADR_P95_TARGET_MS ? "pass" : "miss"}`);

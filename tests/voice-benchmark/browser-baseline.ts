import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { percentile } from "./boundary-recorder.js";
import type { MetricSummary } from "./types.js";

export interface BrowserProbe {
  recognitionConstructor: "SpeechRecognition" | "webkitSpeechRecognition" | null;
  voiceCount: number;
  voiceNames: string[];
  recognitionError: string | null;
  recognitionInterim: boolean;
  recognitionFinal: boolean;
  synthesisStartMs: number | null;
  bargeInMs: number | null;
  cancellationVerified: boolean;
  notes: string[];
}

export interface BaselineRecord {
  candidate: "browser";
  runId: string;
  at: string;
  warmup: boolean;
  probe: BrowserProbe;
  measured: {
    ttfaMs: number | null;
    e2eMs: number | null;
    endpointMs: number | null;
    synthesisStartMs: number | null;
    bargeInMs: number | null;
    naturalness: number | null;
  };
  unmeasuredReasons: Record<string, string>;
}

export interface RunSummary {
  runs: number;
  synthesisStartMs: MetricSummary;
  bargeInMs: MetricSummary;
}

export function buildBaselineRecord(probe: BrowserProbe, runId: string, at: string): BaselineRecord {
  const reasons: Record<string, string> = {
    ttfaMs: "Web Speech exposes no audio samples for output, so first non-silent audio cannot be observed; only utterance onstart is available.",
    e2eMs: "Requires detected speech end plus audible playback; Web Speech provides neither in headless Chromium.",
    endpointMs: probe.recognitionError
      ? `Recognition failed with "${probe.recognitionError}"; no speech end was detected.`
      : probe.recognitionFinal
        ? "Endpointing is owned by the browser recognition service and exposes no last-voice timestamp."
        : "Recognition produced no final result, so no speech end was detected.",
    synthesisStartMs: probe.synthesisStartMs === null
      ? probe.voiceCount === 0
        ? "Chromium reported no output voices."
        : "Utterance onstart did not fire within 3000 ms."
      : "",
    bargeInMs: probe.bargeInMs === null
      ? probe.synthesisStartMs === null
        ? "No utterance started, so no barge-in could be measured."
        : "Utterance onend did not fire after cancel within 1500 ms."
      : "",
    naturalness: "No human listen score yet; the blind sheet is intentionally blank.",
  };
  for (const key of Object.keys(reasons)) {
    if (!reasons[key]) delete reasons[key];
  }
  return {
    candidate: "browser",
    runId,
    at,
    warmup: false,
    probe,
    measured: {
      ttfaMs: null,
      e2eMs: null,
      endpointMs: null,
      synthesisStartMs: probe.synthesisStartMs,
      bargeInMs: probe.bargeInMs,
      naturalness: null,
    },
    unmeasuredReasons: reasons,
  };
}

function summarizeValues(values: readonly number[]): MetricSummary {
  return {
    n: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : null,
  };
}

export function summarizeRuns(records: readonly BaselineRecord[]): RunSummary {
  const synthesis = records
    .map((record) => record.measured.synthesisStartMs)
    .filter((value): value is number => typeof value === "number");
  const bargeIn = records
    .map((record) => record.measured.bargeInMs)
    .filter((value): value is number => typeof value === "number");
  return {
    runs: records.length,
    synthesisStartMs: summarizeValues(synthesis),
    bargeInMs: summarizeValues(bargeIn),
  };
}

export function writeJsonl(path: string, records: readonly BaselineRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

const PROBE_SOURCE = readFileSync(new URL("./browser-probe.js", import.meta.url), "utf8");

/** One bounded probe in a real Chromium instance; no app server or key needed. */
export async function probeBrowser(headed = false): Promise<BrowserProbe> {
  const browser = await chromium.launch({
    headless: !headed,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const probe = await page.evaluate<BrowserProbe>(`(${PROBE_SOURCE})()`);
    probe.notes[0] = headed
      ? "Headed Chromium with a fake media device; no human listener."
      : "Headless Chromium with a fake media device; no human listener.";
    return probe;
  } finally {
    await browser.close();
  }
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const outPath = arg("--out", "data/voice-benchmark/browser-baseline.jsonl");
  const headed = process.argv.includes("--headed");
  const repetitions = Number(arg("--reps", "5"));
  const warmup = Number(arg("--warmup", "1"));
  if (!Number.isInteger(repetitions) || repetitions < 1 || !Number.isInteger(warmup) || warmup < 0) {
    console.error("--reps must be >= 1 and --warmup must be >= 0.");
    process.exitCode = 1;
  } else {
    const records: BaselineRecord[] = [];
    for (let index = 0; index < repetitions + warmup; index += 1) {
      const probe = await probeBrowser(headed);
      const record = buildBaselineRecord(probe, `browser-${index + 1}`, new Date().toISOString());
      record.warmup = index < warmup;
      if (record.warmup) record.probe.notes.push("Warm-up: excluded from the reported distribution.");
      records.push(record);
      console.log(`run ${index + 1}/${repetitions + warmup}: voices=${probe.voiceCount} recognition=${probe.recognitionError ?? (probe.recognitionFinal ? "final" : "no result")} synthesisStart=${probe.synthesisStartMs ?? "unmeasured"} ms`);
    }
    writeJsonl(outPath, records);
    console.log(JSON.stringify(summarizeRuns(records.filter((record) => !record.warmup)), null, 2));
    console.log(`wrote ${outPath}`);
  }
}

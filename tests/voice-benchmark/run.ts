import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATES, resolveCandidate } from "./adapters/registry.js";
import { createOllamaTutor } from "./adapters/ollama-tutor.js";
import { formatSummary } from "./boundary-recorder.js";
import { listenSheet } from "./listen-sheet.js";
import { runBenchmark } from "./pipeline.js";
import { PROMPTS } from "./prompts.js";
import type { TurnResult } from "./types.js";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

function unmeasuredTurn(promptId: string, candidate: string, reason: string): TurnResult {
  return {
    turnId: `${promptId}-${candidate}-unmeasured`,
    promptId,
    candidate,
    kind: PROMPTS.find((prompt) => prompt.id === promptId)!.kind,
    repetition: 0,
    status: "unmeasured",
    events: [],
    metrics: {
      ttfaMs: null, e2eMs: null, sttMs: null, endpointMs: null, llmTtftMs: null,
      ttsTtfaMs: null, handoffMs: null, rtf: null, peakRssMb: null, cpuContention: null,
    },
    note: reason,
  };
}

function writeJsonl(path: string, turns: TurnResult[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${turns.map((turn) => JSON.stringify(turn)).join("\n")}\n`, "utf8");
}

async function llmSmoke(): Promise<void> {
  const tutor = createOllamaTutor();
  const started = Date.now();
  let firstTokenMs: number | null = null;
  let characters = 0;
  for await (const token of tutor.stream({
    text: PROMPTS[0]!.text,
    sourceRefs: [],
    history: [],
    signal: new AbortController().signal,
  })) {
    if (firstTokenMs === null) firstTokenMs = Date.now() - started;
    characters += token.length;
  }
  console.log(`local tutor first token: ${firstTokenMs ?? "none"} ms; characters: ${characters}`);
}

async function main(): Promise<void> {
  const candidate = arg("--candidate", "self-test");
  const outPath = arg("--out", `data/voice-benchmark/${candidate}.jsonl`);
  const repetitions = Number(arg("--reps", "5"));
  const warmup = Number(arg("--warmup", "1"));

  if (process.argv.includes("--llm-smoke")) {
    await llmSmoke();
    return;
  }
  if (process.argv.includes("--list")) {
    for (const info of CANDIDATES) console.log(`${info.name} runnable=${info.runnable} — ${info.reason}`);
    return;
  }

  const info = resolveCandidate(candidate);
  if (!info) throw new Error(`Unknown candidate ${candidate}. Use --list to see candidates.`);

  let turns: TurnResult[];
  if (candidate === "self-test") {
    turns = (await runBenchmark({ candidate, repetitions, warmup })).turns;
  } else {
    turns = PROMPTS.map((prompt) => unmeasuredTurn(prompt.id, candidate, `Not measured: ${info.reason}`));
  }
  writeJsonl(outPath, turns);
  console.log(`candidate=${candidate} measured=${turns.filter((turn) => turn.status === "measured").length} total=${turns.length}`);
  console.log(formatSummary(turns));
  const sheetPath = arg("--listen-sheet", "data/voice-benchmark/listen-sheet.md");
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, listenSheet(CANDIDATES.map((item) => item.name)), "utf8");
  console.log(`wrote ${outPath}`);
  console.log(`wrote ${sheetPath}`);
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

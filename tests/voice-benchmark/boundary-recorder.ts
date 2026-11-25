import type { BoundaryEvent, BoundaryName, MetricName, MetricSummary, TurnMetrics, TurnObservation, TurnResult } from "./types.js";

export const METRIC_NAMES: readonly MetricName[] = [
  "ttfaMs", "e2eMs", "sttMs", "endpointMs", "llmTtftMs", "ttsTtfaMs", "handoffMs", "rtf", "peakRssMb", "cpuContention",
];

/** Records the six named boundaries for one turn against an injected clock. */
export class BoundaryRecorder {
  private readonly events: BoundaryEvent[] = [];

  constructor(private readonly turnId: string, private readonly now: () => number) {}

  mark(name: BoundaryName): void {
    this.markAt(name, this.now());
  }

  markAt(name: BoundaryName, atMs: number): void {
    const last = this.events[this.events.length - 1];
    if (last && atMs < last.atMs) throw new Error(`Boundary ${name} moved backwards`);
    this.events.push({ turnId: this.turnId, name, atMs });
  }

  snapshot(): BoundaryEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}

/** Nearest-rank percentile; null when there are no samples. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1] ?? null;
}

function gap(events: readonly BoundaryEvent[], from: BoundaryName, to: BoundaryName): number | null {
  const start = events.find((event) => event.name === from);
  const end = events.find((event) => event.name === to);
  return start && end ? end.atMs - start.atMs : null;
}

export function summarizeTurn(events: readonly BoundaryEvent[], observation: TurnObservation): TurnMetrics {
  return {
    ttfaMs: gap(events, "speech_end", "tts_first_audio"),
    e2eMs: gap(events, "speech_end", "playback_start"),
    sttMs: gap(events, "speech_end", "final_transcript"),
    endpointMs: observation.endpointMs,
    llmTtftMs: gap(events, "llm_request", "llm_first_token"),
    ttsTtfaMs: gap(events, "llm_first_token", "tts_first_audio"),
    handoffMs: gap(events, "tts_first_audio", "playback_start"),
    rtf: observation.ttsWallMs > 0 && observation.synthesizedAudioSeconds > 0
      ? observation.synthesizedAudioSeconds / (observation.ttsWallMs / 1000)
      : null,
    peakRssMb: observation.peakRssMb,
    cpuContention: observation.cpuContention,
  };
}

export function summarizeMetrics(turns: readonly TurnResult[]): Record<MetricName, MetricSummary> {
  const result = {} as Record<MetricName, MetricSummary>;
  for (const name of METRIC_NAMES) {
    const values = turns
      .map((turn) => turn.metrics[name])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    result[name] = {
      n: values.length,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      max: values.length === 0 ? null : Math.max(...values),
    };
  }
  return result;
}

function display(value: number | null): string {
  return value === null ? "null" : value.toFixed(1);
}

export function formatSummary(turns: readonly TurnResult[]): string {
  const summary = summarizeMetrics(turns);
  return METRIC_NAMES.map((name) => {
    const row = summary[name];
    return `${name} n=${row.n} p50=${display(row.p50)} p95=${display(row.p95)} max=${display(row.max)}`;
  }).join("\n");
}

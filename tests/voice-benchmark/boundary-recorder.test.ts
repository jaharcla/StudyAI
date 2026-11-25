import { describe, expect, it } from "vitest";
import { BoundaryRecorder, formatSummary, percentile, summarizeMetrics, summarizeTurn } from "./boundary-recorder.js";
import type { BoundaryEvent, TurnMetrics, TurnResult } from "./types.js";

function events(entries: Array<[BoundaryEvent["name"], number]>, turnId = "t1"): BoundaryEvent[] {
  return entries.map(([name, atMs]) => ({ turnId, name, atMs }));
}

const observation = {
  synthesizedAudioSeconds: 4,
  ttsWallMs: 2000,
  endpointMs: 120,
  peakRssMb: 640,
  cpuContention: 0.2,
};

const turn = (values: Partial<TurnMetrics>): TurnResult => ({
  turnId: "t",
  promptId: "p",
  candidate: "self-test",
  kind: "course",
  repetition: 1,
  status: "measured",
  events: [],
  metrics: {
    ttfaMs: null, e2eMs: null, sttMs: null, endpointMs: null, llmTtftMs: null,
    ttsTtfaMs: null, handoffMs: null, rtf: null, peakRssMb: null, cpuContention: null,
    ...values,
  },
});

describe("BoundaryRecorder", () => {
  it("stamps ordered boundaries with the turn id and injected clock", () => {
    let now = 100;
    const recorder = new BoundaryRecorder("turn-7", () => now);
    recorder.mark("speech_end");
    now = 180;
    recorder.mark("final_transcript");
    now = 260;
    recorder.mark("tts_first_audio");
    expect(recorder.snapshot()).toEqual([
      { turnId: "turn-7", name: "speech_end", atMs: 100 },
      { turnId: "turn-7", name: "final_transcript", atMs: 180 },
      { turnId: "turn-7", name: "tts_first_audio", atMs: 260 },
    ]);
  });

  it("rejects a boundary that moves the clock backwards", () => {
    let now = 500;
    const recorder = new BoundaryRecorder("turn-8", () => now);
    recorder.mark("speech_end");
    now = 400;
    expect(() => recorder.mark("llm_request")).toThrow(/backwards/);
  });

  it("returns an independent snapshot", () => {
    const recorder = new BoundaryRecorder("turn-9", () => 1);
    recorder.mark("speech_end");
    const snapshot = recorder.snapshot();
    snapshot[0]!.atMs = 999;
    expect(recorder.snapshot()[0]!.atMs).toBe(1);
  });
});

describe("summarizeTurn", () => {
  it("computes stage gaps from the six boundaries", () => {
    const gaps = summarizeTurn(events([
      ["speech_end", 1000],
      ["final_transcript", 1060],
      ["llm_request", 1080],
      ["llm_first_token", 1300],
      ["tts_first_audio", 1700],
      ["playback_start", 1760],
    ]), observation);
    expect(gaps.ttfaMs).toBe(700);
    expect(gaps.e2eMs).toBe(760);
    expect(gaps.sttMs).toBe(60);
    expect(gaps.endpointMs).toBe(120);
    expect(gaps.llmTtftMs).toBe(220);
    expect(gaps.ttsTtfaMs).toBe(400);
    expect(gaps.handoffMs).toBe(60);
    expect(gaps.rtf).toBe(2);
    expect(gaps.peakRssMb).toBe(640);
    expect(gaps.cpuContention).toBe(0.2);
  });

  it("leaves missing and non-positive derived metrics null", () => {
    const gaps = summarizeTurn(events([
      ["speech_end", 100],
      ["final_transcript", 100],
      ["tts_first_audio", 90],
    ]), { ...observation, synthesizedAudioSeconds: 0, ttsWallMs: 0, endpointMs: null, peakRssMb: null, cpuContention: null });
    expect(gaps.e2eMs).toBeNull();
    expect(gaps.llmTtftMs).toBeNull();
    expect(gaps.rtf).toBeNull();
    expect(gaps.endpointMs).toBeNull();
    expect(gaps.peakRssMb).toBeNull();
    expect(gaps.ttfaMs).toBe(-10);
  });
});

describe("percentile", () => {
  it("uses nearest-rank p50, p95 and max", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0.5)).toBe(30);
    expect(percentile(values, 0.95)).toBe(50);
    expect(percentile(values, 1)).toBe(50);
  });

  it("returns null for no samples", () => {
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("summarizeMetrics", () => {
  it("reports n, p50, p95 and max for every metric", () => {
    const summary = summarizeMetrics([
      turn({ ttfaMs: 100, e2eMs: 200 }),
      turn({ ttfaMs: 300, e2eMs: 600 }),
    ]);
    expect(summary.ttfaMs).toEqual({ n: 2, p50: 100, p95: 300, max: 300 });
    expect(summary.e2eMs).toEqual({ n: 2, p50: 200, p95: 600, max: 600 });
    expect(summary.endpointMs.n).toBe(0);
    expect(summary.endpointMs.p50).toBeNull();
  });

  it("formats a human-readable table without inventing missing values", () => {
    const text = formatSummary([turn({ ttfaMs: 100, e2eMs: 200 })]);
    expect(text).toMatch(/ttfaMs/);
    expect(text).toMatch(/n=1/);
    expect(text).toMatch(/null/);
  });
});

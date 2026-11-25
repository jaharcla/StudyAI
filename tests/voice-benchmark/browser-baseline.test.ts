import { describe, expect, it } from "vitest";
import { buildBaselineRecord, summarizeRuns, type BrowserProbe } from "./browser-baseline.js";

const emptyProbe: BrowserProbe = {
  recognitionConstructor: null,
  voiceCount: 0,
  voiceNames: [],
  recognitionError: null,
  recognitionInterim: false,
  recognitionFinal: false,
  synthesisStartMs: null,
  bargeInMs: null,
  cancellationVerified: false,
  notes: [],
};

describe("buildBaselineRecord", () => {
  it("leaves latency fields null with exact reasons when the browser has no speech features", () => {
    const record = buildBaselineRecord(emptyProbe, "run-1", "2026-11-25T00:00:00Z");
    expect(record.measured).toEqual({
      ttfaMs: null, e2eMs: null, endpointMs: null,
      synthesisStartMs: null, bargeInMs: null, naturalness: null,
    });
    expect(record.unmeasuredReasons.ttfaMs).toMatch(/no audio samples/i);
    expect(record.unmeasuredReasons.endpointMs).toMatch(/no final result/i);
    expect(record.unmeasuredReasons.naturalness).toMatch(/human/i);
  });

  it("keeps a measured synthesis start and barge-in but never promotes them to TTFA", () => {
    const probe: BrowserProbe = {
      ...emptyProbe,
      recognitionConstructor: "webkitSpeechRecognition",
      recognitionError: "network",
      voiceCount: 1,
      voiceNames: ["Test Voice"],
      synthesisStartMs: 320,
      bargeInMs: 85,
      cancellationVerified: true,
    };
    const record = buildBaselineRecord(probe, "run-2", "2026-11-25T00:00:00Z");
    expect(record.measured.synthesisStartMs).toBe(320);
    expect(record.measured.bargeInMs).toBe(85);
    expect(record.measured.ttfaMs).toBeNull();
    expect(record.measured.e2eMs).toBeNull();
    expect(record.probe.recognitionError).toBe("network");
  });
});

describe("recognition failure reporting", () => {
  it("records the exact recognition error instead of a generic reason", () => {
    const record = buildBaselineRecord({ ...emptyProbe, recognitionError: "network" }, "net", "t");
    expect(record.unmeasuredReasons.endpointMs).toContain('"network"');
  });
});

describe("summarizeRuns", () => {
  it("counts measured values without inventing missing ones", () => {
    const a = buildBaselineRecord(emptyProbe, "a", "t");
    const b = buildBaselineRecord({ ...emptyProbe, synthesisStartMs: 400 }, "b", "t");
    expect(summarizeRuns([a, b])).toEqual({
      runs: 2,
      synthesisStartMs: { n: 1, p50: 400, p95: 400, max: 400 },
      bargeInMs: { n: 0, p50: null, p95: null, max: null },
    });
  });
});

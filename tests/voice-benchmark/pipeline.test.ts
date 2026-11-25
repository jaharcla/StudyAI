import { describe, expect, it } from "vitest";
import { formatSummary } from "./boundary-recorder.js";
import { createSelfTestDeps, runBenchmark, runTurn } from "./pipeline.js";
import { PROMPTS } from "./prompts.js";

describe("voice benchmark pipeline", () => {
  it("records all six boundaries in order on a normal turn", async () => {
    const result = await runTurn({ prompt: PROMPTS[0]!, candidate: "self-test", repetition: 1, deps: createSelfTestDeps() });
    expect(result.status).toBe("measured");
    expect(result.events.map((event) => event.name)).toEqual([
      "speech_end", "final_transcript", "llm_request", "llm_first_token", "tts_first_audio", "playback_start",
    ]);
    expect(result.metrics.ttfaMs).toBeGreaterThan(0);
    expect(result.metrics.e2eMs).toBeGreaterThanOrEqual(result.metrics.ttfaMs ?? 0);
    expect(result.metrics.rtf).toBeGreaterThan(0);
  });

  it("barge-in cancels generation and drops queued audio", async () => {
    const deps = createSelfTestDeps();
    deps.bargeInAfterWords = 4;
    let stops = 0;
    const stop = deps.transport.stop;
    deps.transport.stop = () => { stops += 1; stop(); };
    const prompt = PROMPTS.find((item) => item.kind === "interrupted")!;
    const result = await runTurn({ prompt, candidate: "self-test", repetition: 1, deps });
    expect(result.status).toBe("interrupted");
    expect(stops).toBe(1);
    expect(result.note).toMatch(/cancel/);
    expect(deps.llm.stream).toBeDefined();
  });

  it("runs a warm-up plus five counted repetitions and summarizes", async () => {
    const output = await runBenchmark({ candidate: "self-test", kinds: ["course"], limitPrompts: 1, repetitions: 5, warmup: 1 });
    expect(output.turns.length).toBe(6);
    expect(output.turns[0]!.note).toMatch(/[Ww]arm-up/);
    expect(output.turns.slice(1).every((turn) => turn.status === "measured")).toBe(true);
    expect(formatSummary(output.turns)).toMatch(/ttfaMs n=6/);
  });
});

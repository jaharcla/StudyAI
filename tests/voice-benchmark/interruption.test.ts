import { describe, expect, it } from "vitest";
import { trimHistoryToSpokenWords, TurnController, type TurnControllerDeps } from "./interruption.js";
import type { HistoryEntry } from "./types.js";

function controller(history: HistoryEntry[] = []) {
  const calls = { abortLLM: 0, cancelTTS: 0, dropAudio: 0 };
  const deps: TurnControllerDeps = {
    now: () => 1000,
    history,
    onAbortLLM: () => { calls.abortLLM += 1; },
    onCancelTTS: () => { calls.cancelTTS += 1; },
    onDropAudio: () => { calls.dropAudio += 1; },
  };
  return { turn: new TurnController(deps), calls };
}

describe("trimHistoryToSpokenWords", () => {
  const history: HistoryEntry[] = [
    { role: "student", text: "What does the module say about ions?" },
    { role: "tutor", text: "It says ions lose or gain electrons to reach a noble-gas configuration." },
  ];

  it("keeps the whole history when every word was spoken", () => {
    expect(trimHistoryToSpokenWords(history, 999)).toEqual(history);
  });

  it("truncates the last tutor turn to the words actually spoken", () => {
    expect(trimHistoryToSpokenWords(history, 3)).toEqual([
      history[0],
      { role: "tutor", text: "It says ions" },
    ]);
  });

  it("drops an unspoken final tutor turn entirely", () => {
    expect(trimHistoryToSpokenWords(history, 0)).toEqual([history[0]]);
  });
});

describe("TurnController", () => {
  it("barge-in aborts the LLM, cancels TTS and drops queued audio once each", () => {
    const { turn, calls } = controller();
    turn.startGeneration();
    turn.bargeIn(4);
    expect(calls).toEqual({ abortLLM: 1, cancelTTS: 1, dropAudio: 1 });
    expect(turn.signal.aborted).toBe(true);
    expect(turn.isCancelled).toBe(true);
  });

  it("marks an in-flight generation obsolete and ignores a repeated barge-in", () => {
    const { turn, calls } = controller();
    const generation = turn.startGeneration();
    expect(turn.isObsolete(generation)).toBe(false);
    turn.bargeIn(2);
    expect(turn.isObsolete(generation)).toBe(true);
    turn.bargeIn(2);
    expect(calls).toEqual({ abortLLM: 1, cancelTTS: 1, dropAudio: 1 });
  });

  it("trims history to spoken words when the student interrupts", () => {
    const { turn } = controller([
      { role: "student", text: "Tell me about orbitals." },
      { role: "tutor", text: "Orbitals fill in energy order from lowest to highest." },
    ]);
    turn.bargeIn(5);
    expect(turn.history()).toEqual([
      { role: "student", text: "Tell me about orbitals." },
      { role: "tutor", text: "Orbitals fill in energy order" },
    ]);
  });

  it("allows a fresh generation only after a new turn starts", () => {
    const { turn } = controller();
    const old = turn.startGeneration();
    turn.bargeIn(0);
    expect(turn.isObsolete(old)).toBe(true);
    turn.append({ role: "student", text: "New question." });
    expect(turn.history()).toEqual([{ role: "student", text: "New question." }]);
  });
});

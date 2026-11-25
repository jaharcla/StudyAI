export type CandidateName = "self-test" | "browser" | "kokoro" | "phonon" | "pocket-tts" | "moss-ts";

export interface CandidateInfo {
  name: CandidateName;
  /** False means the harness can describe the candidate but cannot run it yet. */
  runnable: boolean;
  reason: string;
}

/** No engine is imported here. Weights and adapters are opt-in and never auto-downloaded. */
export const CANDIDATES: readonly CandidateInfo[] = [
  { name: "self-test", runnable: true, reason: "Deterministic in-process adapters; proves the harness, not a voice engine." },
  { name: "browser", runnable: false, reason: "Probed in Chromium 2026-11-25: SpeechRecognition exists but headless gave no result and headed failed with 'network'; getVoices() returned 0 voices in both. TTFA, E2E, endpoint, barge-in and naturalness remain unmeasured; see docs/research/2026-11-25-browser-voice-baseline.md." },
  { name: "kokoro", runnable: false, reason: "Kokoro-82M q8 weights and a kokoro-js adapter are not installed; no download performed." },
  { name: "phonon", runnable: false, reason: "Phonon weights are gated on a measured Kokoro result; not installed." },
  { name: "pocket-tts", runnable: false, reason: "Pocket-TTS weights are gated on earlier benchmark results; not installed." },
  { name: "moss-ts", runnable: false, reason: "MOSS-TTS weights are gated on earlier benchmark results; not installed." },
];

export function resolveCandidate(name: string): CandidateInfo | undefined {
  return CANDIDATES.find((candidate) => candidate.name === name);
}

# Browser Web Speech baseline — measured probe (2026-11-25)

The browser baseline is a fallback, not a selected TTS engine. This run probed it in real Chromium using the existing `tests/voice-benchmark/` harness and boundary recorder. No weights were downloaded, no dependency or key was added, and no product code changed.

## What ran

`npx tsx tests/voice-benchmark/browser-baseline.ts` launches Chromium on `about:blank` with a fake media device and runs one bounded probe per repetition: recognition start with interim/final events, `speechSynthesis.getVoices()`, an utterance with `onstart`, then `cancel()` with `onend`. One warm-up plus five counted repetitions ran headless; one additional run ran headed.

Results are in `data/voice-benchmark/browser-baseline.jsonl` and `data/voice-benchmark/browser-baseline-headed.jsonl` (gitignored generated data).

## Measured table

| Field | Headless (5 counted runs) | Headed (1 run) | Reason |
| --- | --- | --- | --- |
| `SpeechRecognition` constructor | present | present | `SpeechRecognition` is exposed by this Chromium build. |
| Recognition interim/final | none | none | Headless produced no result in 2500 ms; headed failed with `network`. |
| `speechSynthesis.getVoices()` | 0 voices | 0 voices | No output voices after waiting 1500 ms. |
| TTFA (`speech_end` → first audible sample) | unmeasured | unmeasured | Web Speech exposes no audio samples for output; only `onstart` is observable. |
| End-to-end turn latency | unmeasured | unmeasured | Requires detected speech end plus audible playback. |
| Endpointing | unmeasured | unmeasured | No final transcript, so no speech end was detected. |
| `synthesisStartMs` | unmeasured (n=0) | unmeasured (n=0) | No voices, so no utterance started. |
| Barge-in latency | unmeasured (n=0) | unmeasured (n=0) | No utterance started, so no cancellation could be timed. |
| Obsolete-generation cancellation | harness-level only | harness-level only | Proven by unit tests in `interruption.test.ts`, not by a browser mic. |
| Naturalness listen score | blank | blank | No human listener scored the blind sheet. |

Every null field carries an exact reason in the JSONL; no latency, confidence number, listen score or winner was invented.

## Verification

- `npx tsc -b` exit 0.
- Targeted Vitest: 4 tests in `browser-baseline.test.ts` pass, including a check that the exact `network` error is recorded and that measured synthesis/barge-in values are never promoted to TTFA.
- Full Vitest: 145 files / 915 tests pass.
- Headless CLI run exit 0: 6 probes, 5 counted, summarizer printed `n=0` for both measurable timing fields.
- Headed CLI run exit 0: one probe, `recognitionError="network"`, zero voices.
- Free RAM stayed above 2.1 GB throughout; no suite overlapped another.

## Gate status

The selection gate from the benchmark plan is unchanged and **not passed**: the browser baseline produced no usable timing or audio, and Kokoro, Phonon, Pocket-TTS and MOSS-TTS remain unmeasured with no weights installed. No TTS engine is selected. The blind listen sheet stays blank until a human listens.

## What this rules out and what it does not

- It rules out this headless/headed Chromium setup as a source of a measurable browser baseline: no voices and no recognition result.
- It does not rule out browser voices on the student's own machine, a real microphone, or a local neural engine. Those need a different environment or an approved weights download.
- The harness's barge-in and history-trimming logic remains covered by deterministic unit tests, not by a live microphone interruption.

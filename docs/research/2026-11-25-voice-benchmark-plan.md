# Reproducible desktop voice-tutor benchmark (2026-11-25)

The user's guiding decision: prioritize the live desktop voice tutor; treat podcast narration as a separate pipeline. Do not commit to a TTS model before a reproducible benchmark on the target hardware.

## What must be measured

Primary metric: **time to first audible audio** (TTFA), measured from detected end of the student's speech to the first non-silent output sample, not from request start. Secondary: end-to-end turn latency, sustained real-time factor over a long utterance, peak RAM, CPU/GPU contention, voice naturalness by a human listener, STT word error rate, false endpoint rate, barge-in latency, and obsolete-generation cancellation.

Pipeline boundaries recorded for every turn, following the pattern in [realtime-voice-agent](https://github.com/CJimenezVC/realtime-voice-agent): `speech_end`, `final_transcript`, `llm_request`, `llm_first_token`, `tts_first_audio`, `playback_start`. Stage gaps: STT, endpointing, LLM TTFT, TTS TTFA, handoff, device. Interrupted and incomplete turns are logged separately.

## Fixed test setup

- Same local Tutor LLM and evidence contract for every candidate; no OpenAI or Gemini dependency.
- Same 12 spoken chemistry prompts drawn from a real course PDF, plus three refusal prompts and three deliberately interrupted turns.
- Same desktop machine and browser, with nothing else running; record free RAM before and peak RSS during each run.
- Same output device volume and a fixed 1.0 speaking rate where the engine supports it.
- Five repetitions per candidate per prompt; discard the first warm-up run; report n, p50, p95 and max, not a single lucky number.
- Naturalness: the student listens blind to the same 30-second passage per engine and assigns a 1–5 score with one sentence of reasoning. No UTMOS claim is substituted for that listen test.

## Candidate adapters, in order

1. **Browser baseline** — `SpeechRecognition` with `processLocally` where available plus `SpeechSynthesis`. Zero downloads. Designed as the fallback, not the target.
2. **Kokoro-82M q8 via `kokoro-js`** — the only model download already approved; use it as the first neural candidate. Report its measured TTFA before considering any further download.
3. **Phonon** — small WASM model with streamed 80 ms frames; request its weights only if Kokoro misses the TTFA target or the listen gate.
4. **Pocket-TTS** — CPU streaming with voice cloning; request weights only if 2 and 3 fail the naturalness or conversation-prosody gate.
5. **MOSS-TTS-Nano / Realtime** — local voice-agent option; request only if the above cannot meet the latency budget without a cloud provider.
6. **BYOK cloud voice** — optional seam, never a default; out of scope for the benchmark until the student supplies a key.

Each adapter implements the same interface: `streamTranscript()`, `detectTurnEnd()`, `synthesizeStream(textChunks)`, `cancel()`, `playbackPosition()`. The benchmark harness never imports an engine directly.

## Required pipeline behaviour

Genuine streaming STT with interim and final transcripts; adaptive endpointing instead of a fixed silence timer; immediate barge-in that stops playback and drops queued audio within a few hundred milliseconds; cancellation of the obsolete LLM stream and TTS task on interruption; sentence/clause-aware buffering from LLM tokens into TTS so synthesis begins before the full answer exists; conversation history trimmed to the words actually spoken. STT, TTS, VAD, turn detection and transport stay modular.

No heavyweight orchestration framework (Pipecat or LiveKit Agents) and no extra model weights until a benchmark shows a concrete benefit. Their designs are references for the harness, not dependencies.

## Gate for selection

A candidate is selected only after it beats the browser baseline on p95 TTFA, passes the student's naturalness listen test, sustains real-time factor below 1 on a 60-second passage without exceeding the RAM ceiling, and survives the barge-in and cancellation tests. If no candidate passes, keep the browser fallback with an honest notice and report the failure rather than naming a winner.

## Deliverable

A committed harness under `tests/voice-benchmark/` with a CLI that runs one candidate, a JSONL results file per run, a summarizer that prints the metrics above, and a short report in `docs/research/` containing the measured table, the listen scores, and the justified selection. No product code changes until that report exists.

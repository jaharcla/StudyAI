# Voice-tutor benchmark harness (2026-11-25)

This is the reproducible harness from [the benchmark plan](2026-11-25-voice-benchmark-plan.md), not a product feature and not a model selection. No engine weights were downloaded, no Playwright suite was run, no `.env` was touched, and no product code changed.

## What exists

`tests/voice-benchmark/` contains:

- `types.ts` — one adapter contract each for STT, TTS, VAD, turn detection, transport and the local Tutor LLM. The harness never imports an engine directly.
- `boundary-recorder.ts` — records `speech_end`, `final_transcript`, `llm_request`, `llm_first_token`, `tts_first_audio` and `playback_start` per turn, and summarizes n, p50, p95 and max.
- `sentence-buffer.ts` — clause/sentence-aware buffering so TTS starts before the whole LLM answer exists.
- `interruption.ts` — barge-in aborts the LLM stream, cancels TTS, drops queued audio, invalidates obsolete generations and trims history to words actually spoken.
- `pipeline.ts` — runs one turn through all five stages with injected adapters; a deterministic self-test driver runs one warm-up plus five repetitions per prompt.
- `prompts.ts` — 12 course-topic prompts, three refusal prompts and three interrupted prompts. These are student questions about the topic of the real CHEM 121 Module 3 PDF, not invented facts, citations or answer keys.
- `adapters/ollama-tutor.ts` — the same local Tutor model through Ollama's streaming endpoint, rebuilding the frozen evidence contract and its deterministic notice. No OpenAI or Gemini dependency.
- `adapters/browser-speech.ts` — zero-download Web Speech fallback seam. It needs a real browser and microphone; the CLI cannot exercise it.
- `adapters/registry.ts` — candidate list with honest availability; no engine import and no auto-download.
- `run.ts` — CLI with `--candidate`, `--list`, `--llm-smoke`, `--reps`, `--warmup`, `--out` and `--listen-sheet`.
- `listen-sheet.ts` — blind 1–5 naturalness sheet with a fixed, neutral passage. No UTMOS or other proxy is substituted.

Generated JSONL and listen sheets go to `data/voice-benchmark/`, which is gitignored.

## Reuse decisions

- Reused the real `buildTutorEvidenceContract` and `groundingNotice` instead of writing a second evidence contract.
- Used Node built-ins (`fs`, `path`, `url`, `fetch`) and existing Vitest; no new dependency, no paid service and no `.env` change.
- Did not adopt Pipecat or LiveKit Agents: their designs informed the stage boundaries, but the harness keeps STT/TTS/VAD/turn-detection/transport modular without an orchestration framework.
- Reached the local tutor through Ollama's own streaming endpoint, the same model family the app already uses, with no OpenAI or Gemini dependency.

## Verification performed

- `npx tsc -b` exit 0.
- `npx vitest run`: 143 files / 902 tests passed, including 26 new tests for the boundary recorder, interruption/cancellation, sentence buffering and the end-to-end pipeline.
- CLI self-test (`--candidate self-test --reps 5 --warmup 1`): 108 turns, 90 measured, 18 scripted interruptions, JSONL written. Summarizer printed every metric.

## Measured results

**No real engine has been measured.** The self-test numbers are synthetic clock values produced by in-process adapters; they prove the harness records and summarizes boundaries, and must never be reported as TTS/STT performance.

| Candidate | Status | Reason |
| --- | --- | --- |
| self-test | Harness proven, not a voice engine | Deterministic in-process adapters |
| browser | Unmeasured | Needs a real browser and microphone; no Playwright run authorized |
| kokoro | Unmeasured | Weights/adapter not installed; no download performed |
| phonon | Unmeasured | Gated on a measured Kokoro result |
| pocket-tts | Unmeasured | Gated on earlier benchmark results |
| moss-ts | Unmeasured | Gated on earlier benchmark results |

The listen sheet is ready but has no scores: the student has not listened to any engine yet.

## Selection gate (unchanged from the plan)

A candidate is selected only after it beats the browser baseline on p95 time to first audible audio, passes the student's blind naturalness listen test, sustains real-time factor below 1 on a 60-second passage without exceeding the RAM ceiling, and survives barge-in and obsolete-generation cancellation. If none passes, keep the browser fallback with an honest notice and report the failure rather than naming a winner.

## Limits of this harness today

- The evidence contract is exercised with no course excerpts supplied, so it deterministically reports `No course evidence`. No retrieval server is running in this worktree; no facts or source refs are invented to make it look grounded.
- The self-test LLM and TTS are fake adapters. `createOllamaTutor()` is wired but only used by the opt-in `--llm-smoke` command; a live LLM turn has not been benchmarked here.
- The Web Speech adapter approximates playback position from wall time because the browser API does not expose a sample-accurate position.
- Interrupted turns are scripted by token count, not by a real microphone barge-in.

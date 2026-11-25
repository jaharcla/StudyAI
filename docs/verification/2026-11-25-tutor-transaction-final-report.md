# Tutor transaction final report (2026-11-25)

This is the final report requested by the authoritative directive **"AUTHORITATIVE DIRECTIVE — StudyAI: Make the Tutor Transaction Reliable"** (P0), adopted from ChatGPT. It covers one vertical slice: a real student question answered from their indexed KIN 120 material, with inspectable evidence.

## Verified root cause

The 02:34–02:45 walkthrough turn sat in `Working...` for ~11 seconds and returned to the workspace launcher. The cause was a tutor-thread reset driven by **transient course/lesson IDs**: while a scope was still loading, a missing or changing `courseId`/`lessonId` was treated as a genuine scope change, so the in-flight answer's conversation was discarded and the panel fell back to its initial state. The provider call itself was not the root cause; the state transition was.

This was established by tracing the live lifecycle in `src/App.tsx` and `src/workspace-state.ts`, not by assuming the 02:45 navigation was to blame. The request was exercised both with and without navigation during generation.

## Files and components changed

- `src/workspace-state.ts` — scope helpers: `tutorThreadScope()` and `shouldStartNewTutorThread()`.
- `src/App.tsx` — tutor scope effect now resets the thread only on a genuine change between two **complete** `course:lesson` scopes; Studio source handoff is cleared only for the visit that consumes it.
- `tests/workspace-state.test.ts` — unit regressions for incomplete-scope and genuine-switch cases.
- `tests/e2e/tutor-round2-hygiene.spec.ts` — DOM assertions for a grounded answer and course persistence.
- `tests/e2e/coach.spec.ts` — Studio source-focus leak regression.
- `docs/verification/2026-11-25-integration-boundary-audit.md` — six-boundary audit record.

Commits: `78d0df1` (fix), `1d468d5` (test), `98b5314` / `89a8c55` (audit + Studio fix).

## Architectural correction

A tutor thread belongs to a **fully resolved** `course:lesson` scope. While either ID is still loading, the scope is incomplete and must **not** start a new thread. Only a change between two complete scopes resets the conversation. This is a small correction inside the existing state layer; no provider, routing, persistence schema, or dependency changed. Local-first and BYOK are preserved.

## Automated test results

Full `npm run verify` on main `7731854`: exit 0. `tsc -b` clean; Vitest **145 files / 915 tests** pass; Playwright **143 passed, 2 flaky, 6 skipped** of 151. The two flaky specs are `canvas-visual-remediation` (shared tokens) and `math-workspace` (Quickdraw parameter sync) — both pre-existing and unrelated to the tutor transaction. No validation was weakened to obtain passing results.

## Actual browser verification results

A one-uninterrupted Playwright journey on a real KIN 120 course PDF produces 13 ordered end-state screenshots covering J1–J7, including grounded answer, citations opening the exact passage, abstention, course persistence across navigation, and reload restoration. The only stub in that run is an injected 503 to exercise the retry path.

**This is not proof of the live-provider turn.** No OpenAI or Gemini API key is configured in this environment, so browser verification uses the local deterministic path. The exact 02:34–02:45 turn with the configured cloud provider and model routing **could not be run locally** and is *not* claimed as verified.

## Remaining defects and risks

- **Live-provider turn unverified** — needs a machine with a configured BYOK key, or the user to add one. Not declared green.
- **ChatGPT upload limit** — the ten individual walkthrough screenshots remain unattached ("wait ~18 hours"); the final ordered screenshot scorecard is still pending.
- **Voice engine unselected** — browser Web Speech gave no usable recognition and zero voices; Kokoro-82M q8 is the only approved candidate and has no measured weights or results yet.
- **Answer keys are not entailment-checked** end to end; `initialArtifactId`/`initialDeckId` remain inert handoff props (out of fix scope).
- **Two pre-existing flaky specs** as listed above.
- The 02:49 "Welcome to KIN 120" reappearance is confirmed intentional onboarding, not a regression.

## Acceptance-criteria status

| Criterion | Status |
| --- | --- |
| Tutor question grounded in retrieved student material | Pass (local deterministic path) |
| Citations resolve to verifiable source pages | Pass (local deterministic path) |
| Unsupported questions produce explicit abstention | Pass |
| Navigation and reload preserve conversation and course | Pass |
| Relevant regression tests pass | Pass |
| TypeScript, build, test gates pass | Pass |
| Question completes with the configured live provider | **Unverified — no key in this environment** |

**Verdict:** not declared fully complete. The deterministic end-to-end slice is green; the live-provider acceptance criterion is open and is the single remaining blocker to calling the directive done.

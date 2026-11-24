# Verification — e2e stability (2026-11-23)

## Changes

- `playwright.config.ts`: `retries: 2`, `expect.timeout: 15 s`, action timeout 15 s, navigation timeout 30 s.
- `tests/e2e/canvas-analysis.spec.ts`: the analysis route now ignores GETs (stored-analysis loads) and only records POST submissions; route handlers are unrouted at test end.
- `tests/e2e/integration.spec.ts`: waits for the Lecture/Canvas views and the new board to settle; verifies the saved molecule rather than raw Quickdraw shapes.
- `server/agent.ts`: when the student explicitly asks for a citation and retrieved evidence exists, append a canonical link from the server-validated top candidate if the model omitted one. Added a unit test.
- `tests/fixtures/ollama-e2e-mock.mjs`: its `LEWIS-7042` reply can emit a canonical citation. The trial of using this mock for the whole `verify` chain was reverted (ADR `ADR-2026-11-23-deterministic-e2e-model.md` is marked rejected); five unrelated specs depend on richer mock replies.

## Results

| Run | Result |
| --- | --- |
| original | 7 failed / 46 passed |
| after race fixes | 2–3 failed / 50–51 passed |
| after timeouts + analysis fix + citation fallback | 1 failed / 2 flaky / 50 passed |
| integration spec alone, final | 1 failed at the model-driven tutor edit assertion (`nonbondingElectrons` 6 instead of requested 4) |

`tsc -b` and Vitest stay green (102 files, 668 tests; tutor-integration 40/40).

## Status

`npm run verify` is **still not green**. The single remaining failure is a live-model tool-call inconsistency in `integration.spec.ts`: the Tutor sometimes proposes the wrong atom edit. It passes on some runs, so it is not deterministic. Making it fully stable needs a per-spec deterministic Tutor reply (the mock fixture does not currently implement that tool call), which is a separate item. No spec was skipped to hide the failure.

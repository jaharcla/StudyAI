# Verification — sequential gate results (2026-11-25)

Discord thread: https://discord.com/channels/1574451017817399346/1575263169654427778
Diff: https://critique.work/v/4abab09d7110346ae5eadde284f76f2a

All branches were verified with a full local `.env` (59 keys, including the real `CPK_INTELLIGENCE_API_KEY`), default port configuration, no `WEB_PORT` override and no environment changes. Only one Playwright suite ran at a time. Free RAM never fell below the 1 GB stop line. No branch was merged or pushed by the worker.

## Branch 1 — bounded math evaluator

Worktree `.worktrees/bounded-math-evaluator-20261125`, branch `work/bounded-math-evaluator-20261125`, commit `4ef1ee8`.

Command: `npm run verify` (defined as `tsc -b && vitest run && playwright test`).

| Stage | Exact result | Exit |
|---|---|---|
| `tsc -b` | no output | 0 |
| `vitest run` | `Test Files 151 passed (151)`; `Tests 956 passed (956)`; 18.89s | 0 |
| `playwright test` | `158 passed (15.6m)`, `6 skipped`, `2 flaky`; `results.json` reports `unexpected: 0` | 0 |

Free RAM sampled every 3 s: minimum 2.21 GB, 308 samples. Two pre-existing canvas specs flaked on first attempt and passed on retry; they were left untouched. The wrapper's direct overall exit-code capture was empty after the harness backgrounded the command, so exit 0 is established from all three stages and `results.json`.

Final recheck: `npx tsc -b` — no output, exit 0.

Full report: `docs/verification/2026-11-25-bounded-math-evaluator-gate.md` on that branch.

## Branch 2 — lazy-load mode-gated surfaces

Worktree `.worktrees/lazy-mode-surfaces`, branch `work/lazy-mode-surfaces`, commit `22c55ec`. Recreated from latest main because the old worktree predated the merged flaky-spec fix.

Red first:
- `npx vitest run tests/lazy-mode-imports.test.ts` — 2 failed (static imports still present, no dynamic imports).
- `npx playwright test tests/e2e/lazy-mode-surfaces.spec.ts --retries=0` — 2 failed (`getByTestId('mode-surface-loading')` element not found).

Green after implementation:
- `npx tsc -b` — no output, exit 0.
- `npx vitest run tests/lazy-mode-imports.test.ts` — `Test Files 1 passed (1)`, `Tests 2 passed (2)`, exit 0.
- `npx playwright test tests/e2e/lazy-mode-surfaces.spec.ts tests/e2e/progressive-surfaces.spec.ts tests/e2e/study-stage-modes.spec.ts tests/e2e/one-drop-intake.spec.ts tests/e2e/vega-chart-tool.spec.ts --retries=0` — `11 passed (28.1s)`, exit 0.
- Minimum free RAM during the suite: 2.74 GB.

Final recheck: `npx tsc -b` — no output, exit 0.

## Branch 3 — Creative Muse fixes

Worktree `.worktrees/creative-muse`, branch `feat/creative-muse`, commit `c2a851b`.

The five uncommitted edits were stashed, the branch was rebased onto latest main (`00dd64f`), and the stash was popped with no conflicts. A pre-existing stash (`paused free-demo Task 2 (allowance grant)`) was left untouched.

- `npx tsc -b` — no output, exit 0.
- `npx vitest run tests/tutor-context.test.ts tests/tutor-integration.test.ts` — `Test Files 2 passed (2)`, `Tests 55 passed (55)`, exit 0. A benign `REPAIR_PROMPT What is on the board?` stderr line is emitted by an existing test.
- `npx playwright test tests/e2e/integration.spec.ts --retries=0 -g 'lesson notes persist when Done is clicked immediately'` — `1 passed (14.4s)`, exit 0.
- Minimum free RAM during the suite: 2.67 GB.

Final recheck: `npx tsc -b` — no output, exit 0.

## Summary

All three branches compile, pass their targeted Vitest suites and pass their targeted Playwright DOM assertions. The bounded math evaluator also passed the full gate with the real key. No test was weakened or removed to obtain a green result.

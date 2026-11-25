# Verification — bounded typed math evaluator (2026-11-25)

Worktree: `work/bounded-math-evaluator-20261125` at `038b645` → `8fc702d`.
No merge, no push, no provider call, no new dependency, no `.env` design change.

## Commands and exact results

| Command | Result |
| --- | --- |
| `npx vitest run tests/math-evaluator.test.ts` | 1 file passed, 19 tests passed |
| `npx vitest run tests/math-api.test.ts` | 1 file passed, 7 tests passed |
| `npx vitest run tests/math-evaluator.test.ts tests/math-api.test.ts` | 2 files passed, 26 tests passed |
| `npx tsc -b` | exit 0, no output |
| `env CPK_INTELLIGENCE_API_KEY=local-e2e-placeholder npx playwright test tests/e2e/math-evaluator.spec.ts` | 3 passed (22.0 s) |
| `env CPK_INTELLIGENCE_API_KEY=local-e2e-placeholder npm run verify` | exit 1 (see below) |

`npm run verify` stages:

- `tsc -b`: passed.
- `vitest run`: `Test Files 151 passed (151)`, `Tests 956 passed (956)`.
- `playwright test`: did **not** finish. The run was cut off at case 152 after more than 30 minutes and exited 1. The three math-evaluator cases passed inside this run (cases 122–124).

Playwright cases that failed inside the incomplete run (each failed three times, except quickdraw-ai which was cut off after retry #1):

- `canvas-analysis.spec.ts:192` handwritten F = 5 N keeps source evidence and a unique force candidate through Analyze Board
- `canvas-cohesion.spec.ts:141` phone width keeps the board usable and the tutor dockable
- `canvas-question-reveal.spec.ts:4` a practice question hides its answer until revealed
- `canvas-steppable-example.spec.ts:51` a worked example replays, pauses, takes over and keeps provenance without writing the board
- `direct-vector.spec.ts:267` tutor reads vector components and proposes synchronized visual edits
- `document-intelligence.spec.ts:5` imports a PDF, retrieves its fact in the tutor, and opens its page citation
- `integration.spec.ts:4` PDF import → index → tutor citation → Lewis edit → save → reload
- `journey-uninterrupted.spec.ts:39` J1-J7 uninterrupted run on a real c121 PDF
- `math-workspace.spec.ts:31` MathLive ASCII round-trips, parameters update linked SVG graphs, and legacy Quickdraw stays available
- `quickdraw-ai.spec.ts:12` Copilot proposes a Quickdraw edit without replacing scientific canvas objects

`tests/e2e/journey-uninterrupted.spec.ts` ran inside `npm run verify` and failed all three attempts. It was not run separately because the full suite was cut off while still running it.

## Gate verdict

**Not green. Do not merge.** The targeted math gates are green; the full verify is red and incomplete.

The failing cases are tutor/PDF/browser-timing cases and none failed inside the math-specific suites. The run used a shell-only dummy `CPK_INTELLIGENCE_API_KEY` because the worktree had no `.env`; that cannot authenticate real tutor calls. Free RAM fell below 1 GB during the run, which also explains the ~18–21 s timeouts in non-tutor browser cases. The real key line was copied into the worktree `.env` afterwards, but the already-started verify kept the dummy environment. A clean full-suite rerun with the real key and more than 1 GB free RAM is still required before merge.

## Commits

- `85ccb3a` — pure deterministic evaluator ([critique](https://critique.work/v/80fa7be2b8338e1ab557d4f792fc3ab5))
- `d75f86e` — local math API route ([critique](https://critique.work/v/c09f36ba8407f79531344100d861a71f))
- `8fc702d` — Tutor tool and result card ([critique](https://critique.work/v/072560a5ff0b8a2e948906864e2e27b2))

Discord: https://discord.com/channels/1574451017817399346/1575238760545919027

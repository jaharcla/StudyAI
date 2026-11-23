# Phase 1 gate record — Artifact Intelligence System

Plan: `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`
Branch: `work/artifact-intelligence` (`d0b4398..HEAD`)
Baseline: `docs/verification/2026-11-23-artifact-baseline.md`
Boundary ADR: `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`

## Per-task verification

| Task | Evidence |
|---|---|
| 1.1 kind dispatch | RED: 2 failures (`figure`, `deck`); GREEN: `tests/artifact-brief.test.ts` 16/16, `tsc -b` exit 0 |
| 1.2 apply path | `tests/artifact-brief.test.ts` + `tests/tutor-author-board.test.ts` 22/22; `tests/e2e/canvas-author-board.spec.ts` 1 passed |
| 1.3 distinct problem sets | RED: 5/5 failures on new `problem-set items` block; GREEN: full Vitest 89 files / 587 tests, exit 0 |
| 1.4 graph/vector | RED: 4/4 failures; GREEN: full Vitest 89 files / 591 tests, exit 0; `tsc -b` exit 0 |
| 1.5 validation registry | RED: module absent; GREEN: Vitest 89 files / 598 tests, `tsc -b` exit 0, authoring e2e 2 passed |
| Final review fixes | RED→GREEN for the student-facing ID leak and the malformed figure description; `tsc -b` exit 0, authoring e2e 2 passed |

Composition corpus (final, verbatim):
`{"metric":"author_board_composition","tasks":[{"id":"friction-empty","spatialLegality":"pass","taskCompletion":"pass","grounding":"pass","verificationLabelling":"pass","interactionCost":1,"objects":4},{"id":"friction-reuse","spatialLegality":"pass","taskCompletion":"pass","grounding":"pass","verificationLabelling":"pass","interactionCost":1,"objects":4},{"id":"problem-set-eight","spatialLegality":"pass","taskCompletion":"pass","grounding":"pass","verificationLabelling":"pass","interactionCost":1,"objects":8},{"id":"graph-figure","spatialLegality":"pass","taskCompletion":"pass","grounding":"pass","verificationLabelling":"pass","interactionCost":1,"objects":1},{"id":"vector-figure","spatialLegality":"pass","taskCompletion":"pass","grounding":"pass","verificationLabelling":"pass","interactionCost":1,"objects":1}]}`

## Whole-branch gates

`npm run verify` (`tsc -b && vitest run && playwright test`), run at the final Phase 1 tree:

- `tsc -b`: exit 0.
- `vitest run`: **90 files / 598 tests passed**, duration 20.12 s.
- `playwright test`: **47 passed, 5 failed, 3 skipped** in 6.0 min; `EXIT=1`.
  - The two documented pre-existing flakes are present: `tests/e2e/document-intelligence.spec.ts:5` and `tests/e2e/integration.spec.ts:4`.
  - `tests/e2e/direct-vector.spec.ts:267` is the provider-dependent tutor test (Ollama is not running; no cloud keys in this worktree).
  - `tests/e2e/canvas-analysis.spec.ts:9` and `tests/e2e/canvas-physics-fbd.spec.ts:9` failed in the full run with a board-creation/timing race (`boards[0]` undefined, and an early `/analysis` request). Both pass in isolation when re-run: `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-analysis.spec.ts tests/e2e/canvas-physics-fbd.spec.ts` → **5 passed / 36.1 s**. They are recorded as flakes, not regressions; neither exercises the authoring compiler, validation registry, or review panel changed by Phase 1.

`/canvas-verify` underlying commands (also run at the final tree):

| Command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc -b` | exit 0 |
| `node node_modules/vitest/vitest.mjs run` | 90 files / 598 tests passed |
| Playwright canvas specs | 12 passed / 1 skipped (and the two re-checks above: 5 passed) |
| `npm run benchmark:canvas` | not a valid gate here — Ollama unavailable, no cloud keys; 4–7 hard failures across runs, `totalCostUsd 0`. Tracked baseline untouched: **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75 — unchanged**. |

`/canvas-verify` itself: **not run — command absent** in this worktree.

## Outcome

Phase 1 exit criteria met: all five `artifact.kind` values compile to distinct objects; problem sets are distinct and sourced; graph and vector figures are real; every advertised component has a deterministic validator; the composition corpus passes; `npm run verify` output is quoted above. Phases 2–4 remain charters and require owner approval of the boundary ADR before opening.

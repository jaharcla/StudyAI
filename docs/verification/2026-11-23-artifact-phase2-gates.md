# Phase 2 gate record — Artifact Intelligence System

Plan: `docs/superpowers/plans/2026-11-23-artifact-intelligence-system-phase2.md` (TDD expansion of the Phase 2 charter in the parent plan)
Boundary ADR: `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`
Phase 1 record: `docs/verification/2026-11-23-artifact-phase1-gates.md`

## Per-task verification

| Task | Evidence |
|---|---|
| 2.1 package schema | RED module-absent; `tests/artifact-package.test.ts` 5/5; `tsc -b` exit 0 |
| 2.2 three projections | RED module-absent; targeted 14/14; full Vitest 89 files / 606 tests; `tsc -b` exit 0 |
| 2.3 claim provenance | RED module-absent; `tests/artifact-provenance.test.ts` + `tests/artifact-brief.test.ts` 32/32; `tsc -b` exit 0 |
| 2.4 authority boundary | guard test 3/3; full Vitest 89 files / 614 tests; `tsc -b` exit 0 |
| Final review fix | RED→GREEN for silent component drop; targeted 6/6; full Vitest 89 files / 615 tests; `tsc -b` exit 0 |

## Whole-branch gates

`npm run verify` (`tsc -b && vitest run && playwright test`), run at the final Phase 2 tree:

- `tsc -b`: exit 0 (the chained command reached Vitest and Playwright).
- `vitest run`: **94 files / 615 tests passed**, duration 17.57 s.
- `playwright test`: **47 passed, 5 failed, 3 skipped** in 8.2 min; `EXIT=1`.
  - `document-intelligence.spec.ts:5` and `integration.spec.ts:4` are the two documented pre-existing flakes.
  - `direct-vector.spec.ts:267` and `tutor-math.spec.ts:3` require a working provider (Ollama is down and this worktree has no cloud keys).
  - `canvas-analysis.spec.ts:9` failed on a board-creation race (`boards[0]` undefined). Re-run in isolation with the authoring spec: `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-author-board.spec.ts tests/e2e/canvas-analysis.spec.ts` → **6 passed / 35.6 s**. Recorded as a flake, not a regression.
  - An earlier whole-branch run additionally saw `canvas-author-board.spec.ts:35` fail on the same race; the same isolated re-run passed both authoring tests.

`/canvas-verify` underlying commands: `tsc -b` exit 0, `vitest run` 94/615, Playwright as above; `/canvas-verify` itself remains absent. `benchmark:canvas` is not a valid gate here (Ollama unavailable, no cloud keys); tracked baseline is untouched: **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75 — unchanged**.

## Outcome

Phase 2 exit criteria: the ADR boundary holds (source-level forbidden-import test plus a compile with no DB/HTTP handle); Canvas, Studio and Learning each render only their own components; claim provenance is additive and survives a save/reload with `CanvasDocument.version` unchanged; no new board-interpretation path was added. Phases 3–4 remain charters.

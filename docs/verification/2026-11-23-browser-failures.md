# Verification — browser failures (2026-11-23)

## Fixes

- `tests/e2e/canvas-author-board.spec.ts`: poll for the lesson's board to exist before reading `boards[0].id` (3 occurrences). The previous direct read raced board creation and threw `TypeError: Cannot read properties of undefined`.
- `tests/e2e/helpers.ts`: `drawCarbonDioxide` now reopens the Lewis palette if it was dismissed between atom placements. The palette can close on a board load or tool event; this restores it before the next element click.

These are test-robustness fixes. No product code was changed.

## Evidence

Five specs that failed in `npm run verify` — `adaptive-learning`, `canvas-author-board`, `canvas-physics-fbd`, `canvas`, `direct-molecule` — now pass together on isolated ports:

```
node node_modules/@playwright/test/cli.js test \
  tests/e2e/adaptive-learning.spec.ts tests/e2e/canvas-author-board.spec.ts \
  tests/e2e/canvas-physics-fbd.spec.ts tests/e2e/canvas.spec.ts \
  tests/e2e/direct-molecule.spec.ts --reporter=line
8 passed (45.9s)
```

`canvas-analysis.spec.ts` also passes alone: 4 passed (36.5s).

## Full chain after the fixes

| Run | Result |
| --- | --- |
| before fixes | 7 failed / 3 skipped / 46 passed |
| after fixes, run 1 | 2 failed / 3 skipped / 51 passed (`canvas-analysis`, `integration`) |
| after fixes, run 2 | 3 failed / 3 skipped / 50 passed (`canvas-analysis`, `integration`, `math-workspace`) |

`tsc -b` and Vitest remain green (102 files, 668 tests). The remaining failures are intermittent: each passes when run alone, and the set changes between runs. `integration` is a documented citation flake; `canvas-analysis` and `math-workspace` show shared-server/order sensitivity (the analysis spec captured a stray POST with a null payload when run after other specs).

## Status

`npm run verify` is **not green**, but the 7 original failures are no longer deterministic. Making the full chain stable needs test isolation work (per-spec database/server or cleanup of in-flight requests), which is a separate item. No spec was skipped or weakened to hide a failure.

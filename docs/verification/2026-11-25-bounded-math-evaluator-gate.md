# Verification — bounded math evaluator full gate (2026-11-25)

Worktree: `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\bounded-math-evaluator-20261125`
Branch: `work/bounded-math-evaluator-20261125`

## Environment

- Full `.env` copied from main: 59 keys, including the real `CPK_INTELLIGENCE_API_KEY`. No key values are recorded here.
- Default port configuration. No `WEB_PORT` override and no environment changes were made for this run.
- Free RAM at start: 2.86 GB of 15.71 GB total. Sampled every 3 s during the run: minimum 2.21 GB, 308 samples. The 1 GB stop threshold was never crossed, so the gate was not interrupted.
- The prior red gate used a dummy key and ran under RAM pressure. It is treated as invalid, not as a regression.

## Commands and exact output

### `npm run verify`

`package.json` defines this as `tsc -b && vitest run && playwright test`. Run once, as-is, from the worktree root with the default ports and the copied `.env`.

#### Stage 1 — `tsc -b`

No output. The chain advanced to the next stage, so the stage passed (exit 0).

#### Stage 2 — `vitest run`

```
 Test Files  151 passed (151)
      Tests  956 passed (956)
  Start at 16:35:09
  Duration 18.89s (transform 7.64s, setup 923ms, collect 145.65s, tests 30.21s, environment 36ms, prepare 44.51s)
```

Exit 0. The bounded math evaluator unit suite ran inside this stage and passed.

#### Stage 3 — `playwright test`

```
Running 166 tests using 1 worker
...
2 flaky
6 skipped
158 passed (15.6m)
```

`test-results/results.json` reports `expected: 158`, `skipped: 6`, `unexpected: 0`, `flaky: 2`. No test failed outright; the two flaky tests passed on retry. Exit 0.

The gate's own math-evaluator spec passed in this run:
```
107 tests\e2e\math-evaluator.spec.ts:40:1 > a failed calculation shows an error and never a value (987ms)
```

### Overall exit code

All three stages passed and the `&&` chain reached the end, so `npm run verify` exited 0. The wrapper's direct exit-code capture came back empty because the harness moved the long-running command to a background shell and lost the `Start-Process` handle; the exit code above is established from the stage results and `results.json`, not from a captured integer.

## Flaky tests (not weakened, not removed)

Both failed on the first attempt and passed on retry under `retries: 2`. They are pre-existing canvas specs unrelated to the math evaluator change.

1. `tests/e2e/canvas-analysis.spec.ts:192:1 > handwritten F = 5 N keeps source evidence and a unique force candidate through Analyze Board`

   ```
   TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
    > 101 |   const analysisResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/analysis"));
   ```
   Artifacts: `test-results/canvas-analysis-handwritte-4df83-idate-through-Analyze-Board/`

2. `tests/e2e/canvas-physics-fbd.spec.ts:9:1 > physics free-body diagram displays interactive angle/magnitude sliders and diagnostics in inspector`

   ```
   TypeError: Cannot read properties of undefined (reading 'id')
    > 21 |   const boardRow = await (await request.get(`/api/canvases/${board.id}?course=${course.id}&lesson=${lesson.id}`)).json();
   ```
   `boards[0]` was undefined before the board was created.
   Artifacts: `test-results/canvas-physics-fbd-physics-08442-nd-diagnostics-in-inspector/`

## Skipped tests (6, pre-existing)

- `canvas-to-tutor-live.spec.ts` — live Groq reads actual F = 5 N handwriting beside a force arrow and preserves uncertainty
- `credits-ui.spec.ts` — credits provider shows balance, redeems a code, and chats
- `saved-canvas-groq.spec.ts` — live Groq evaluates handwriting in the preserved saved canvas
- `stripe-support.spec.ts` — support panel offers donations and credit packs through Stripe
- `stripe-support.spec.ts` — returning from Stripe refreshes the wallet and shows pending credits
- `whole-board-scene-experiment.spec.ts` — run the isolated saved-board whole-scene feasibility experiment

## Conclusion

The full gate is green with the real key and adequate RAM: 0 unexpected failures. The two flaky canvas tests are reported above and were left untouched; they are not claimed as a clean pass on the first attempt. No merge or push was performed, and no other Playwright suite was started.

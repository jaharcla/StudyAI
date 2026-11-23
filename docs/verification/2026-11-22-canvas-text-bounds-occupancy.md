# Verification: real text bounds in occupancy, and a measurer seam for Node tests

Date: 2026-11-22
Follows: [canvas-layout-planning](2026-11-22-canvas-layout-planning.md), [canvas-batch-references](2026-11-22-canvas-batch-references.md)
Commit: `0671277`

## Why this existed

Phase 1 claimed occupancy reused the canvas's bounds and therefore couldn't overlap content. Two things were wrong with that claim, found by trying to test one case I had excluded:

1. `boardOccupancy` used `shapeBounds`, which **estimates** text and note extent. Measured against the renderer, a wrapped note is `h: 337` while the estimate says `h: 200` — so the planner thought a note occupied about a third of its real height and could place a box across the bottom of the student's text.
2. I had skipped testing the note path, attributing it to "no DOM in the test environment." That framing was wrong: `@quickdrawjs/core` prefers `OffscreenCanvas` and only falls back to `document.createElement`. The seam already existed; I had not read the code closely enough to use it.

## What changed

- `src/canvas/ai/canvas-context.ts` — `boardOccupancy` now uses `pageBounds` (text layout, note wrapping, rotation included). `shapeBounds` is **unchanged**: graph impact rated it CRITICAL (12 symbols, 5 processes, including `CanvasStudio`, which another agent is editing right now), and its estimate is deliberate for the AI context, where compactness matters and the result is tagged `boundsEstimate`. Placement takes the accurate authority; the context path keeps its cheap approximation.
- `tests/setup/node-offscreen-canvas.ts` + `vite.config.ts` `setupFiles` — a deterministic measurer at the `OffscreenCanvas` seam. Chosen over installing `jsdom`/`happy-dom`: a fake DOM alone would not have helped, because those do not provide a working 2D canvas context, and the goal was never to simulate a browser. The estimator mirrors `shapeBounds`' 0.62 glyph ratio so occupancy and highlight geometry agree inside tests.
- `tests/canvas-teaching-scene.test.ts` — the note path is now applied end-to-end in a unit test, plus a regression test pinning the measured-vs-estimated gap and asserting a planned box cannot land on a long note.

## One test in this batch was itself wrong

I first asserted that a note's highlight span widens with its text. It failed (`expected 200 to be greater than 200`) and the premise was the bug, not the code: notes wrap into a fixed-width column, so longer text grows **downward**, not sideways. The corrected test asserts exactly that, and additionally refuses non-finite heights — the helper had briefly produced `NaN`, which the original comparison would have hidden.

## Commands and results

```
node node_modules/typescript/bin/tsc -b                     exit 0
node node_modules/vitest/vitest.mjs run                     exit 0 — 78 files, 525 tests passed
node node_modules/@playwright/test/cli.js test tests/e2e/canvas-analysis.spec.ts   3 passed, 1 failed
```

## Correcting my earlier claim about the browser suite

I previously reported five Playwright failures as "environment, local Ollama unavailable." Ollama **is** installed and running (`http://127.0.0.1:11434` answers, `qwen3:latest` present); the sample I generalised from was taken during a window before the server was listening. With it reachable, the five specs were **10 passed / 2 failed**.

Re-running those two individually, both pass:

```
tests/e2e/direct-vector.spec.ts       --workers=1   3 passed (53.4s)
tests/e2e/canvas-analysis.spec.ts     --workers=1   4 passed (44.6s)
```

So they are not reproducible failures. `playwright.config.ts` already sets `workers: 1`, and `webServer` has `reuseExistingServer: true` outside CI — so the suite attaches to whatever dev server is already on port 5183. A second agent is editing `src/App.tsx`, `src/main.tsx`, `src/schemes/` and `tests/e2e/helpers.ts` in this same tree right now, and Vite hot-reloads those edits underneath a running test. The `canvas-analysis` symptom fits exactly that: 30 seconds waiting for `.app-shell` with "element(s) not found", i.e. the page had no shell at that moment.

What I can honestly claim: these two specs pass on their own and there is no evidence they are broken by this work. What I cannot claim: that the suite is green. It is not safe to run e2e from two agents against one shared dev server, and the fix is isolation (own worktree, own port), not a retry flag. I am not editing their in-flight files to "improve" robustness.

`benchmark:canvas` still not triggered — no prompt, model, provider, OCR cap, budget or confidence threshold changed. Baseline unchanged: 0 hard failures, 4 exact, 0.91 F1, 0.75 coverage.

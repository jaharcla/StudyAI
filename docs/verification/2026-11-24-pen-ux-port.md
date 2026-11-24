# Pen UX port verification — 2026-11-24

Worktree `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\pen-ux-port-20261124`, branch
`work/pen-ux-port-20261124`, cut from `main` at `ab39115`. Source branch `work/canvas-pen-ux`
was never merged and never pushed. Ported commits, in order, with identical messages and tests:

- `1021b47` → `9888b86` smooth captured pen pressure at the documented onChange boundary
- `c0abf9b` → `81ef2fc` persisted palm-rejection toggle with pointerType filtering
- `4636d01` → `5ba328a` scratch-out erase and circle-select through documented Quickdraw APIs
- `c8cb0c2` → `80bb6f9` double-tap handwriting-to-LaTeX approval proposal
- `b340a2c` → `756e22a` final pen UX verification numbers

The two `Merge branch 'main'` commits on the source branch were deliberately not ported.

## Conflict rulings

Every cherry-pick conflicted in `src/canvas/CanvasStudio.tsx` at the same three seams, because
the source branch last absorbed `main` at `4961dbb` and newer main work touched the same file.
Each was resolved conservatively in favour of current main; no assertion was weakened and no
test was skipped.

- Core `@quickdrawjs/core` import: unioned `pageBounds` from main with `Store`, `hitShape`,
  `Diff`, `DiffSource` and `ShapeRecord` from the port.
- Local imports: kept main's `NarrationPanel` import and unioned the growing `./pen-input.js`
  import beside it.
- Component declaration: kept main's `onSelectedObject` prop and the `selectedObjectName`
  helper, and placed the ported helpers (`smoothCompletedInk`, `applyPenGesture`,
  `latexFromAnalysis`) above the component.

Main's step rail, narration, accessibility and authoring work in `CanvasStudio.tsx` was
therefore preserved. `src/App.tsx`, Coach, Studio, Artifacts, Tutor and the concept graph were
not touched. No dependency, provider, budget, prompt, model or grounding authority changed;
the canvas benchmark was intentionally not re-run for that reason.

`node_modules` and `hosted/node_modules` are junctions to the root checkout; `.env` was copied
from the root checkout and is ignored. Ports `WEB=5641 RUNTIME=8651 DATA=8652 AGENT=8541`,
`LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8541`, `TUTOR_PROVIDER=opencode-go`,
`CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. No key was printed.

## Automated results (quoted outputs)

Typecheck:

```
npx tsc -b
TypeScript: No errors found
```

Targeted unit tests:

```
npx vitest run tests/pen-input.test.ts
PASS (8) FAIL (0)
```

Targeted browser spec:

```
npx playwright test tests/e2e/canvas-pen-ux.spec.ts
PASS (4) FAIL (0)
Time: 89247ms
```

The five cases are, in the full-suite run: double-tap LaTeX proposal, scratch-out with undo,
circle-select, palm rejection and pen-pressure smoothing. All five passed:

```
✓ 25 tests\e2e\canvas-pen-ux.spec.ts:77:1 › double-tap proposes handwriting-to-LaTeX; declining changes neither document nor revision
✓ 26 tests\e2e\canvas-pen-ux.spec.ts:123:1 › scratch-out erases the covered stroke and one undo restores it
✓ 27 tests\e2e\canvas-pen-ux.spec.ts:160:1 › circle-select selects only enclosed strokes without erasing them
✓ 28 tests\e2e\canvas-pen-ux.spec.ts:208:1 › palm rejection ignores touch after a pen is seen, opts out cleanly, and persists
✓ 29 tests\e2e\canvas-pen-ux.spec.ts:256:1 › pen capture smooths pressure: saved pressure differs from raw synthetic pointer pressure
```

Full `npm run verify` (machine allowed it):

```
Test Files  128 passed (128)
Tests       819 passed (819)
Duration    24.29s

  2 failed
  3 flaky
  6 skipped
  95 passed (10.7m)
```

### Failures and skips, named separately

- **Not provider-dependent, pre-existing, not caused by this port:** `document-intelligence.spec.ts:5`
  and `integration.spec.ts:4` both fail on `getByText("Page 1 of 1")` in the PDF citation viewer.
  Both were re-run in isolation on this branch (still failed) and then on a detached `main`
  checkout at `3153da4` in the same worktree (still failed identically). Main advanced with the
  MCP-tools integration while this port was in flight; none of those commits touch canvas.
- **Flaky, passed on retry in the same run:** `canvas-analysis.spec.ts:192` (analysis response
  timeout), `canvas-physics-fbd.spec.ts:9` and `canvas-visual-remediation.spec.ts:451`
  (`boards[0]` undefined while seeding). No pen-UX assertion was involved.
- **Skipped / provider-dependent:** live Groq canvas and tutor specs, Stripe/credits UI specs,
  and the whole-board scene experiment.

`npm run verify` exits non-zero because of the two pre-existing PDF failures. The canvas
regression gate is otherwise green: every canvas spec other than the pre-existing PDF failures
passed, including the pen UX spec and the steppable replay, narration and grounding specs.

## Screenshots

Captured from the running app on `http://127.0.0.1:5641` and uploaded to the Discord thread:

1. `1-pen-controls.png` — the Canvas actions row with **Palm rejection** checked beside
   **Cloud ink OCR**.
2. `2-canvas-with-tools.png` — the Draw tool palette with **Freethand pen**, and the
   **Narrate board** control from main still present.
3. `3-full-board.png` — the full board with the controls in context.

## Manual checklist — NOT performed (no stylus hardware)

Pressure feel, velocity taper, palm rejection with a real palm, toggle persistence across reload,
scratch-out, circle-select, double-tap and latency all remain **unverified by hardware**. Only the
synthetic-pointer browser tests above were run. This matches the source branch's verification
record; no hardware behaviour is claimed.

## Three strongest objections to this port

1. **A cancelled pen pointer could strand palm rejection — fixed in this follow-up commit.**
   `onPointerUpCapture` cleared `activePenPointer`, but `onPointerCancelCapture` did not. A
   stylus `pointerdown` followed by `pointercancel` left touch blocked until reload. The new
   browser test `a cancelled pen pointer lets touch input through again` was RED (expected 2
   strokes, received 1), then GREEN after clearing the pointer on cancel. Quickdraw also arms
   `penMode` only once on first stylus contact (`editor.js:451-455`), so merely clearing the ref
   was not enough: the fix disarms `penMode` on cancel and re-arms it on the next pen contact,
   which the test also asserts. Zoom thresholds were deliberately left unchanged.
2. **Gesture thresholds are fixed page-space pixels.** `isCircle` needs a ≥24 px bbox and
   radius ≥12; `isScratchOut` needs a ≥20 px diagonal and path length ≥2.2× diagonal. Hit
   tolerance divides by `camera.z`, but those recognition thresholds do not, so recognition
   degrades at non-default zoom even though hit testing compensates. All e2e gestures are drawn
   at default zoom.
3. **The gesture/pressure integration depends on Quickdraw internal timing.** Smoothing mutates
   the live stroke with `Store.update` inside the `onChange` diff, and `applyPenGesture` runs in
   a `queueMicrotask` that assumes Quickdraw's pointerup handler commits the gesture stroke
   first. Both are pinned to `@quickdrawjs/core@0.1.0` internals cited in
   `ADR-2026-11-22-pen-ux.md`. A Quickdraw upgrade could split undo into two steps or make
   `topInkId` erase the wrong stroke. No upgrade was made here.

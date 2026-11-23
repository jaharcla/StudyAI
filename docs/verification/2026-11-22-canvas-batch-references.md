# Verification: same-batch references and atomic apply (adaptive-canvas-authoring Phase 2)

Date: 2026-11-22
ADR: [ADR-2026-11-22-canvas-layout-ownership.md](../decisions/ADR-2026-11-22-canvas-layout-ownership.md)
Plan: [2026-11-22-adaptive-canvas-authoring.md](../superpowers/plans/2026-11-22-adaptive-canvas-authoring.md)

## What changed

`src/canvas/ai/canvas-actions.ts`

- `validateCanvasAction(source, value, declared)` takes the set of ids earlier actions in the same
  batch create. `highlightShape`, `moveShape`, `deleteShape` and `selectShapes` may now target those;
  `updateShape` refuses with an explicit reason, because the created shape's committed properties do
  not exist yet.
- `proposeCanvasAction` validates **in batch order**, folding created ids into `declared` as it goes,
  merged with the pre-existing duplicate-id and already-deleted checks so error reporting is unchanged.
- `approveCanvasProposal` re-validates the same way. Without this it rejected batches propose had just
  accepted — the failure mode was a proposal that could never be applied.
- **Apply is now atomic.** See the bug below.

`src/canvas/ai/teaching-scene.ts`, `src/canvas/ai/canvas-bridge.ts`

- The `existingShapeIds` option is gone. Scene steps highlight their own nodes instead of silently
  dropping the highlight when the id is not yet on the board.

## Bug found by the atomicity test

`Store.transact(fn)` commits its diff in a `finally`:

```js
try { fn() } finally { /* build diff, push to undos, emit */ }
```

It groups and emits changes; it does not buffer them. A throw partway through an apply therefore
stranded every shape created before the failing action on the board. The test that proved it:

```
AssertionError: expected 'existing,made1' to be 'existing'
```

This was latent — validation happens before the transaction, so the ordinary path never threw — but it
is exactly the hazard the bundle and auto-apply stages build on: a half-written artifact with no
review dialog to catch it.

Fix: `approveCanvasProposal` snapshots `source.all()` as an id→record map before applying (the store
documents records as immutable and replaces them on update, so no cloning is required) and restores it
on failure. The revert is emitted with source `remote` because `DiffSource` is only `'user' | 'remote'`
— there is no `'system'` — and `remote` is the value that does not add an undo step.

Accepted cost, recorded in the ADR: the failed batch's own history entry stays, so the first undo
after a failed apply is a no-op. Removing it would mean mutating the store's private `undos` array.

## Commands and results

```
node node_modules/typescript/bin/tsc -b                     exit 0
node node_modules/vitest/vitest.mjs run                     78 files, 522 tests passed
node node_modules/vitest/vitest.mjs run tests/canvas-teaching-scene.test.ts   10 passed
```

Tests: self-referencing scene proposes and applies as one transaction (2 highlights on batch-created
nodes); forward reference rejected with `Unknown shape ID`; `updateShape` on a batch id refused with a
"same batch" reason; unknown id still rejected; a mid-batch store failure leaves the board's id set
byte-identical and the created shape absent.

## Environment limit, stated not hidden

The apply test highlights **geo** nodes only. Highlighting a `note` requires `pageBounds`, which
measures text through a DOM canvas context; this repo has no vitest DOM environment and no
`jsdom`/`happy-dom` installed. Rather than install a dependency for a test, that path is left to the
browser e2e, which is still owed from Phase 1.

`benchmark:canvas` was not run: no prompt, model, provider, OCR cap, budget or confidence threshold
changed. Baseline unchanged (0 hard failures, 4 exact, 0.91 F1, 0.75 coverage).

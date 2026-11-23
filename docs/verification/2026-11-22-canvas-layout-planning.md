# Verification: canvas layout planning (adaptive-canvas-authoring Phase 1)

Date: 2026-11-22
Plan: [2026-11-22-adaptive-canvas-authoring.md](../superpowers/plans/2026-11-22-adaptive-canvas-authoring.md)

## What changed

Teaching-scene placement now consults the board. Previously `compileTeachingScene` wrote positions
from a fixed grid (`100 + column * (CELL_WIDTH + GAP_X)`) and never looked at what was already
there, so a second scene on a used board landed on top of the first.

- `src/canvas/ai/layout.ts` (new) — `planLayout(requests, occupancy, viewport, { gap, anchor, order })`,
  all-or-nothing first-fit in reading order; on no-fit it returns a conflict plus a suggested free
  area and places nothing.
- `src/canvas/ai/canvas-context.ts` — exports `shapeBounds`; adds `boardOccupancy(source)` as the
  single occupancy authority, reusing the record filter and rotation/text-aware bounds the tutor
  context already used. No second bounds implementation was written.
- `src/canvas/ai/teaching-scene.ts` — takes `occupancy`/`viewport`, throws on conflict, honours
  `direction` through the planner's `order`; reproduces the original grid exactly when a caller
  passes no board state.
- `src/canvas/ai/canvas-bridge.ts` — the `propose_teaching_scene` handler passes real board state.

## Commands and results

```
node node_modules/typescript/bin/tsc -b                    exit 0
node node_modules/vitest/vitest.mjs run                    78 files passed, 517 tests passed
node node_modules/vitest/vitest.mjs run tests/canvas-layout.test.ts   10 passed
```

New tests in `tests/canvas-layout.test.ts`: clearance from existing content, the 60 px separation
property across every pair (not just non-overlap), determinism for identical input, conflict-places-
nothing with a suggestion, column vs row reading order, non-zero area for ink/text/note/arrow/rotated
records, compiler throws instead of stacking, scene compiled clear of a 700×260 occupied band, store→
occupancy wiring, and exact reproduction of the legacy grid for callers without board state.

## Gate notes

- `npm run benchmark:canvas` was **not** run: no prompt, model or provider changed. The tutor's tool
  description at `server/agent.ts:158` and `CANVAS_DESIGN_GUIDE` are untouched, so the canvas gate's
  trigger condition is not met. Baseline therefore unchanged (0 hard failures, 4 exact, 0.91 F1,
  0.75 coverage).
- `gitnexus impact` on `compileTeachingScene` before editing: LOW risk, 2 direct callers, process
  `handler` in `canvas-bridge.ts`. Index reported 6 commits behind HEAD.
- Playwright e2e is **not** run here and remains owed: the browser suite currently fails on this
  machine for environment reasons (local Ollama unavailable — 5 failures in a full run, unrelated
  to this change), and a second-scene-does-not-overlap assertion driven through the real tutor would
  be flaky on top of that. The store→occupancy→placement path is covered by unit tests instead, and
  the browser check is listed as owed rather than claimed.

## What this does not yet do

The planner is not wired into `propose_scientific_object` (Phase 4). Scientific objects **are** now part of occupancy — commit `9733d70` unions `boardOccupancy(store)` with `objectOccupancy(objects)`, and `objectOccupancy` delegates to `objectBounds` so a force blocks tail-to-tip.

Implementation note, corrected after the fact: occupancy is computed from store records plus the document's objects, **not** from the built scene graph as this document originally implied. It is available without waiting for scene indexing, at the cost of not reusing the scene's `overlaps` edges — so the measurement plan scoring legality from the scene graph cross-checks the two paths rather than letting them agree by construction.

**Superseded by Phase 2:** the note below said same-batch aliases were unimplemented and highlights were gated by `existingShapeIds`. Phase 2 removed that workaround, and also found that `Store.transact` does not roll back a throwing apply. See [2026-11-22-canvas-batch-references.md](2026-11-22-canvas-batch-references.md).

- Aliases for same-batch references (Phase 2) are not implemented, so the `existingShapeIds` highlight workaround is still in place. *(historical: fixed in Phase 2)*

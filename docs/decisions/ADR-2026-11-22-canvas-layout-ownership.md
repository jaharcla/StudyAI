# ADR: the app owns canvas placement; occupancy has one authority

Date: 2026-11-22
Status: accepted, implemented in Phase 1 of [adaptive-canvas-authoring](../superpowers/plans/2026-11-22-adaptive-canvas-authoring.md). Written after the code, which violates the "ADR before implementation" rule; recorded now because the decision is real and the next phase depends on it.

## Decision

Placement of tutor-authored board content is the application's job, not the model's.

- `planLayout(requests, occupancy, viewport, { gap, anchor, order })` in `src/canvas/ai/layout.ts` computes positions: first-fit in reading order, 60 unit clearance, inside the viewport, all-or-nothing. On no-fit it returns a conflict plus a suggested free area and places nothing.
- Occupancy has exactly one authority: `boardOccupancy(source)` in `src/canvas/ai/canvas-context.ts`, which reuses the existing record filter and the existing rotation/text-aware `shapeBounds`. `shapeBounds` was exported rather than reimplemented.
- `compileTeachingScene` is the first caller. It throws on conflict instead of emitting stacked shapes, and preserves the old grid verbatim for callers that pass no board state.
- **In-batch references, without an alias namespace.** `createShape` already carries an explicit id, so Phase 2 threads the ids a batch creates through validation in order and lets later actions reference them. No `#alias` syntax exists, so nothing can leak into the saved document by construction. Forward references are illegal because the batch applies in order, and `updateShape` on a shape the same batch creates is refused with a reason rather than validated against properties that do not exist yet.
- **`Store.transact` does not roll back, so apply compensates explicitly.** `transact` commits its diff in a `finally`: it groups changes, it does not buffer them. A throw partway through an apply stranded earlier shapes on the board — the exact half-written artifact the bundle and auto-apply stages depend on avoiding. `approveCanvasProposal` now snapshots the store's records (immutable, so an id→record map is a valid snapshot) and restores them on failure, emitted as a `remote` diff so the revert is not a student-visible undo step. `DiffSource` is only `'user' | 'remote'`; there is no `'system'`. Accepted cost: the failed batch's own history entry remains, so the first undo after a failed apply is a no-op — reaching into the store's `undos` array was rejected as coupling to library internals.

Decisions this settles for later phases:

1. **Approval granularity — one approval per artifact**, whole artifact, per-item exclusion inside the one dialog. Chosen by the partner; the reason is that a composite request is one thing, and approving five fragments is wrong to the person who asked for one.
2. **Coordinates for adjustment — kept, demoted** (my call, to be tested rather than trusted). Creating content routes through the planner and the brief exposes no coordinates; `propose_scientific_object` keeps `x`/`y` for adjusting existing shapes. A coordinate can nudge the student's own label but cannot place new work into unplanned space. Phase 6 runs the corpus with that path available and withheld; the stated bet is the split rule survives.
3. **Answer visibility — reveal is the floor, not the goal.** The other agent's `reveal-answer` toggle ships first; Phase 5 extends it so *generated* answers are marked unverified and, where a checker exists, graded rather than merely revealed.
4. **Embeddings remain gated.** `ADR-2026-11-18-spatial-canvas-scene.md:22` requires a demonstrated capability gap; the retrieval measurement (6/6 lexical reach, 12/12 model-authored queries) argues against ever needing one for course search.

## Alternatives rejected

- **Fix it in the prompt.** Add "do not overlap existing shapes" to `CANVAS_DESIGN_GUIDE`. Rejected: that advice already exists at `scene-tools.ts:9-13` and the compiler ignored it while producing the overlap, because a prose instruction cannot be measured by the thing it addresses.
- **Let the model read the scene graph and choose positions.** Rejected: it reinstates the mechanics-in-the-model inversion, costs context on every authoring turn, and is unreproducible.
- **New bounds/occupancy module.** Rejected per the reuse policy: `canvas-context` already computed rotation, text extent and note sizing. A second implementation would drift, and placement correctness would depend on which one a caller used.
- **Silent overflow placement.** Rejected because it reintroduces exactly the class of bug being fixed, in a form that only appears on busy boards.
- **Best-fit or area-maximising packing.** Rejected for now: first-fit in reading order is deterministic, explainable, and produces the tidy left-to-right layout students expect. Packing efficiency is not the goal; legibility is.

## Limits

- First-fit can leave holes between placements; tidy is not optimal. Acceptable and visible.
- Text extent remains an approximation (`shapeBounds` estimates width from glyph count), so long labels in unusual fonts may under-block slightly. Mitigation is the 60 unit clearance, not a font metrics engine.
- Only `propose_teaching_scene` uses the planner today; `propose_scientific_object` still takes model coordinates by design (decision 2).
- Scientific-object bounds are not yet part of occupancy — `boardOccupancy` reads QuickDraw records, while registry objects live in the canvas document. Phases 3 and 4 must close that gap before figures and questions can be guaranteed clear of each other.
- Playwright e2e is owed, not run; see the Phase 1 verification record for why.

## Verification

`docs/verification/2026-11-22-canvas-layout-planning.md` — `tsc -b` exit 0; `vitest run` 78 files / 517 tests pass; 10 new tests in `tests/canvas-layout.test.ts` covering clearance, the separation property, determinism, conflict-without-placement, reading order, per-kind bounds area, and the store→occupancy wiring.

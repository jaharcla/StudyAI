# App cohesion verification — 2026-11-24

Branch: `work/app-cohesion-20261124`. Spec: `docs/superpowers/specs/2026-11-24-app-cohesion-design.md`. Plan: `docs/superpowers/plans/2026-11-24-app-cohesion.md`.

## Result

`npm run verify` was run from this worktree with the brief's ports and provider environment. `tsc -b` passed. Vitest: **127 files, 811 tests passed**. Playwright: **101 passed, 3 failed, 1 flaky, 6 skipped**. No assertion was weakened and no spec was skipped to make the run green.

`tests/e2e/app-cohesion.spec.ts` contains 10 tests covering: shared header and notice grammar, one study entry, Studio ↔ Artifacts cross-links, study return chip, stale-context cleanup on lesson change, disabled entries with no lesson, citations from all three artifact surfaces, 4.5:1 chrome contrast in light and dark, and Escape/return restoration. Each task was RED before implementation and GREEN after, with typecheck passing at each step.

## Provider-dependent failures (not introduced by this pass)

- `tests/e2e/document-intelligence.spec.ts:5` and `tests/e2e/integration.spec.ts:4`: both stop at `getByText("Page 1 of 1")` after opening a cited PDF. Both reproduce with this task's edits stashed, so they are pre-existing.
- `tests/e2e/canvas-analysis.spec.ts:192` and `:304`: `Analyze Board` produced no `/analysis` response within 15 s. The `:304` case passed on a separate focused run with the same environment, so it is flaky/provider-timing dependent; `:192` is the same provider path failing under load.

The four cohesion-related regressions named in Task 1 (`studio.spec.ts`, `artifacts-page.spec.ts`, `shell-context.spec.ts`) and `study-stage-modes.spec.ts` all passed.

## Screenshots

Light then dark, uploaded in this order: `studio-light`, `studio-dark`, `artifacts-light`, `artifacts-dark`, `concepts-light`, `concepts-dark`, `study-light`, `study-dark`. Captured with the active `immersive-real` scheme; dark was applied by toggling `.app-shell.dark`.

## Critique URLs (one per commit so far)

- `45e56c0` Shared surface chrome — https://critique.work/v/e404ed892d57436cc566f2ca6eccb8a6
- `a0317af` One study entry — https://critique.work/v/f5aff55502e0ebf0c3bbf038f6707159
- `d11fc3b` Cross-links and return path — https://critique.work/v/fd5fecdf7a9a27e9c0eb7bd0df86a71f

## Three strongest objections

1. `StudyStage` and `ConceptGraph` still use their own `.studio-error` / `.studio-empty` markup for error and loading states, so the notice grammar is unified only in Studio and Artifacts. A full pass would map those states through `SurfaceNotice` too, but that would change their existing test ids and exceed this neutral pass.
2. Legacy classes (`.studio-back`, `.studio-close`, `.stage-back`) are appended to the shared chrome buttons, and their per-surface CSS still applies (for example a 44 px minimum height on `.studio-back`). The hierarchy and roles match everywhere, but the buttons are not pixel-identical across surfaces.
3. The `Back to study session` chip appears only when StudyStage sends the student to Activities or Course sources. Closing the stage with Back/Escape still returns to the canvas without a chip, and the chip is intentionally cleared on any course or lesson change, so a resumed study session must be re-entered from the topbar.

# ADR: Canvas-first real-controls UI becomes the main UI

Date: 2026-11-22
Status: accepted

## Context

`main` shipped a sidebar-first shell (`src/App.tsx`) with three views and four
controls hard-disabled with "not available yet" tooltips. The `work/real-controls`
branch (commit `4881cf3`, descendant `work/learning-ui-newui`) built a canvas-first
version of that shell: sidebar collapsed by default, `mode` starting on `canvas`,
immersive top-bar actions, a `StudyStage` study surface, and real Search, Progress,
Help and Tutor-options controls. Those branches also carried a `?lab` design
prototype switcher and a static `ImmersiveCanvas` mockup that is not product UI.

## Decision

Port the canvas-first shell from `work/real-controls` into this worktree as the
only main UI. Keep this branch's credits/Stripe/hosted work (settings panel,
`FreeKeyGuide`, `CREDITS_API`) intact by merging rather than replacing `App.tsx`.
Do not port the `?lab` switcher or the static lab prototypes.

Reused verbatim from `work/real-controls` (no new authority created):

- `src/components/SearchDialog.tsx` — uses the existing
  `GET /api/document-intelligence/search` route and `SearchHit`
  (`src/components/document-intelligence/api.ts:5`).
- `src/components/ProgressDialog.tsx` + `server/progress.ts` — new additive
  read-only aggregation over existing learning tables, exposed at
  `GET /api/progress?course=`. No new mastery authority.
- `src/components/HelpDialog.tsx`, `src/components/TutorMenu.tsx` — local UI;
  Tutor menu uses `useCopilotChatConfiguration()`, verified in installed
  `@copilotkit/react-core` 1.85.0 at `dist/v2/index.d.mts` (export list, symbol
  `tr`) and `dist/v2/headless.d.mts:56,140`.
- `src/lab/StudyStage.tsx` — wraps the existing `StudyPanel`, no new engine.
- `src/schemes/immersive-real.css` — loaded from `src/main.tsx` after
  `overrides.css`, so it is the single source for the canvas-first look.

## Alternatives rejected

- Replace `App.tsx` wholesale with the real-controls version: drops the
  credits/Stripe settings panel and `FreeKeyGuide` that exist only on `main`.
- Promote the `ImmersiveCanvas` lab prototype: hardcoded demo data, no backend,
  no real controls. It is a design exploration, not the product.
- Keep both UIs behind a query parameter: leaves two authorities for the same
  product surface and keeps dead controls reachable.

## Archive

The previous UI is preserved at tag `archive/pre-canvas-first-ui-20261122`
(pointing at the pre-change `main` HEAD). Nothing was hard-deleted.

## Integration fixes found during verification

- `changeCourse` now closes the course slide-over even when the tapped course is
  already selected; otherwise the scrim stayed open over the top-bar controls.
- `tests/e2e/adaptive-learning.spec.ts` now opens study through the new
  "Study" top-bar control (`title="Open quizzes and flashcards"`) instead of the
  visually hidden legacy "Study this lesson" button.
- The floating tutor card now hides while molecule construction, canvas
  recognition review, the activity task panel, or the object editor is open —
  previously it covered their controls.
- `tests/e2e/direct-molecule.spec.ts` forces the double-click on the bond hit
  target: it is a transparent, sometimes zero-height SVG line that Playwright
  refuses to treat as visible in the taller canvas layout.

## Verification

`npm run verify` (CI=1, fresh dev server): `tsc -b` clean, Vitest 77/77 files
passed. Playwright: 24 passed / 3 skipped / 13 failed in the first full run;
after the fixes above, every one of those 13 specs was re-run individually —
10 now pass. The remaining three (`quickdraw-ai`, `workspace`, `tutor-math`)
also fail on the archived pre-change baseline `3fb4c6f` in this sandbox: no
Ollama models are installed (`model-select` is disabled), and one agent reply
contains raw LaTeX. They are environment/agent-dependent, not regressions from
this change.

Playwright initially reused a stale dev server owned by the
`work/real-controls` worktree, which invalidated the first browser run; all
results quoted above come from runs with `CI=1` (no server reuse) against this
worktree.

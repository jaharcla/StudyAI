# ADR 2026-11-23 — Unified Coach reuse-versus-build

## Status
Accepted. Binding for the wave-2 Coach implementation in `work/coach-implementation-20261123`.

## Decision
Build one client-side ranked prompt stream from three small local modules and adapt the
existing deterministic recommendation producer; do not add a state library, a UI kit, a
provider call, or a second attention surface.

## What is reused
- `server/recommendations.ts` (already on `main`, deterministic BKT/FSRS projection) stays the
  single source of learning signals. Its endpoint `GET /api/recommendations` and its 4 unit
  tests stay intact. Additive preparation fields (`cardId`, `boardId`, `activityId`, `dueAt`,
  `focus`, `sourceRef`) let the client adapter build real targets. No new authority reads the
  learning tables.
- `CanvasStudio`'s existing `preferredBoardId` prop opens a saved board. No canvas code changes.
- `GET /api/study/ask` already persists a pending question presentation; calling it before
  opening `StudyStage`/`StudyPanel` prepares the next exercise. No study code changes.
- `StudioSurface` gains one optional `initialFocus` string so a cited source can be prefilled;
  the artifact pipeline and provider calls are untouched.
- React 19.2.0 state and effects, lucide-react 0.563.0 icons, and the existing plain CSS
  conventions (no Tailwind or component library) render the one surface.

## Alternatives rejected
- A generic state/event library or a new backend ranking service: ranking is a pure comparison
  of four numbers and the data already crosses the loopback boundary once.
- Three feature-owned cards (hint, next-action, due-task): explicitly forbidden by the
  roadmap decision and by `FRONTEND_DESIGN_PRINCIPLES.md`.
- A provider-driven "what should I do next" call: violates the no-provider, deterministic,
  course-grounded constraints and would make ranking non-reproducible.
- Reusing the removed wave-1 `RecommendationList.tsx` card: that was the competing surface
  wave 2 replaces; no fallback UI is resurrected.

## Limits
- Lab hints and due re-draw tasks are registration points only in this change; no producer is
  implemented for them because their upstream work is not on `main`.
- Opt-in is one local preference (`studyai.coach.enabled`, default on so the unified stream is
  the shipped single attention surface). Dismissals are local and keyed by board revision for
  board targets so a new revision clears them.
- If preparation fails (missing board, no reviewed question), the Coach shows a plain message
  and never invents a target or navigates to a guessed one.

## Verification
- `tests/coach.test.ts` covers ranking order, dedupe, dismissal keys and the HTTP adapter.
- `tests/e2e/coach.spec.ts` asserts the rendered DOM: one prompt, preview text, Continue
  preparing each target, secondary access, dismissal and keyboard path, plus screenshots.
- `npm run verify` (tsc + Vitest + Playwright) output is quoted in the handoff.

# Daily plans — specification work

> "Daily plans, visual document extraction, deeper simulations, per node artifact editing, and parity are all very important"

This task is read-only product and architecture work. Do not write product code.

## Goal

Produce a design spec and implementation plan for a real daily learning plan: a dated, course-grounded sequence of next actions derived from mastery, FSRS due state, attempts, canvas issues and the existing Coach contract. The plan must send the student back to grounded work on their own material, not into a generic task list.

## What to inspect

- `src/coach/*`, `src/App.tsx` Coach wiring, `/api/recommendations`, `/api/study/ask`, progress and `/api/progress`.
- `server/learning/*` (FSRS, BKT, activity specs and attempts), mastery storage, canvas issues.
- Existing recommendation and Coach specs/plans in `docs/superpowers/` and `docs/PRODUCT_ROADMAP.md`.
- What is already shipped so the spec does not invent a second source of truth.

## Constraints

- One Coach owns guidance: one ranked prompt at a time, secondary suggestions kept, honest preparation and Continue. Daily plans feed it, not a second recommender.
- 99.9% of student-facing substance must come from course material; anything else labelled. Every plan item needs a source or an honest reason.
- No new provider, paid path, dependency, authoring authority or grounding implementation.
- No DESIGN.md and no visual direction choice. Keep the work under the current scheme.
- No subagents, no Groq models.

## Deliverables

- `docs/superpowers/specs/2026-11-24-daily-plans-design.md` with intent, goals, non-goals, constraints, approaches (with a recommendation), the data contract, and what is left to the builder.
- `docs/superpowers/plans/2026-11-24-daily-plans.md` with bite-sized TDD tasks and exact files/tests.
- A short note in `docs/PRODUCT_ROADMAP.md` replacing the "daily plans" gap with the spec link.
- Commit to `work/daily-plans-spec-20261124` with the Discord link from the project instructions. Do not push or merge.

# Fold Coach into Tutor

> User chose "Fold Coach into Tutor" when asked whether both were needed.

## Goal

One conversational surface. The Tutor panel becomes the only assistant surface: the Coach's one ranked next step, its preview line, Continue and the secondary suggestion list render inside that panel instead of a floating dock. The Coach's ranking, preparation and truthfulness logic stays exactly as shipped; only its surface moves.

## Why now

The floating Coach dock has `z-index: 1200` and overlays Studio and Artifacts. On current main it intercepts a citation click in `tests/e2e/app-cohesion.spec.ts`, so that spec fails even though the citation logic is correct. Folding the surface removes the competing layer and fixes that seam.

## Boundaries

- Work only in this worktree; commit to `work/coach-into-tutor-20261124` with the Discord link from the project instructions. Do not push or merge to main.
- Keep the `useCoach` contract, `prepareCoachTarget`, one ranked prompt at a time, and honest Continue. No second recommendation engine, no new provider, paid path, dependency or grounding implementation.
- Preserve data-testids used by `tests/e2e/coach.spec.ts` where they still make sense; update assertions only where the surface genuinely moved, and do not weaken them.
- When the Tutor panel is closed, the Coach is reached by opening the Tutor — not by a second dock.
- Update the daily-plans spec note so its dated step line lives in the Tutor surface, not a Coach dock. No `DESIGN.md`, theme or direction choice.
- **No subagents of any kind, including reviewer subagents.** Review natively in this thread.

## Verification

- Targeted `coach.spec.ts`, `app-cohesion.spec.ts`, `tutor-experience.spec.ts` and `tutor-hygiene.spec.ts` must pass. The citation-from-Studio/Artifacts/ConceptGraph seam in `app-cohesion.spec.ts` is the acceptance test for removing the overlay.
- Quote `npm run verify`, name provider-dependent failures separately, upload screenshots in order, one critique URL per commit, three strongest objections inline.
- Record the result in `docs/verification/2026-11-24-coach-into-tutor.md`.
- Ports: `WEB_PORT=5681`, `RUNTIME_PORT=8681`, `DATA_PORT=8682`, `AGENT_PORT=8581`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8581`, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Load `.env` without printing keys.

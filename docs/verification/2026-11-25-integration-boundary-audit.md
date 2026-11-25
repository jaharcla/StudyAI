# Integration boundary audit — 2026-11-25

Branch: `work/integration-audit-20261125` (base `1d468d5`). Scope: the six handoffs named in the learning-loop directive. No dependencies, keys, paid services or schema changes.

## Result

| Boundary | Status | Evidence |
| --- | --- | --- |
| Sources → Tutor | Pass | `tests/e2e/integration.spec.ts`: indexed PDF → cited tutor answer → Lewis edit → save → reload; cross-course read rejected. 3/3 pass. |
| Sources → Studio | Fixed + pass | Coach focus handoff leaked across navigation. See defect below. `coach.spec.ts` 10/10, `studio.spec.ts` 3/3 pass. |
| Tutor → Study | Pass | `coach.spec.ts`: Continue loads the next reviewed question and keeps the Coach mounted; failed preparation invents no target. |
| Study → Concepts | Pass | `concept-graph.spec.ts`: truthful mastery, saved canvas relationship, weak concept jumps to practice. 1/1 pass. |
| Canvas → Tutor | Pass by code trace | `src/canvas/tutor.ts` binds every proposal to board id, course, lesson, base revision and expected object set; stale proposals are rejected before apply. Covered by `integration.spec.ts`. |
| Persistence → Return visits | Fixed + pass | Handoff state now follows the Studio visit. Course/lesson/notes/canvas reload covered by `integration.spec.ts`. |

The previously flagged 02:49 "Welcome to KIN 120" reappearance was reviewed and accepted as intentional onboarding: the Home surface renders only on `mode === "home" && course.id`, the only automatic open follows course creation, and the source video description shows it only during course creation and indexing. No fix.

## Defect found and fixed

**A Studio source focus survived leaving Studio by any path except its own Close button.** A cited source focus from one lesson was prefilled into the next lesson's Studio, which would generate against the wrong lesson's material.

- Root cause: `coachFocus` (and the two handoff ids) were cleared only in `StudioSurface`'s `close` callback. Escape (`src/App.tsx` global key handler), the sidebar, and course/lesson changes all leave Studio through other paths.
- Red test: `coach.spec.ts` "a Studio source focus does not survive leaving by another navigation path". Before the fix it failed with `Received: "focus-source.txt: This lesson introduces the scientific method."` after switching lessons.
- Fix: one effect in `src/App.tsx` clears the handoff whenever `mode !== "studio"`, so the handoff is valid only for the visit that consumes it. No test was weakened.

## Verification

- `npx tsc -b` — exit 0.
- `npm test` — 144 files / 911 tests passed.
- Targeted Playwright, one suite at a time: `coach.spec.ts` 10/10, `integration.spec.ts` 3/3, `concept-graph.spec.ts` 1/1, `studio.spec.ts` 3/3.

## Honest gaps

- Full `npm run verify` was not rerun on this branch; only the checks above were.
- No OpenAI/Gemini key is configured, so live-provider tutor turns and cloud voice remain unverified; browser tests use the local deterministic path.
- No voice engine has been benchmarked; no weights downloaded.
- `initialArtifactId` / `initialDeckId` have setters that are never called anywhere in the app. They are inert handoff props, not a working Library → Studio route. Left untouched because removing or wiring them is outside this audit's fix scope.

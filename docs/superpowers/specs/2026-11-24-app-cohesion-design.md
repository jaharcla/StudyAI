# App cohesion design — one app after the merged tracks

Owner request: "Neutral cohesion pass but make sure everything is logically connected."

## Intent

Parallel tracks shipped Canvas, Lecture/Split, StudyStage, Studio, Artifacts, Practice, Concept graph, Narration, Coach and Tutor. Each track owns its own surface styling and entry points. The app should read and behave as one product: the same visual grammar everywhere, and every surface reachable and connected to the context the student already has.

## Goals

- One surface grammar: eyebrow/title/subtitle hierarchy, primary vs secondary action roles, spacing scale, card and panel treatment, focus ring, and status/empty/error/loading states across all shipped surfaces.
- One provenance and grounding vocabulary: a citation chip, source link and "generated/ungrounded" label mean the same thing everywhere.
- Logical connection: every shipped surface has a visible entry point from the shell or a surface that produces it; course, lesson, board, selected object and artifact context survive the transition; Coach Continue prepares the destination; a generated artifact opens where it is stored; a concept node can reach practice; a citation opens its source; the return path goes back to where the student came from.
- No stale context after a course or lesson change, and no surface that can only be reached by a direct URL.

## Non-goals

- No visual direction choice, no `DESIGN.md`, no new theme. Work under the active `immersive-real` scheme.
- No new feature, provider, paid path, dependency or grounding-rule change.
- No rewrite of Tutor, Canvas intelligence, artifact generation or practice logic. This pass aligns what is already shipped.

## Constraints

- Direction-agnostic changes only: tokens, shared classes and copy that stay correct whichever direction is chosen later.
- Keep the 99.9% course-grounding rule and the existing single authoring authority.
- Frontend principles in `docs/FRONTEND_DESIGN_PRINCIPLES.md` apply; every visual change needs a Playwright DOM assertion and critique.

## Approaches

1. **Neutral cohesion under the current scheme (chosen).** Normalise shared classes and copy in place, then wire the broken entry and return paths. Fast, reversible, no theme lock-in, and it preserves every shipped track.
2. **Choose one of the three visual direction mockups first, then rebuild surfaces under it.** Stronger identity, but it needs the owner's direction choice, which is explicitly still open.
3. **Audit only.** Cheapest, but the owner asked for the pass to be done, not reported.

## What the builder decides

- Which shared class or token to extend vs which per-surface rule to delete, based on the rendered DOM.
- Which connections are genuinely broken vs already working; do not rewrite working state flow to make it look uniform.
- The exact assertion for each fixed seam and the screenshots that show light and dark states.

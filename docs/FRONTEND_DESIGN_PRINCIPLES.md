# Frontend design principles — binding for all UI work

Owner instruction, 2026-11-23: all agents working on frontend must follow modern design principles. This document is the shared standard; read it before changing any UI.

## Mode

StudyAI's app surfaces are **Operate** — the student is completing a task. Clarity, scanability, consistency and the real usage scene outrank expression. Brand lives in precise details, not decoration.

## Non-negotiable craft floor

- **Contrast:** body and placeholder text ≥4.5:1, large text ≥3:1. On coloured surfaces, tint secondary text from that hue or the foreground — never neutral gray.
- **Depth:** shadows carry an offset and a soft blur. Zero-offset coloured halos, hard offset block shadows and one-sided border accents are not depth.
- **Spacing:** tight groups, generous separation between groups; more space above a heading than below it. Check computed values, not intentions.
- **Type:** clear scale and weight steps, balanced headings, no banned kicker above a heading, no gradient text, no monospaced costume.
- **States:** hover, disabled, loading, error, empty, focus-visible and selected states all designed, not inherited from the browser default.
- **Accessibility:** keyboard reachable with visible focus rings, ≥44px hit targets for inline controls, logical tab order, aria-live for status, `prefers-reduced-motion` honoured, semantics over `div` soup.
- **Browser surfaces:** caret, text selection, scrollbars, focus rings and tabular numerals belong to the design too.
- **Copy:** controls name their action; errors name the problem and the recovery; no raw IDs, provider strings or internal codes shown to students.

## Motion

Motion explains state, relationship and hierarchy. It never gates the UI or makes the student wait.

- One authored moment per surface, not scattered effects.
- 100–150 ms immediate feedback, 150–300 ms routine change, 300–500 ms layout or overlay transition; exit faster than entrance.
- Natural deceleration such as `cubic-bezier(0.16, 1, 0.3, 1)`; no bounce or elastic by reflex.
- Prefer transform, opacity, clip-path, bounded blur and shadow; avoid animating width/height/top/left.
- Interruptible; repeated navigation stays fast; reduced motion keeps the same information without movement.
- Do not stack techniques for spectacle.

## Refuse

- Same-size icon-heading-text cards as page structure; nested cards.
- Hero-metric templates, section numbers as decoration, kickers/eyebrows above headings.
- Glass or blur as decoration, gradient text, emoji or Unicode glyphs standing in for a real icon system.
- A second spatial grammar (shell pan/zoom) inside a workspace that already has Canvas pan/zoom.
- A splash screen or page-load choreography.
- A new Coach, hint, next-action or due-task card — the app has one unified Coach stream.

## Critique is part of the work

No UI is considered finished on the builder's own say-so. Every frontend worker must:

- run an inline critique of its own result against this document before reporting completion, and state the three strongest objections a critic would raise;
- keep the output reviewable — screenshots, DOM assertions and `npm run verify` output in the thread — so the coordinator can run a separate **native** critique thread on it;
- treat critique findings as work items, not suggestions, and re-verify after acting on them.

Critique agents are native thread agents only. The subagent tool stays banned, including any skill workflow that asks for a builder-check or review subagent; do the check inline or report the gap.

## Verification, not intention

- Judge the actual render at shipped sizes, light and dark, before and after.
- Upload screenshots to the thread; iterate on what they show.
- Playwright DOM assertions for UI behaviour; `npm run verify` output quoted, with provider-dependent failures named separately.
- Every claim must trace to the student's course material or be labelled as general knowledge; deterministic scientific tools stay authoritative for calculations.

## References

- `C:\Users\Owner\.config\opencode\skills\impeccable\reference\craft-floor.md`
- `C:\Users\Owner\.config\opencode\skills\impeccable\reference\animate.md`
- `docs/PRODUCT_ROADMAP.md` — competitive frame, grounding principle, unified Coach decision.

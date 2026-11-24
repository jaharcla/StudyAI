# Study guide and infographic UI remaster

Owner words, verbatim:
> Screenshots show that the actual code works(I think) but the ui could use a remaster

The Phase A/B functionality is accepted as working. This task is visual and interaction craft only: do not change the data model, provenance rules, store, or generation logic.

## What to remaster

- The artifacts list/filter surface for study guides and infographics.
- The study guide view: structure, hierarchy, citation chips, accept and download controls.
- The infographic view: deterministic SVG figure presentation, caption/credit, citation chips, accept and download controls.
- Loading, empty, error and success states for all of the above.

## Standards

- Read `C:\Users\Owner\Downloads\StudyAI MK3\docs\FRONTEND_DESIGN_PRINCIPLES.md` in full before touching UI. It is binding: Operate-mode restraint, ≥4.5:1 body text, offset+blur depth, tight groups with generous separation, real hover/focus/disabled/loading/error/empty states, keyboard access, reduced motion, one authored motion moment, no kicker/nested cards/gradient text/emoji icons/shell pan-zoom.
- Audience: students. Visually pleasing, but do not pander to a Gen Z aesthetic. No gradients, mascots, slang or trend-chasing. Pleasure comes from typography, spacing, depth, restraint and meaningful motion.
- Grounding: every claim in the UI traces to course material or is labelled general knowledge; never surface raw IDs or provider strings.

## Critique loop

Before reporting done, critique the result inline against the standard and state the three strongest objections a critic would raise. Treat them as work items. Keep screenshots and DOM assertions reviewable so the coordinator can run a separate native critique thread. No subagent tool, no Groq models.

## Definition of done

- Before/after screenshots for every remastered surface at shipped desktop size, light and dark; upload to your thread in a fixed order.
- Playwright DOM assertions for list/filter/open/citation/accept/download and for the states you designed.
- Quote `npm run verify` output; name provider-dependent failures separately.
- Commit real changes to `work/artifact-phase-b-20261123` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966` in the message.

## Constraints

- Work only in this worktree. Local env: `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Unique ports: WEB_PORT=5351, RUNTIME_PORT=8291, DATA_PORT=8292, AGENT_PORT=8211.
- No new dependency, no paid service, no new authority, no committed generated assets.

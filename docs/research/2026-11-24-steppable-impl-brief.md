# Implement steppable worked examples

Owner wants the site to move closer to the vision overnight. A full spec and plan already exist:

- `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\steppable-artifacts-20261123\docs\superpowers\specs\2026-11-23-steppable-artifacts-design.md`
- `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\steppable-artifacts-20261123\docs\superpowers\plans\2026-11-23-steppable-artifacts.md`

Read both, plus `AGENTS.md`, the frontend design principles and the existing artifact/canvas contracts before editing.

## Goal

Make a `worked-example` artifact replayable as a sequence of structured canvas states that a student can pause, step through, manipulate and take over — without a new object kind, authority, table or provider. Navigation is view state; it must never write a canvas revision. Takeover is a mode switch whose first real edit bumps revision once through the existing persistence path.

## Boundaries

- Do not touch `src/App.tsx` or `src/coach/*`; mount through an existing Studio/artifact surface.
- Do not touch Lewis, narration, deck, learning/practice, Tutor event filtering, or concept-graph code — those are shipped or in flight.
- Reuse `src/artifacts/`, `compileArtifactBrief`, `SceneGlyph`, `LearningActivityService` attempt storage and existing provenance.
- No new dependency, no paid service, no provider key.

## Verification

- Unit tests for state sequencing, view-only navigation and takeover revision behaviour.
- Playwright DOM assertions for play/pause, next/previous, takeover and citation provenance.
- Screenshots uploaded in your thread; quote `npm run verify` and name provider-dependent failures separately.
- Inline critique with three objections; follow the frontend design principles.

## Constraints

- Work only in this worktree; commit to `work/steppable-artifacts-impl-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Native execution only: no subagents, no Groq-hosted models.
- Ports: WEB_PORT=5481, RUNTIME_PORT=8521, DATA_PORT=8522, AGENT_PORT=8421; env opencode-go / hy4-flash-free.

# Implement narrated walkthrough of the student's own canvas

Owner wants the site to move closer to the vision overnight. A prior spec and plan exist:
`C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\canvas-narration-20261123\docs\superpowers\specs\2026-11-23-canvas-narration-design.md`
and `...\plans\2026-11-23-canvas-narration.md`. Read both plus `AGENTS.md` and the frontend design principles.

## Deliverable

A working first version: from the Scientific Canvas, the student can start a narrated walkthrough of the structured objects on their own board. Use browser-native `speechSynthesis` (no API key, no paid service, no cloud egress) as the first TTS route. Narration segments come from the existing Tutor explanation path and structured canvas state; each segment highlights the object it describes on the board, with a transcript and a visible stop control.

Every spoken claim must trace to course material or be explicitly labelled general knowledge, per `ADR-2026-11-24-course-grounding-rule.md`. No invented objects or citations. The narration is an explanation of the student's work, not a generic podcast.

## Boundaries

- Do not touch `src/App.tsx` unless a tiny mount is unavoidable; prefer a self-contained component mounted from `CanvasStudio.tsx`.
- Do not touch `src/coach/*`, Lewis files, artifact views, learning/practice, or presentation/deck code — other tracks own them.
- No new dependency, no provider key, no cloud call, no paid service.

## Verification

- Unit tests for segment generation and transcript grounding.
- Playwright DOM assertions: start, highlight follows segment, transcript visible, stop works, no raw IDs in visible text.
- Upload screenshots and quote `npm run verify`; name provider-dependent failures separately.
- Frontend standard and inline critique with three objections.

## Constraints

- Work only in this worktree; commit to `work/canvas-narration-impl-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Native execution only: no subagents, no Groq-hosted models.
- Ports: WEB_PORT=5441, RUNTIME_PORT=8481, DATA_PORT=8482, AGENT_PORT=8381; env opencode-go / hy4-flash-free.

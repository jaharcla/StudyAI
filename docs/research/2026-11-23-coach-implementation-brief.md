# Unified Coach implementation

Owner direction: keep pushing toward the vision. Rating the product against the brief showed personalized learning is one of the weakest areas — no shipped recommendation surface, no next-step guidance. This closes that gap with the already-approved design.

## Binding decisions (from `docs/PRODUCT_ROADMAP.md`)

- One Coach surface, not three attention surfaces. Recommendation Continue, lab hints and due re-draw tasks are inputs to one ranked prompt stream emitting at most one prompt at a time.
- The Coach follows the student between surfaces: a prompt carries a target; activating it prepares the board, study session or lesson state in the destination, then surfaces the Coach there.
- **Continue must prepare the target state**, with a short preview line before the click saying what will be prepared. It is not a bare navigation link.
- Secondary recommendations stay accessible without overwhelming the student. Progress numbers and weak-concept/due-review links stay unchanged.
- Module ownership: `src/coach/contract.ts` owns `CoachPrompt` and target types; `src/coach/service.ts` owns deterministic ranking and selection from registered `CoachProducer`s; `src/coach/useCoach.ts` owns React activation and the single surface. Features register producers, own no card, and never call view setters for prompts.
- Ranking: urgency (FSRS due/overdue), then current-board context match, then staleness; lab-hint precedes recommendation on ties.
- Target: `courseId`, `lessonId`, one of `boardId`/`activityId`/`cardId`, plus `conceptId` and a plain-language reason.
- Opt-in is one localStorage preference per device; dismissed hints keyed by board revision.
- Every claim traces to course material or is labelled general knowledge. No provider calls, no paid service.

## What to build

1. `src/coach/contract.ts`, `src/coach/service.ts`, `src/coach/useCoach.ts` per the ownership decision.
2. Adapt `server/recommendations.ts` (now in main) into a `CoachProducer` that emits shared-contract prompts with targets, reasons, citations and deterministic dedupe. Keep the endpoint and unit tests intact.
3. One Coach surface mounted with a minimal change to `src/App.tsx`. It shows the single top prompt with a preview line and a prominent Continue button, plus a discreet way to see the remaining prompts. No new hint card, next-action card or due-task card.
4. Activation prepares real state: opens the relevant board or study session with the next exercise/material loaded, then surfaces the Coach there. If preparation fails, show a plain message; never invent a target.
5. Keyboard access, visible focus, `prefers-reduced-motion`, and the frontend design principles in `C:\Users\Owner\Downloads\StudyAI MK3\docs\FRONTEND_DESIGN_PRINCIPLES.md`.

## Dependencies and non-goals

- Read `docs/plans/2026-11-23-recommendations.md` and the roadmap decisions. Lab hints and re-draw tasks are future producers; leave clean registration points, do not implement them here.
- Do not touch Lewis, canvas glyphs, artifact views, slide decks, or the course/dialog work. If `src/App.tsx` is shared, make the smallest possible edit.
- No new dependency, no new authority, no provider key.

## Definition of done

- Playwright DOM assertions for: one prompt at a time, preview line text, Continue prepares the target, secondary list accessible, dismissal and keyboard path.
- Screenshots of the Coached lesson home and prepared destination, uploaded to your thread.
- Inline critique with three strongest objections; critique agents must be native threads, subagent tool banned, no Groq models.
- Quote `npm run verify`; name provider-dependent failures separately.
- Work only in this worktree. Commit to `work/coach-implementation-20261123` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966` in the message.
- Local env, no secrets printed: `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Ports: WEB_PORT=5381, RUNTIME_PORT=8321, DATA_PORT=8322, AGENT_PORT=8241.

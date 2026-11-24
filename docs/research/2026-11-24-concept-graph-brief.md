# First slice — semantic concept graph with mastery

Owner direction: use the overnight hours to do more than verification. This is the weakest vision area: mastery tracking exists, but there is no semantic concept graph a student can explore.

## Reuse first

- `learning_concepts`, `mastery_updates`, `server/progress.ts` for concept state and BKT.
- `src/studio/MindMapView.tsx` and Studio artifacts for graph rendering and source chips.
- `concept` and `relationship` canvas objects, `src/canvas/model.ts`, and the mindmap kind.
- `server/recommendations.ts` / Coach for jump-to-practice actions.
- Do not add a new board-interpretation authority, new ScientificObject kind, or new provider.

## Deliverable

A working first slice: a course-level concept graph view showing real concepts from the student's course, with a mastery state on each node, prerequisite/relationship edges where data exists, and an action to open practice for a weak concept. Reuse the existing mind-map renderer or Studio surface; do not create a second graph authority just for this.

Concepts must come from the student's course material or learning records — no invented nodes. If a relationship is not backed by data, omit it rather than guess.

## Verification

- Unit tests for graph assembly from real concept/mastery records.
- Playwright DOM assertions: nodes render, mastery labels are truthful, weak-concept action opens practice.
- Screenshots uploaded in your thread; quote `npm run verify` and name provider-dependent failures.
- Frontend standard `C:\Users\Owner\Downloads\StudyAI MK3\docs\FRONTEND_DESIGN_PRINCIPLES.md`; inline critique with three objections.

## Constraints

- Work only in this worktree; commit to `work/concept-graph-slice-20261124` with the Discord link from the repo's other overnight briefs.
- Native execution only: no subagents, no Groq-hosted models, no paid services.
- Ports: WEB_PORT=5421, RUNTIME_PORT=8461, DATA_PORT=8462, AGENT_PORT=8361. Env: opencode-go / hy4-flash-free.

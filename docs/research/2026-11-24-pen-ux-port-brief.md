# Port the pen UX branch onto current main

> User chose "Pen UX first" from the unmerged-branch shortlist.

Source: local branch `work/canvas-pen-ux`, unmerged. Feature commits: `1021b47` (smooth pen pressure), `c0abf9b` (persisted palm-rejection toggle with pointerType filtering), `4636d01` (scratch-out erase and circle-select), `c8cb0c2` (double-tap handwriting-to-LaTeX approval proposal), `b340a2c` (verification record). Do not merge the source branch and do not push.

## Goal

Bring those canvas capabilities onto current main with their tests intact, without regressing the shipped canvas, steppable replay, narration or grounding behaviour.

## Boundaries

- Work only in this worktree and commit to `work/pen-ux-port-20261124` with the Discord link from the project instructions.
- Cherry-pick or port deliberately; resolve conflicts conservatively in favour of current main where the old branch predates newer canvas work. Do not weaken assertions or skip tests.
- No new paid service, provider, dependency, authoring authority or grounding change. No subagents, no Groq models.
- Leave `src/App.tsx`, Coach, Studio, Artifacts, Tutor and concept graph alone — another worker owns those surfaces.

## Verification

- Targeted Vitest for `tests/pen-input.test.ts` and the pen UX browser spec; quote `npm run verify` if the machine allows it and name provider-dependent failures separately.
- Screenshots of the pen controls in your thread, critique URL per commit, three strongest objections inline.
- Record the result in `docs/verification/2026-11-24-pen-ux-port.md`.
- Ports: `WEB_PORT=5641`, `RUNTIME_PORT=8651`, `DATA_PORT=8652`, `AGENT_PORT=8541`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8541`, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Load `.env` without printing keys.

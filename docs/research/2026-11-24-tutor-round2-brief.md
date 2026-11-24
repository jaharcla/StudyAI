# Round two — Tutor reasoning, empty citations, context budget

Evidence: mock student rerun in thread 1574689544459124746, screenshots run1-03/04 and run2-03. The earlier hygiene fix did not solve these in the real browser:

- Every answer still shows `Thought for…` blocks with raw reasoning. The student sees internal planning, tool confusion and budget errors.
- A grounded CHEM answer rendered all three citation slots as `()` — DOM check found zero citation links.
- Asking about a selected Equation failed with "The current canvas evidence and question exceed the Tutor context budget…" after four visible reasoning blocks.
- In KIN, a board citation chip worked and pointed to the real object id — keep that.

## Scope

- `server/agent.ts`, `server/tutor-presentation.ts`, `server/tutor-context.ts`, `server/tutor-retrieval-policy.ts`
- CopilotKit message rendering configuration where reasoning is exposed (search for reasoning/thinking display in `src/App.tsx` only if unavoidable; prefer server-side message shaping).
- Tutor tests and e2e specs.

## What to fix

1. Suppress all student-visible reasoning, including streaming `Thought for…` UI. If CopilotKit renders reasoning parts from the message stream, shape or strip them at the server boundary. Keep tool reasoning inside tools/logs, never in the answer UI.
2. Never render empty `()` citation slots. A citation with no ref/label must be dropped before presentation. Preserve working document and board citations.
3. Fix or gracefully explain the canvas context budget failure: compact selected-object context more aggressively, or return a plain message with a concrete recovery action. Do not leak the raw budget error.
4. Preserve the good behaviour from the rerun: grounded answers, openable PDF citations, clickable board chips, general-knowledge labelling, no empty answers.

## Verification

- Playwright assertions on real answers: no `Thought for`, no `()`, at least one working citation when evidence exists, no raw budget string.
- Unit tests for citation cleanup and reasoning suppression.
- Quote `npm run verify`; name provider-dependent failures separately. Inline critique with three objections.

## Constraints

- Do not touch `src/coach/*`, `src/studio/*`, `src/canvas/*`, learning/practice, artifacts or decks. Do not rewrite `src/App.tsx` unless a one-line renderer option is unavoidable; coordinate if so.
- Work only in this worktree; commit to `work/fix-tutor-reasoning-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Native execution only: no subagents, no Groq-hosted models, no paid services. Ports: WEB_PORT=5451, RUNTIME_PORT=8491, DATA_PORT=8492, AGENT_PORT=8391; env opencode-go / hy4-flash-free.

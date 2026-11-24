# Coach truthfulness and provider status

Evidence: mock student rerun, screenshots run1-11 and run2-08, plus GitHub #25 and #26.

- After Continue, Coach says `Ready in Study. Your next question is loaded.` but Study shows only `Next review due…` and Ask returns empty.
- The same stale status crosses into another course.
- Tutor header and Settings say `Ollama is unavailable` while the active provider is `opencode-go` / `hy4-flash-free`; the model dropdown is disabled with no active model shown.

## Scope

- `src/coach/*`, `src/App.tsx`, `src/learning/StudyPanel.tsx`, `src/FreeKeyGuide.tsx` if needed.
- `tests/coach.test.ts`, `tests/e2e/coach.spec.ts`, settings/provider e2e specs.

## What to fix

1. Continue must only claim what was actually prepared. If no question is loaded, say so plainly and offer a real next action; never report a loaded question that is absent.
2. Clear Coach status and prompts when course or lesson changes. No stale cross-course messages.
3. Show the active provider and model in Settings/Tutor header. Under explicit `opencode-go`, display `hy4-flash-free` from configuration, or explain clearly why the local picker is inactive. Do not add a provider key or provider call.
4. Keep the one-prompt ranked stream, preview line and prepared target behaviour from the binding Coach contract. No new cards.

## Verification

- Playwright assertions for successful preparation, failed preparation, course-change clearing, and provider/model display.
- Quote `npm run verify`; name provider-dependent failures separately. Inline critique with three objections.

## Constraints

- Work only in this worktree; commit to `work/fix-coach-truth-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Native execution only: no subagents, no Groq-hosted models, no paid services. Ports: WEB_PORT=5461, RUNTIME_PORT=8501, DATA_PORT=8502, AGENT_PORT=8401.

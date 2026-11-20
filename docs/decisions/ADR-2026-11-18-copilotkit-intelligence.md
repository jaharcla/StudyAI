# ADR 2026-11-18: Connect to CopilotKit Intelligence

- Status: Proposed (awaiting approval)
- Scope: small change — runtime wiring, provider transport, env documentation, privacy docs

## Intent and why

StudyAI already runs a CopilotKit Runtime v2 (`server/runtime.ts`, `@copilotkit/runtime` 1.85.0) in SSE mode. The user created a CopilotKit Intelligence project with `npx copilotkit login` and `npx copilotkit project select`; the CLI wrote `CPK_INTELLIGENCE_API_KEY` to `.env` and `.copilotkit/project.json`. The goal is to connect the existing runtime to that project so the CopilotKit Inspector shows **Intelligence connected** and tutor threads are recorded, with user memory, learning, and analytics available in the project.

## Goals

- Run the existing `CopilotRuntime` in Intelligence mode using the project key already in `.env`.
- Keep the existing LangGraph tutor agent, tools, `identifyUser`, and thread behavior unchanged.
- Make the frontend transport explicitly match the multi-route runtime handler.
- Document the new off-machine data flow and the opt-in key.
- Verify via `GET /api/copilotkit/info` (`mode: "intelligence"`) and an Inspector thread check.

## Non-goals

- No application authentication or multi-user support. The fixed `local-single-user` identity remains, which CopilotKit documents as suitable only for a local, single-user demo.
- No self-hosted Intelligence deployment (Kubernetes/ECS) and no custom `apiUrl`/`wsUrl`.
- No changes to the tutor graph, canvas intelligence, prompts, thread list UI, or existing conversation history.
- No migration of prior SSE conversations into Intelligence.

## Anti-goals

- Do not send the Intelligence API key to the browser or expose it through a `VITE_` variable.
- Do not make the app fail to start when the key is absent; local SSE mode must remain the default.
- Do not claim verification without a live `/info` check and a recorded Inspector thread.

## Approaches considered

1. **Cloud-hosted Intelligence (chosen).** `new CopilotKitIntelligence({ apiKey })` passed to `CopilotRuntime`. Minimal wiring, uses the project the user already created, and Inspector works.
2. **Self-hosted Intelligence.** Same client with `apiUrl`/`wsUrl` overrides. Keeps data on user infrastructure, but requires running the Intelligence services; too heavy for this local single-user app.
3. **Stay in SSE mode and hide the panel.** No cloud data, but does not add the requested capability.

## Decision and design

- **Reuse existing pinned dependency.** No new package or version bump. `CopilotKitIntelligence` is already exported from `@copilotkit/runtime/v2` in the installed 1.85.0; `@copilotkit/react-core` 1.85.0 supplies the provider.
- **Opt-in activation.** Read `process.env.CPK_INTELLIGENCE_API_KEY` in `server/runtime.ts`. If non-empty, construct the Intelligence client and pass it as `intelligence`; otherwise construct the runtime exactly as today (SSE). This keeps local-first operation working for anyone without a key.
- **Identity.** Keep `identifyUser: () => ({ id: "local-single-user", name: "Local user" })`. It is not an authentication gate; the app remains loopback-only and single-user.
- **Frontend transport.** Add `useSingleEndpoint={false}` to `CopilotKitProvider` in `src/App.tsx` to make the multi-route transport explicit (the runtime mounts `createCopilotRuntimeHandler` + `createCopilotNodeHandler`).
- **Key handling.** The key stays in `.env` (already gitignored). Add a commented `CPK_INTELLIGENCE_API_KEY=` entry to `.env.example` so the option is discoverable without a secret.
- **Documentation.** Update `README.md` and `docs/STATUS.md` to state that enabling Intelligence sends a copy of AG-UI interaction history (messages and tool activity) to CopilotKit's managed service, in addition to the existing Groq/Google flows.

## Limits

- Intelligence records its own copy of interaction history; it does not replace the LangGraph agent's conversation state.
- Cloud-hosted Intelligence is an external service; offline/local-only operation depends on leaving the key unset.
- The Inspector thread check is a manual step and is not covered by the existing Vitest/Playwright suites.

## Verification

1. `npm run build` and `npm test` in `C:\Users\Owner\Downloads\StudyAI MK3`.
2. Start `npm run dev:runtime`, then `GET http://127.0.0.1:8210/api/copilotkit/info` and confirm `mode: "intelligence"` plus the `studyai` agent.
3. With the full app running, open the Inspector, confirm **Intelligence connected**, send one tutor message, and confirm the thread and its messages appear under Rich Threads.
4. Repeat `/info` with `CPK_INTELLIGENCE_API_KEY` unset to confirm SSE mode still boots.

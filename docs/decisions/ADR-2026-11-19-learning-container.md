# ADR: CopilotKit Intelligence Learning container for tutor threads

Status: accepted and implemented.

## Decision

Reuse the Learning support already in the installed `@copilotkit/runtime` 1.85.0 and assign every tutor thread to the managed Learning container `studyai-mk3`:

1. `server/runtime.ts` constructs `new CopilotKitIntelligence({ apiKey: process.env.CPK_INTELLIGENCE_API_KEY!, getLearningContainerId })` and passes it to `new CopilotRuntime({ intelligence, identifyUser, agents })`.
2. The selector returns `"studyai-mk3"` when `agentId === "studyai"` and `undefined` otherwise, so only the tutor graph is recorded and any future agent stays unassigned until it gets its own container.
3. The container id is a constant, never per-request state: a thread is assigned to a container before its first run and cannot move afterwards. The container is the pre-created "StudyAI MK3" container in project 18692; the app does not create containers at runtime.
4. `identifyUser`, the `studyai` `LangGraphAgent`, the runtime handler, and the listen port are unchanged. No `runner` is passed, which is required: `runner` and `intelligence` are mutually exclusive.

## Context

StudyAI is a local-first, single-user app whose tutor threads previously lived only in the runtime's in-memory runner and disappeared on restart. CopilotKit Intelligence is already configured for this project (key in `.env`, `.copilotkit/project.json` names project 18692). The runtime began serving `mode: "sse"`; connecting Intelligence gives thread persistence, the Inspector's thread view, and Learning Spaces without changing the tutor graph.

Alternatives rejected:

- Adding `@copilotkit/learning`: it is already installed but is not the documented path for runtime-level container assignment, and importing it would create a second authority next to `CopilotKitIntelligence`.
- Per-user or per-session container ids: there is one user (`local-single-user`) and one tutor graph, so a stable constant is simpler and keeps every thread in one searchable space.
- Browser trajectory capture (`getTrajectoryLearningContainerIds`): deliberately not enabled. It would record page activity beyond the conversation, which this change does not need.

## Consequences

- Tutor threads are recorded in the hosted Intelligence project 18692, under container `studyai-mk3`. This is a deliberate off-machine data flow; the app still runs entirely locally for the user interface and the tutor agent.
- `/api/copilotkit/info` reports `mode: "intelligence"`, and thread listing is served by the platform instead of memory, so threads survive runtime restarts.
- Threads created before this change (in-memory SSE mode) are not migrated.
- No new dependency, no version bump, no schema or canvas change. `.env` keeps the key; nothing is sent to the browser.
- If the key is absent or the container id is malformed, runs fail rather than silently falling back, because `apiKey` and the selector are evaluated at startup.

## Limits

- A thread's container is fixed at first assignment; changing the selector later only affects new threads.
- Learning features depend on the hosted service being reachable; offline use of the runtime is not supported in this mode.
- The container must already exist in the platform; the app never creates one.

## Verification

- `npm run build` passes (`tsc -b && vite build`).
- `npx vitest run` passes.
- A temporary runtime on a second port reports `mode: "intelligence"` and agent `studyai` at `GET /api/copilotkit/info`.
- `npx copilotkit verify --expect-runtime intelligence --round-trip --agent studyai` passes its runtime checks.
- One tutor thread created through that runtime appears in `GET /api/copilotkit/threads` under `local-single-user`.

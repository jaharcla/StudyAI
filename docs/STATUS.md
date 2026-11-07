# StudyAI status

## Implemented in source

- React/TypeScript workspace with course sidebar, Canvas/Lecture/Split views, resizable tutor panel, and light/dark toggle.
- Quickdraw canvas integration with SQLite snapshots and revision increments.
- Loopback-only local API and SQLite schema for courses, notes, document chunks, FTS5 search, attempts, and drawings.
- Text document ingestion and course-scoped lexical search.
- CopilotKit documented v2 provider/runtime wiring to a LangGraphJS tutor graph; workspace context includes course, lesson, view, and structured canvas object metadata.
- Standalone formal-charge and vector calculations with Vitest cases.
- `.env.example`, `npm run setup`, `npm run dev`, and `start.bat`.

## Verification

- `npm run build` passes; Vite reports large chunks from the bundled editor and diagram libraries.
- `npm test` passes: 3 unit tests across science and database modules.
- Full-stack Playwright verification remains incomplete. LangGraph starts and registers the tutor graph, but reports a checkpoint dependency version warning. Download the configured Ollama model before using local AI.
- `npm ci` currently reports a missing transitive optional package in the lockfile; `npm install --omit=optional` completes.

## Deferred

- PDF viewer, text/table extraction, page-level citations/highlighting, embeddings, and vector retrieval.
- Chemistry structure editor, biology/anatomy tools, KIN graphing tools, health concept maps, FSRS scheduling UI, attempt analytics, and optional MCP connections.
- Groq is shown as a configuration option but not routed by the agent. No LMS connector is active.

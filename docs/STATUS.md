# StudyAI status

The initial scaffold notes below are a historical baseline. The current coordinator status is at the end of this file.

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
- Baseline dependency issue: `npm ci` reported a missing transitive optional package before the coordinator lockfile repair; see the clean-install result below.

## Deferred

- PDF viewer, text/table extraction, page-level citations/highlighting, embeddings, and vector retrieval.
- Chemistry structure editor, biology/anatomy tools, KIN graphing tools, health concept maps, FSRS scheduling UI, attempt analytics, and optional MCP connections.
- Baseline provider status: Groq was not routed by the initial scaffold agent. The coordinator branch now retains Groq-first inference, as recorded below. No LMS connector is active.

## Coordinator branch update — November 9, 2026

- Groq-first inference is retained; Ollama remains the fallback/override.
- Prior reported gates: isolated clean install, 145/145 tests, production build, and the approved synthetic live Groq Canvas-to-Tutor scenario passed.
- Latest targeted verification: 148/148 unit tests, production build passed, and all 5 provider-mocked browser flows passed. Vector apply now matches JSON persistence semantics; selected Quickdraw results are bounded to 12,000 characters with explicit truncation metadata.
- An isolated clean install of the exact snapshot passed `npm ci --include=optional` (1,518 packages), 148/148 tests, and build. The two targeted browser flows also passed there. The additional combined PDF/Lewis flow stalled during note opening in the clean copy, though it passed in the coordinator run; cause remains unconfirmed.
- Canvas Groq queue/cost accounting and effective-provider/model provenance are follow-ups. `main` remains clean at `d6e39c9`; no merge was performed. See `INTEGRATION_VERIFICATION.md` for details.

## Final gate update — November 9, 2026

- Linked-note stall diagnosed as test timing; waiting for the async placement palette to close fixed the flow. The no-delay browser rerun passed.
- Affected browser checks passed 5/5; deterministic suite passed 148/148; production build passed.
- The bounded synthetic Groq Canvas → OCR/analysis → Tutor scenario passed 1/1 with retries disabled, request/token caps, and no available Ollama fallback. Canvas request/cost metering and provider provenance remain follow-ups.
- `main` was unchanged at `d6e39c9` at verification time; see the final merge status in the coordination registry.

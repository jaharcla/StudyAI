# StudyAI architecture

StudyAI is a local single-user React/TypeScript app. Vite serves the UI on `127.0.0.1:5173`; a TypeScript data API on `127.0.0.1:8201` stores notes, drawings, course records, documents, and FTS5 chunks in `data/studyai.sqlite`; CopilotKit Runtime v2 runs on `127.0.0.1:8200`; LangGraphJS serves the tutor graph on `127.0.0.1:8123`. LangGraph loads `.env.example` by default; copy it to `.env` only when changing local configuration.

Quickdraw snapshots are JSON and revisions are written to SQLite. The UI sends only workspace metadata and object type counts to the agent. It does not claim to interpret freehand marks. Current document ingestion accepts UTF-8 `.txt` only. Search is lexical and course-scoped through SQLite FTS5. PDF page extraction/citations, embeddings, vector retrieval, and document highlighting are not implemented yet.

The LangGraphJS tutor uses the existing Groq integration when `GROQ_API_KEY` is configured and `TUTOR_PROVIDER` is `auto` or `groq`. Explicit `groq` mode does not fall back to Ollama. Ollama remains available as the local provider through `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. The local API binds to loopback; Groq is the only remote model service enabled by this configuration.

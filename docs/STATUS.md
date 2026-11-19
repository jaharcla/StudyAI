# StudyAI status

Workspace snapshot: `main` at `4c7f8c2` (November 10, 2026), with additional uncommitted provider configuration and Canvas provider changes. This page describes the current source, not the dependency installation or a fresh runtime verification. The detailed verification log below is historical and predates this snapshot.

## Implemented

- Course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- LangGraphJS Tutor through CopilotKit, with Groq/Ollama provider selection, bounded context and provider requests, course-scoped document retrieval, and optional Google Fact Check searches.
- PDF, DOCX, PPTX, and UTF-8 TXT ingestion; page/slide-aware text chunks, FTS5 search, source references, and a PDF viewer.
- Canvas persistence with revision checks, scientific objects, math workspace, direct manipulation, Canvas analysis, and reviewable AI edit proposals.
- Learning activities with validated specifications and deterministic capability checks.

## Limits

- Document extraction is text-based; scanned PDFs are not OCR'd, and embedded images or charts are not interpreted. Search uses lexical FTS5 rather than embeddings. Canvas OCR is a separate feature.
- Retrieved excerpts and fact-check ratings are evidence to review, not proof. Canvas model interpretations remain uncertain and are not grading evidence.
- AI requests leave the machine when Groq or Google Fact Check is configured and used. Local services bind to loopback; multi-user authentication is not implemented.
- Some learning activity checkers support only the units and models stated in their specifications; unsupported cases return an unknown or unsupported result.

## Verification

No build, test, browser, provider, or production run has been recorded for this exact working tree in this update. [INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) records earlier, dated checks and environment issues; use its results only for the commits named there.

For a fresh local check, install from the lockfile, then run `npm run build` and `npm test`. Browser tests use Playwright and Chromium; live provider requests should be evaluated separately from mocked tests.

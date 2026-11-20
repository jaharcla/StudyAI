# StudyAI status

Workspace snapshot: `codex/whole-board-scene-experiment` at `d40b562` (November 18, 2026), canvas intelligence phases 0-3 landed. This page describes the current source. The verification numbers below were measured on this commit before it was made.

## Implemented

- Course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- LangGraphJS Tutor through CopilotKit, with Groq/Ollama provider selection, bounded context and provider requests, course-scoped document retrieval, and optional Google Fact Check searches.
- PDF, DOCX, PPTX, and UTF-8 TXT ingestion; page/slide-aware text chunks, FTS5 search, source references, and a PDF viewer.
- Canvas persistence with revision checks, scientific objects, math workspace, direct manipulation, Canvas analysis, and reviewable AI edit proposals.
- Canvas intelligence: deterministic capture, math and diagram OCR with a provider chain and daily budgets, local recognition plus a teach/accept/correct/dismiss feedback loop, revision-bound spatial scene graph with FTS5 search, and `get_canvas_scene` / `search_canvas_evidence` / `propose_scientific_object` tutor tools.
- Learning activities with validated specifications and deterministic capability checks.

## Limits

- Document extraction is text-based; scanned PDFs are not OCR'd, and embedded images or charts are not interpreted. Search uses lexical FTS5 rather than embeddings. Canvas OCR is a separate feature.
- Retrieved excerpts and fact-check ratings are evidence to review, not proof. Canvas model interpretations remain uncertain and are not grading evidence.
- AI requests leave the machine when Groq or Google Fact Check is configured and used. Local services bind to loopback; multi-user authentication is not implemented.
- Some learning activity checkers support only the units and models stated in their specifications; unsupported cases return an unknown or unsupported result.
- Canvas provider budgets are in-memory and reset when the server restarts; per-analysis cost and latency are not shown in the UI, and there is no provider disclosure/opt-out yet (phase 4).
- Gemini free tier is 15 requests/minute and can return 503; OpenRouter has no credits and is not a reliable primary. Provider failures degrade to partial analyses rather than wrong answers.

## Verification

Measured on `d40b562` (November 18, 2026), the commit that landed phases 0-3:

- `npx tsc -b`: pass.
- `npx vitest run`: 289 passed in 44 files.
- `npx playwright test tests/e2e/canvas-scene-intelligence.spec.ts tests/e2e/canvas-recognition-review.spec.ts`: 2 passed (19.7 s).
- `npm run benchmark:canvas`: 0 hard failures, 4/6 math boards exact, math F1 0.91, PhysAlign concept coverage 0.75, 12.9 s average latency, $0 provider cost. Gate compared against the now-tracked `docs/verification/canvas-benchmark-baseline.json`.
- Known benchmark weaknesses: nested logistic OCR scores 0.625 F1, and PhysAlign reads `F/N` as `A E / N`. Both are recorded in `CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`.

CI (`.github/workflows/canvas.yml`) runs build and unit tests on every push. The provider-dependent benchmark and browser tests stay local behind `/canvas-verify`, because they need keys and a gitignored dataset.

[INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) records earlier, dated checks; use its results only for the commits named there.

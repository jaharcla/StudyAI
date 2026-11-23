# StudyAI status

Workspace snapshot: `main` at `d380c9c` (November 22, 2026), canvas intelligence phases 0–5 closed. This page describes the current source. The verification numbers below were measured 2026-11-22 on this tree.

## Implemented

- Course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- LangGraphJS Tutor through CopilotKit, with Groq/Ollama provider selection, bounded context and provider requests, course-scoped document retrieval, and optional Google Fact Check searches.
- PDF, DOCX, PPTX, and UTF-8 TXT ingestion; page/slide-aware text chunks, FTS5 search, source references, and a PDF viewer.
- Canvas persistence with revision checks, scientific objects, math workspace, direct manipulation, Canvas analysis, and reviewable AI edit proposals.
- Canvas intelligence: deterministic capture, math and diagram OCR with a provider chain and daily budgets, local recognition plus a teach/accept/correct/dismiss feedback loop, revision-bound spatial scene graph with FTS5 search, and `get_canvas_scene` / `search_canvas_evidence` / `propose_scientific_object` tutor tools.
- Canvas reliability (Phase 5, 2026-11-22): spatial grid backfill so boards above 256 nodes keep every node in rect queries; diagram OCR reads stacked fraction labels (`F/N`); cloud OCR aborts at `CANVAS_OCR_TIMEOUT_MS` (default 30 s) and falls back.
- Learning activities with validated specifications and deterministic capability checks.

## Limits

- Document extraction is text-based; scanned PDFs are not OCR'd, and embedded images or charts are not interpreted. Search uses lexical FTS5 rather than embeddings. Canvas OCR is a separate feature.
- Retrieved excerpts and fact-check ratings are evidence to review, not proof. Canvas model interpretations remain uncertain and are not grading evidence.
- AI requests leave the machine when Groq or Google Fact Check is configured and used. Local services bind to loopback; multi-user authentication is not implemented.
- Some learning activity checkers support only the units and models stated in their specifications; unsupported cases return an unknown or unsupported result.
- Deep canvas analysis p95 is 15.3–17.8 s under provider variance against a 15 s target; the bound is external (Groq completions, Gemini OCR), recorded in `docs/decisions/2026-11-22-canvas-deep-latency.md`. The nested-logistic fixture reads at 0.875 token F1 (prime/≡/subscript marks), not exact.
- Gemini free tier is 15 requests/minute and can return 503; OpenRouter has no credits and is not a reliable primary. Provider failures degrade to partial analyses rather than wrong answers.

## Verification

Measured 2026-11-22 on `main` (commits `3fb4c6f..d380c9c`):

- `npx tsc -b`: pass.
- `npx vitest run`: 505 passed in 77 files.
- `npx playwright test` (full run, 46 tests, 13.8 m): 37 passed, 6 failed, 3 skipped; the disclosed re-run of the six flipped two to pass (`adaptive-learning`, `math-workspace` — parallel-load flake), leaving **4 persistent failures** (`direct-vector`, `tutor-math` — proven pre-existing in the 2026-11-19 `pw-full.log`; `workspace`, `quickdraw-ai` — disabled model-`select` in the uncommitted canvas-first UI port). All canvas scene, recognition, analysis, learning, credits, and integration specs pass. Full attribution: `docs/verification/2026-11-22-canvas-reliability.md`.
- `npm run benchmark:canvas`: 0 hard failures, 4/6 math boards exact, math F1 0.951, PhysAlign coverage 0.875–1.000, $0 provider cost, against the tracked `docs/verification/canvas-benchmark-baseline.json` (not updated).

CI (`.github/workflows/canvas.yml`) runs build and unit tests on every push. The provider-dependent benchmark and browser tests stay local behind `/canvas-verify`, because they need keys and a gitignored dataset.

[INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) records earlier, dated checks; use its results only for the commits named there.

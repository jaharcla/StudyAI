# StudyAI status

Workspace snapshot: integrated canvas branch `work/canvas-integration-2026-11-22` (combines `main` — canvas reliability phases 0–5 + review fixes + tutor-retrieval judgement — with `work/studyai-studio`: learning UI completion, Stripe support, free-demo — and the absorbed canvas-first shell/learning-UI port). November 22, 2026.

## Implemented

- Course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- LangGraphJS Tutor through CopilotKit, with Groq/Ollama provider selection, bounded context and provider requests, course-scoped document retrieval, and optional Google Fact Check searches.
- PDF, DOCX, PPTX, and UTF-8 TXT ingestion; page/slide-aware text chunks, FTS5 search, source references, and a PDF viewer.
- Canvas persistence with revision checks, scientific objects, math workspace, direct manipulation, Canvas analysis, and reviewable AI edit proposals.
- Canvas intelligence: deterministic capture, math and diagram OCR with a provider chain and daily budgets, local recognition plus a teach/accept/correct/dismiss feedback loop, revision-bound spatial scene graph with FTS5 search, and `get_canvas_scene` / `search_canvas_evidence` / `propose_scientific_object` tutor tools.
- Canvas reliability (Phase 5, 2026-11-22): spatial grid backfill so boards above 256 nodes keep every node in rect queries; diagram OCR reads stacked fraction labels (`F/N`); cloud OCR aborts at `CANVAS_OCR_TIMEOUT_MS` (default 30 s) and falls back.
- Learning activities with validated specifications and deterministic capability checks.
- Mind map scientific object: branch nodes and labeled edges as one placed, draggable, scene-indexed board object, authorable by the tutor through the existing approval-gated proposal path (2026-11-22). Coursework practice generation is being unified with the concurrent `author_board` design (ADR `docs/decisions/ADR-2026-11-22-mindmap-kind.md`).
- Lab-notebook canvas (2026-11-23, branch `work/lab-notebook-canvas`): dotted-paper viewport, transparent graph plot and borderless atoms, a Lewis second sidebar with literal bond-order line glyphs and a scrollable element list, icon-first radial atom actions, notebook-styled object editors preserving all existing controls.

## Limits

- Document extraction is text-based; scanned PDFs are not OCR'd, and embedded images or charts are not interpreted. Search uses lexical FTS5 rather than embeddings. Canvas OCR is a separate feature.
- Retrieved excerpts and fact-check ratings are evidence to review, not proof. Canvas model interpretations remain uncertain and are not grading evidence.
- AI requests leave the machine when Groq or Google Fact Check is configured and used. Local services bind to loopback; multi-user authentication is not implemented.
- Some learning activity checkers support only the units and models stated in their specifications; unsupported cases return an unknown or unsupported result.
- Deep canvas analysis p95 is 15.3–17.8 s under provider variance against a 15 s target; the bound is external (Groq completions, Gemini OCR), recorded in `docs/decisions/2026-11-22-canvas-deep-latency.md`. The nested-logistic fixture reads at 0.875 token F1 (prime/≡/subscript marks), not exact.
- Gemini free tier is 15 requests/minute and can return 503; OpenRouter has no credits and is not a reliable primary. Provider failures degrade to partial analyses rather than wrong answers.

## Verification

Measured 2026-11-22 on the integrated branch (commits `17448e8..6fadf78` plus docs):

- `tsc -b`: pass. Vitest: 79 files / 518 tests pass.
- Playwright: full 36/47 first pass was triaged to two root causes (shared `.bin` churn, `.env` deployment-URL mismatch) and fixed; the corrected targeted set runs 13/15 with only `document-intelligence:5` and `integration:4` persistent — both in the 2026-11-19 pre-existing failure record. Full chain: `docs/verification/2026-11-22-canvas-frontier.md`.
- `npm run benchmark:canvas`: 0 hard failures, 4/6 math boards exact, math F1 0.951, PhysAlign coverage 0.875–1.000, $0 provider cost, against the tracked `docs/verification/canvas-benchmark-baseline.json` (not updated).

CI (`.github/workflows/canvas.yml`) runs build and unit tests on every push. The provider-dependent benchmark and browser tests stay local behind `/canvas-verify`, because they need keys and a gitignored dataset.

[INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) records earlier, dated checks; use its results only for the commits named there.

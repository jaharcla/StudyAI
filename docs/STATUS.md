# StudyAI status

Workspace snapshot: `main` at `4961dbb` (2026-11-22 23:53 -05:00), 78 commits ahead of `origin/main`. This is the 2026-11-22 consolidated tree (`work/canvas-integration-2026-11-22` — canvas reliability phases 0–5 + review fixes + tutor-retrieval judgement — merged with `work/studyai-studio`: learning UI completion, Stripe support, free-demo, and the absorbed canvas-first shell/learning-UI port) plus the post-consolidation alignment work: the rescued physics/FBD Phase 2 (`cc3226c`) and the `author_board` single-verb authoring path (`6049227`, `efd377e`, `c5eeb7c`, `a89ca15`, `4961dbb`).

## Implemented

- Course and lesson workspace with notes, documents, adaptive review, and a lesson-scoped scientific canvas.
- LangGraphJS Tutor through CopilotKit, with Groq/Ollama provider selection, bounded context and provider requests, course-scoped document retrieval, and optional Google Fact Check searches.
- PDF, DOCX, PPTX, and UTF-8 TXT ingestion; page/slide-aware text chunks, FTS5 search, source references, and a PDF viewer.
- Canvas persistence with revision checks, scientific objects, math workspace, direct manipulation, Canvas analysis, and reviewable AI edit proposals.
- Canvas intelligence: deterministic capture, math and diagram OCR with a provider chain and daily budgets, local recognition plus a teach/accept/correct/dismiss feedback loop, revision-bound spatial scene graph with FTS5 search, and `get_canvas_scene` / `search_canvas_evidence` / `propose_scientific_object` tutor tools.
- Canvas reliability (Phase 5, 2026-11-22): spatial grid backfill so boards above 256 nodes keep every node in rect queries; diagram OCR reads stacked fraction labels (`F/N`); cloud OCR aborts at `CANVAS_OCR_TIMEOUT_MS` (default 30 s) and falls back.
- Learning activities with validated specifications and deterministic capability checks.
- Mind map scientific object: branch nodes and labeled edges as one placed, draggable, scene-indexed board object, authorable by the tutor through the existing approval-gated proposal path (2026-11-22). Coursework practice generation now goes through `author_board` below (ADR `docs/decisions/ADR-2026-11-22-mindmap-kind.md`).
- Physics/FBD scene mechanics (Phase 2, rescued in `cc3226c`): deterministic rule diagnostics inside the single scene authority — incline geometry, normal perpendicularity, friction parallelism, force balance — surfaced through `get_canvas_scene` / `search_canvas_evidence`, with an interactive force editor and `tests/e2e/canvas-physics-fbd.spec.ts`.
- `author_board` authoring verb (`6049227` … `4961dbb`, ADR `docs/decisions/ADR-2026-11-22-author-board-verb.md`): one `ArtifactBrief` compiles into a layout-planned, citation-contained proposal applied in one `postDocument` transaction (one revision bump, one undo step, one review dialog). Generated content is labelled unverified, answers stay behind the existing reveal toggle, the model supplies no coordinates, and tutor keyword routing remains bound to `author_board` (`4961dbb`).
- Lab-notebook canvas (2026-11-23, branch `work/lab-notebook-canvas`): dotted-paper viewport, transparent graph plot and borderless atoms, a Lewis second sidebar with literal bond-order line glyphs and a scrollable element list, icon-first radial atom actions, notebook-styled object editors preserving all existing controls.

## Next big step (planned, not built)

Artifact Intelligence System — extends the shipped `author_board` verb into a compositional, deterministically validated, claim-grounded artifact-construction environment. Design: `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`; task plan: `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`. Phase 0 (fresh-worktree baseline + boundary ADR) comes first; no product code has changed for this initiative. `docs/next.md` is the coordination authority.

## Limits

- Document extraction is text-based; scanned PDFs are not OCR'd, and embedded images or charts are not interpreted. Search uses lexical FTS5 rather than embeddings. Canvas OCR is a separate feature.
- Retrieved excerpts and fact-check ratings are evidence to review, not proof. Canvas model interpretations remain uncertain and are not grading evidence.
- AI requests leave the machine when Groq or Google Fact Check is configured and used. Local services bind to loopback; multi-user authentication is not implemented.
- Some learning activity checkers support only the units and models stated in their specifications; unsupported cases return an unknown or unsupported result.
- Deep canvas analysis p95 is 15.3–17.8 s under provider variance against a 15 s target; the bound is external (Groq completions, Gemini OCR), recorded in `docs/decisions/2026-11-22-canvas-deep-latency.md`. The nested-logistic fixture reads at 0.875 token F1 (prime/≡/subscript marks), not exact.
- Gemini free tier is 15 requests/minute and can return 503; OpenRouter has no credits and is not a reliable primary. Provider failures degrade to partial analyses rather than wrong answers.
- Rescued Phase 2 debt (tracked in `docs/next.md`): duplicate solver modules (`server/canvas-intelligence/scene/physics-rules.ts` and the `src/canvas/physics.ts` superset — keep the latter and re-point `scene/build.ts`), one `as any` in `scene/build.ts`'s physics call, and no `ADR-2026-11-22-physics-rules.md` for the `PhysicsIssueCode` vocabulary yet. The UI slider stage beyond `ForceVectorEditor` is still open.
- `author_board` authors whole objects only; per-node editing of generated artifacts is not implemented. No fresh full-gate verification run is recorded for the post-consolidation commits — see Verification below.

## Verification

Last full-gate measurement: 2026-11-22 on the integrated branch (commits `17448e8..6fadf78` plus docs). The numbers below are that dated baseline, not a freshly measured gate for `4961dbb`:

- `tsc -b`: pass. Vitest: 79 files / 518 tests pass.
- Playwright: full 36/47 first pass was triaged to two root causes (shared `.bin` churn, `.env` deployment-URL mismatch) and fixed; the corrected targeted set runs 13/15 with only `document-intelligence:5` and `integration:4` persistent — both in the 2026-11-19 pre-existing failure record. Full chain: `docs/verification/2026-11-22-canvas-frontier.md`.
- `npm run benchmark:canvas`: 0 hard failures, 4/6 math boards exact, math F1 0.951, PhysAlign coverage 0.875–1.000, $0 provider cost, against the tracked `docs/verification/canvas-benchmark-baseline.json` (not updated).

CI (`.github/workflows/canvas.yml`) runs build and unit tests on every push. The provider-dependent benchmark and browser tests stay local behind `/canvas-verify`, because they need keys and a gitignored dataset.

Commits after `94820b3` are not covered by a new `docs/verification/` record. `docs/next.md` records `tsc` 0, Vitest 549/549 and a green `tests/e2e/canvas-physics-fbd.spec.ts` for the rescued Phase 2 tree at `cc3226c`; the `author_board` commits added unit and browser specs but have no quoted full-gate numbers here. Run `/canvas-verify` before treating `4961dbb` as re-verified.

[INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) records earlier, dated checks; use its results only for the commits named there.

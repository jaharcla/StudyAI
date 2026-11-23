# Next steps — coordination ground truth (2026-11-22, ~23:30)

This page is the handoff for agents starting after the 2026-11-22 consolidation. An alignment plan circulated earlier was baselined on `main` at `d380c9c`; that tree is superseded. **Current `main` = `94820b3`** (and `work/studyai-studio` is at the same commit; `work/canvas-integration-2026-11-22` at `5ab5abb` is the reconciliation history).

## Already done — do not rebuild

- **Mindmap scientific object kind** (the "Phase 4.1 queued" item): shipped in `4b9eb75` + `6fadf78` — model variant + caps (≤12 nodes/≤16 edges), validation, registry tool, scene evidence (labels in `summaryOf`), `SceneGlyph` SVG rendering, browser spec `tests/e2e/canvas-mindmap.spec.ts`, committed fixture `tests/fixtures/mindmap-board.json`, ADR `docs/decisions/ADR-2026-11-22-mindmap-kind.md`. Whole-object move/inspect only; per-node editing is the open extension.
- **Canvas reliability Phase 5** (`docs/superpowers/plans/2026-11-22-canvas-reliability.md`): spatial-grid recall fix `7c29d78`; diagram `F/N` reading `fcbc3a1` (PhysAlign coverage 0.875→1.000); cloud-OCR timeout `CANVAS_OCR_TIMEOUT_MS` `d380c9c` + ADR `2026-11-22-canvas-deep-latency.md` (deep p95 now 15.3–17.8 s; 15 s target = accepted external limit; nested-logistic residual = prime/≡/σ-subscript, 0.875, not exact).
- **Practice generation ownership**: the partner ruled that coursework-question generation onto the canvas belongs to the `author_board` compound-verb design (`docs/superpowers/plans/2026-11-22-adaptive-canvas-authoring.md`), not to the superseded `draftPractice` route (see the Task-3 ruling in `docs/superpowers/plans/2026-11-22-canvas-frontier.md`). The alignment plan's Phase 3.3 `propose_interactive_exercise` must not open a second authoring path — extend `author_board`, keeping: citations mandatory against retrieved chunks, count 1–8 validated, generated content labelled unverified, answers hidden until checked, one approval transaction, ≤2 tool calls normal.
- **Tutor-retrieval judgement** (`022b4ec`, ADR `ADR-2026-11-22-tutor-retrieval-judgement.md`): the canvas-questions regex veto is deleted; relevance is the model's call. Course grounding measurement harness exists (`scripts/benchmark-canvas-grounding.ts`, `tests/fixtures/canvas-course-grounding.ts`).
- **Learning UI + canvas-first shell + Stripe/hosted + studio scaffold** all merged: flashcard review, question authoring, reveal toggle, "Add to review deck", StudyStage modes, credits/FreeKeyGuide/settings union App, `server/studio` + `src/studio` scaffold (see `docs/STUDIO_HANDOFF.md`).

## What is genuinely open (from the alignment plan)

Phase 1 (in-app BYOK manager, optional local embeddings — note `ADR-2026-11-18-spatial-canvas-scene.md` keeps the embeddings gate closed *on measured evidence*; re-open only with new misses). Phase 2 physics solver (`server/canvas-intelligence/scene/physics-rules.ts` fits the existing scene authority — do not create a third interpretation path), parameter-linked vectors, math-workspace step interactivity, reaction-arrow semantics. Phase 4.2 misconception→BKT loop. Phase 5 pen UX and layout fluidity. The grounding plan's own owed items (its `npm run verify` / `benchmark:canvas` close-out, `detect_changes`) are still open on top of the merged tree.

## Verification baseline on 94820b3

- `tsc -b` exit 0 · Vitest **81 files / 543 tests** · Playwright **43 passed / 2 failed / 3 skipped** — the two failures are pre-existing live-tutor-citation flakes (`document-intelligence.spec.ts:5`, `integration.spec.ts:4`; also present in the 2026-11-19 `pw-full.log`). Do not count them as your regressions; do not "fix" them by weakening assertions.
- Canvas gate (from Plan 1): 0 hard failures, 4/6 math exact, F1 0.951, PhysAlign 0.875–1.000, $0 — baseline JSON untouched.
- Full trail: `docs/verification/2026-11-22-canvas-reliability.md`, `docs/verification/2026-11-22-canvas-frontier.md`.

## Environment notes (learned the hard way today)

- Shared `node_modules/.bin` churns when sessions run npm — if shims vanish, use `node node_modules/vitest/vitest.mjs`, `node node_modules/typescript/bin/tsc`, `node node_modules/@playwright/test/cli.js test …` or PATH shims in `%LOCALAPPDATA%\Temp\opencode\shims`. Never `npm install` casually.
- E2E on a second stack: isolated ports + matching `LANGGRAPH_DEPLOYMENT_URL` (a stale :8133 in `.env` silently starves every tutor spec; pattern: `WEB_PORT=5313 RUNTIME_PORT=8243 DATA_PORT=8244 AGENT_PORT=8163`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8163`).
- `docs/VISION.md` was rewritten by the workspace owner and committed as found (`94820b3`); it is the authority the alignment plan scores against.
- Left untracked deliberately: `output/`, `tmp_q.sql` (junk from prior sessions).
- Precedence reminders: one mutation authority (`server/canvas-persistence`), one scene authority (`server/canvas-intelligence/scene/`), one direct-manipulation authority (`server/canvas-analysis/`); new kinds need all six parts; gates and baselines only move with an explicit request.

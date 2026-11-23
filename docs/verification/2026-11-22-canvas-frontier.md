# Canvas Frontier verification — 2026-11-22 (mindmap scope)

Executed on branch `work/canvas-integration-2026-11-22` (worktree `canvas-integration`), which integrates `main` (canvas-reliability plan + review fixes + concurrent agent's retrieval work) with `work/studyai-studio` and the absorbed in-progress canvas-first/learning-UI work.

## Scope note (partner ruling, recorded in the plan and ADR)

Task 3 (coursework practice generation) is **not built here** — superseded by the concurrent `adaptive-canvas-authoring` design. This record covers the mind map kind and the merge integration.

## Mindmap implementation

- Kind: `src/canvas/model.ts` — `mindmap` variant with `MindmapNode`/`MindmapEdge`, caps ≤12 nodes / ≤16 edges / ≤120-char labels / ≤200-char title, unique node ids, edge endpoints exist, no self-edges, finite coords within ±1000.
- Registry palette (`Learning` group), `scientificObjectKinds` in `src/canvas/tutor.ts`, scene evidence (`summaryOf` folds labels in `server/canvas-intelligence/scene/build.ts`), `objectTitle`/glyph in `src/canvas/SceneGlyph.tsx`, dark-mode styles in `src/overrides.css`.
- Fixture: `tests/fixtures/mindmap-board.json` (committed ground truth, version 1).
- `CanvasDocument.version` unchanged; legacy boards parse (pinned by test).
- Proposal authoring through the unchanged `proposeCanvasObject`/`applyCanvasObjectProposal` path — pinned by unit test with a 4-node Fractions map.

_(fill: e2e result line)_ → Browser spec `tests/e2e/canvas-mindmap.spec.ts` **passed** (16.3 s, isolated stack): palette placement, three node glyphs (`mindmap-node-n0/n1/n2`), two edge lines, whole-object drag (>30 px), "All changes saved", persisted `mindmap` object in the saved document, and labels after reload. First run had failed only on a spec-side lesson-id mistake (all UI assertions had already passed); implementation unchanged.


## Merge integration evidence

- `tsc -b` exit 0; Vitest full suite: **517 passed** (514 merge baseline + 3 mindmap) at Task 1; 518 with the proposal pin at Task 2.
- Absorption conflicts resolved: `CanvasStudio.tsx` keeps both the studio `propose_molecule` frontend tool and the in-progress "Add to review deck" wiring; `App.tsx` resolved to the union version (canvas-first shell + credits/Stripe/FreeKeyGuide settings, per the canvas-first ADR); `main.tsx` ships the canvas-first app without the `?lab` switcher (per the same ADR; no e2e spec references `?lab`); `node_modules` and `hosted/node_modules` are junctions — nothing was installed from this worktree.
- Concurrent-agent precaution: `src/canvas/ai/canvas-context.ts` in the main tree carried a live one-line WIP edit (`shapeBounds` export) — **not** absorbed; it belongs to the other agent's Phase 1 and will arrive via their own commit. This worktree's version of that file was changed only by Task 1's type fix.

## Playwright on the integrated tree (full suite first, then targeted)

- Full suite (isolated ports, concurrent sessions active): 36 passed / 8 failed / 3 skipped. All 8 were triaged before acceptance (log `task-4-verify.log`): three root causes — (a) the shared `node_modules/.bin` was being churned by the concurrent session so `npm run dev` could not boot (`tsx`/`vite`/`langgraphjs` unresolvable); (b) the worktree `.env` copy still pointed `LANGGRAPH_DEPLOYMENT_URL` at port 8133 (another agent's stack) while the isolated agent ran on 8163, starving every tutor-reply spec; (c) one unguarded `sidebar-scrim` click in `flashcard-review.spec.ts` racing the canvas-first auto-close — fixed with the guard pattern the rest of the suite already uses.
- After (a)–(c) were fixed with PATH shims, a corrected local `.env`, and the spec guard: `canvas-analysis` 4/4, `flashcard-review` ✓, and the six-spec targeted re-run went **9/11** (`task-4-rerun8b.log`, `task-4-rerun6c.log`).
- Persistent two: `document-intelligence.spec.ts:5` (5 s `Page 1 of 1` viewer race after a successful citation) and `integration.spec.ts:4` (citation link absent in 180 s). Both test directory names appear in the preserved 2026-11-19 `pw-full.log` failure set — pre-existing live-tutor/paperwork flakiness, not merge regressions.
- `tests/e2e/canvas-mindmap.spec.ts` passed as part of the suite and targeted (16.3 s).

## Final consolidated tree (`fc7de5b` + studio merge, 48 browser tests)

Full suite: **42 passed / 3 failed / 3 skipped (7.1 m)** — the best e2e state recorded for this repo. The three (canvas-analysis mock race, `document-intelligence` 5 s viewer race, `integration` 180 s citation) were retried after a test-side fix giving the canvas-analysis mock a 2.5 s persistence-readiness loop (preserving its persistence assertion, replacing a `JSON.parse(undefined)` crash with an explicit failure). Retry: **canvas-analysis 4/4 pass; `document-intelligence:5` and `integration:4` persist** — the same two tests present in the 2026-11-19 `pw-full.log` failure set, both waiting on live tutor citations under shared free-tier budgets. Final standing: **43 passed / 2 failed / 3 skipped**, both failures pre-existing.


## Commands


- `node node_modules/typescript/bin/tsc -b` (no shims — `.bin` in the shared tree is churned by concurrent sessions)
- `node node_modules/vitest/vitest.mjs run`
- Playwright: isolated ports `WEB=5313 RUNTIME=8243 DATA=8244 AGENT=8163` to avoid `reuseExistingServer` attaching to another session's stack.

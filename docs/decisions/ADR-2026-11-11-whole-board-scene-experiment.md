# ADR: Isolated whole-board scene-parser experiment

Status: Accepted for experiment only
Date: 2026-11-11

## Context

StudyAI already has canvas snapshot normalization, deterministic QuickDraw region grouping and crop export, persisted-board revision validation, Groq OCR/inference adapters, and Playwright/Vitest. Analyze Board calls `saveNow()` in the UI, so the experiment must not exercise that UI action against the source database. QuickDraw rendering and the scientific SVG layer are separate.

The source row is the preserved board `preserved-quickdraw-sample` at revision 95 in `.worktrees/canvas-understanding-lab/data/backups/canvas-inspector-current-20261108.sqlite`. Its stored document hash is `69e78fdf7e4adeebee4a3323cbf1593517568ad1e41af0660540d92919f90df5`, matching the preserved QuickDraw fixture. The root default database has no `canvases` table.

## Decision

- Read the source database with SQLite read-only mode and run the existing producer against an in-memory copy of the frozen row.
- Reuse `normalizeCanvasInput`, the current crop selector/export, `produceCanvasAnalysisForPersistedBoard`, `understandCanvas`, the configured Groq OCR model, Groq request configuration, and existing test dependencies.
- Extract the UI's private crop helper to `src/canvas/ocr-capture.ts` without changing selection, pixels, IDs, or transforms.
- Keep the experiment in `tests/experiments/whole-board-scene/` plus a separately invoked Playwright spec. Do not extend `server/canvas-intelligence/benchmark.ts`, dataset-to-canvas benchmark tooling, the production Analyze Board API, `CanvasAnalysisResult`, or Tutor projection.
- Implement one common strict proposal schema and one isolated multimodal Groq adapter for conditions B–D. Use the existing configured Groq OCR vision model for all three; do not change provider or model settings. Condition A remains the unmodified production baseline.
- Generate candidates from saved ink with existing grouping code and derive feature coordinates only from saved points. Reject model-authored coordinates/confidence/timestamps/provenance and reject source references that do not resolve to the frozen source map.
- Enforce a run-wide cap of eight attempted Groq requests, with no retry or fallback. Record provider usage when returned. Raw responses and images are written only to ignored test-results artifacts.
- Gold annotations stay in a separate local fixture and never enter model input. The methane board is a one-board feasibility experiment; it is not a readiness benchmark.

## Alternatives considered

- **Use the Analyze Board UI:** rejected for the source row because it saves before analysis and previously incremented the revision.
- **Use the root database:** rejected because it has no `canvases` table or target row.
- **Build a new scene authority, endpoint, or recognizer integration:** deferred; this experiment tests whether visual input, original ink, and geometry features add value before production architecture changes.
- **Add DECIMER, MolScribe, MyScript, or another dependency:** deferred; no dependency is needed to answer this feasibility question.

## Consequences and limits

- No new package or external code is incorporated, so there is no new license obligation. Existing application dependency licenses remain governed by the repository lockfile and dependency records.
- The source row and database remain read-only. The in-memory producer copy validates the real persisted-board path without UI writes.
- B–D are matched where Groq supports the same model/settings/schema. Provider-side nondeterminism, token accounting/caching, and differences in payload size remain observable limits.
- The saved board mixes freehand ink with native QuickDraw objects and ScientificLayer objects. Freehand stroke grounding metrics apply only to actual draw/highlight ink. Native text/line object recognition and relation interpretation are reported separately.
- No result is authoritative, sent to Tutor, or used to edit the canvas.
- A successful or failed result on this one board cannot establish performance on freehand chemistry, force diagrams, measurements, equations, or ambiguous mixed scenes.

## Verification

- Baseline Vitest: 33 files / 226 tests passed; `tests/learning-api.test.ts` failed because sandbox networking denied its loopback connection (`EACCES 127.0.0.1`).
- Add deterministic unit tests for proposal validation, candidate/reference mapping, independent grouping scores, and the eight-request budget.
- Run capture/renderer gate before any Groq call. Run all four conditions only when the exact scene image is legible and aligned.
- After implementation, rerun canvas and Tutor regressions and record the full A–D run artifacts and original-row immutability check.

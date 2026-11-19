# ADR: Derived spatial canvas scene and revision-bound retrieval

Status: accepted and implemented. Core geometry scene graph, spatial index, SQLite graph store + FTS5 search, scene API, recognition-candidate nodes, analysis-evidence merge, bounded scene context, `get_canvas_scene` / `search_canvas_evidence` tools, current-course multi-board retrieval, and browser e2e coverage are in place. The interaction/learning loop is covered by `ADR-2026-11-18-canvas-recognition-feedback.md`; remaining handoff items are Phase 4+ (cost operations, disclosure, performance).

## Decision

Add a derived, revision-bound `CanvasSceneGraph` over persisted Quickdraw snapshots, scientific objects, validated OCR, and validated model evidence. The graph is an artifact, never a second source of truth and never part of `CanvasDocument`. Rebuild it from the snapshot plus the optional `CanvasAnalysisResult`; stale or cross-scope graphs must not be served.

Use a native uniform spatial grid behind a narrow index interface. Start with linear scan under 256 nodes and an overflow list for nodes covering more than 256 cells; benchmark 10,000 nodes and swap in an R-tree only if the p95 target is missed. Do not add `rbush` for the initial implementation.

Persist graph JSON and searchable node text in SQLite. Use FTS5 with scope columns, active-revision resolution for current-course retrieval, and exact revision hashes for exact queries. Define a `CanvasSceneRetriever` interface so a future Chroma adapter is possible, but add no ChromaDB dependency now.

Ship a deterministic geometry baseline recognizer and a `CanvasRecognitionAdapter` boundary. Recognition candidates become bounded `recognition-candidate` nodes linked to their strokes by `recognizes` edges; adapter results replace baseline results for successful strokes, with baseline fallback on failure. No learned model is required for the product.

Expose `POST /api/canvases/:boardId/scene` and `POST /api/canvases/:boardId/scene/query`, and feed CopilotKit a bounded scene slice plus read-only `get_canvas_scene` and `search_canvas_evidence` tools. Keep `propose_canvas_action` as the only mutation path and keep its approval gate.

## Reuse and alternatives

- Reuse pinned `@quickdrawjs/core` 0.1.0 and `@quickdrawjs/react` 0.1.0 (MIT) for snapshot, `pageBounds`, and `exportImage`; `better-sqlite3` 12.4.1 (MIT) for SQLite/FTS5; `zod` 4.2.0 (MIT) for contracts; and `@copilotkit/react-core` / `@copilotkit/runtime` 1.85.0 (MIT) for tools and context. Add no dependency.
- Reuse existing `CanvasSpatialAssociationSchema`, OCR source regions, `CanvasEvidenceBundle`, `CanvasAnalysisResult`, revision checks, canvas persistence, and approval-gated actions. Do not create a second analysis or spatial authority.
- Reject `rbush`/R-tree for the first pass: the native grid has no dependency, has a bounded worst case, and sits behind an interface. Revisit only after the benchmark.
- Reject ChromaDB for the first pass: SQLite FTS5 is already present, local-first, revision-aware, and sufficient for node-text retrieval. A vector adapter needs a demonstrated capability gap and a new ADR.
- Reject a Python/FastAPI/ONNX service in the initial implementation: no model artifacts or evaluation data exist, and the adapter contract preserves that path without adding runtime surface.
- Reject a full semantic scene graph or a graph-derived source of truth: the graph is a rebuildable projection with explicit uncertainty, not a replacement for the canvas or the evidence pipeline.

## Current-course retrieval

Resolve current revisions in SQL, not in application loops: `canvas_scene_search` joins `canvas_scene_graphs` on `(board_id, revision_hash)` and `canvases` on `board_id`, keeping only rows where `canvases.revision = canvas_scene_graphs.revision` and the course matches. Older revisions stay indexed for exact-revision reads and rollback history, but never appear in course search. Results are grouped per board (`hits[]`) so node and edge IDs from different boards cannot be confused, and each hit carries its revision for stale checks. `search_canvas_evidence` keeps the board-scoped path when `boardId` is supplied and uses the course path when it is omitted; the course path does not build scenes on demand.

## Relationship to ADR-2026-11-11

This ADR preserves `ADR-2026-11-11-grounded-canvas-regions.md`: source-linked `exportImage` crops remain the OCR localization mechanism. It supersedes only the blanket deferral of a generalized scene graph, and only for the bounded derived scene described here.

## Limits

- Maximum 10,000 nodes, 30,000 edges, 5,000 captured ink records, and 512 retained points per stroke.
- Maximum 2,000 characters of text per node and 6,000 characters of scene context.
- Maximum 32 strokes per recognition batch, 2 candidates per stroke, 4,000 candidate nodes, and a 2,000 ms adapter timeout.
- OCR evidence carries region-level bounds, not item-level boxes. Do not invent item bounds; mark region-level provenance and uncertainty.
- Quickdraw has no timestamps. Point order and arc length are valid features; elapsed-time claims are not.
- Pressure is retained only when present. Missing or all-`0.5` pressure must remain visible.
- Current-course retrieval searches active revisions only; rollback and superseded revisions are excluded. Exact queries return `409` on stale revisions.
- Model and OCR assertions remain `unconfirmed`; they cannot mutate the canvas or become verified labels without user approval.
- The scene graph is not written to `CanvasDocument` and cannot bypass save revision checks.

## Verification

Add deterministic unit tests for capture, pressure, normalization, grid queries, IDs, caps, analysis mapping, and retrieval scopes. Add integration tests for stale revisions, rollback exclusion, adapter timeout, invalid output, and `indexStatus: "failed"`. Add browser coverage for scene context and the unchanged approval gate. Run `npm test`, `npm run build`, and `npm run test:e2e` when supported. Benchmark 10,000-node queries at p95 under 5 ms and 2,000-stroke graph builds. Confirm no new runtime dependency.

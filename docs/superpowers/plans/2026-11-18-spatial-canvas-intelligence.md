# Spatial Canvas Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, revision-bound spatial scene graph for every persisted canvas, expose bounded scene context and evidence search to CopilotKit, and preserve the existing proposal-approval path and local-first architecture.

**Architecture:** Build a native TypeScript capture, normalization, grid-index, scene-graph, recognition-adapter, analysis-merge, SQLite/FTS5 retrieval, and HTTP layer. The graph is derived from the persisted canvas and never written into `CanvasDocument`. CopilotKit receives only a bounded scene slice; raw Quickdraw and scientific IDs remain the only proposal targets.

**Tech Stack:** TypeScript, Zod 4, React 19, CopilotKit 1.85.0, Quickdraw 0.1.0, better-sqlite3 12.4.1, SQLite FTS5, Vitest 3.2.4, Playwright 1.56.1. No dependency changes.

**Spec:** `docs/superpowers/specs/2026-11-18-spatial-canvas-intelligence-design.md`; `docs/decisions/ADR-2026-11-18-spatial-canvas-scene.md`; preserve `docs/decisions/ADR-2026-11-11-grounded-canvas-regions.md`.

## Global Constraints

- Do not add Python, FastAPI, ChromaDB, PyTorch, ONNX Runtime, `rbush`, or any runtime dependency.
- All external input crosses a strict Zod boundary with finite numbers and fixed caps.
- Scene builds are derived artifacts. Never write a scene into `CanvasDocument`, and never let a scene-build failure roll back a canvas save or analysis.
- Canvas mutations remain proposal-only with explicit user approval. Scene IDs are read-only; proposals use raw Quickdraw/science IDs and are revalidated.
- Never send the full graph or raw `pts` arrays to CopilotKit. Scene context is capped at 6,000 characters; slices contain at most 24 nodes and 48 edges.
- Index only node text. Never index raw coordinates, point arrays, or image data. SQLite queries are parameterized; FTS input is sanitized like `searchDocuments`.
- Exact-revision queries never serve a stale or superseded graph. Current-course queries resolve the persisted active revision per board.
- Caps: 5,000 captured records, 512 retained stroke points, 10,000 scene nodes, 30,000 scene edges, 2,000 node-text characters, 64 source refs per node/edge, 20 retrieval nodes, 40 retrieval edges, 32 recognition strokes per batch, 2 recognition candidates per stroke, 4,000 candidate nodes, 2,000 ms adapter timeout.
- Do not touch `.worktrees`, commit databases, or alter unrelated user files. Run commands from the repository root.

## Review Focus

- Scene-present context: selected nodes and unresolved associations must dominate; no legacy `spatialRelationships` authority may remain; no raw points or full graph may leak.
- Scene build: stroke pressure, rotations, bounds conversion, sampling, candidate bounds, and node/edge caps must be deterministic and source-faithful.
- Analysis merge: region-level OCR bounds must never become invented item boxes; native/geometry restatements must not duplicate nodes; interpretations must not become graph facts.
- Retrieval: exact and current-course scopes must reject stale, rollback, and cross-course data; index failure must not erase the graph response.
- Tool security: `get_canvas_scene` and `search_canvas_evidence` must stay read-only, board/course scoped, bounded, and must return warnings and truncation state.

---

## File Structure

Create:

- `src/canvas/spatial/types.ts`: shared Zod contracts and constants; no Node-only imports.
- `src/canvas/spatial/identity.ts`: SHA-256/short-hash helpers and deterministic edge IDs; server-only.
- `src/canvas/spatial/normalize.ts`: bounds conversion, pressure parsing, sampling, features, trajectory, raster.
- `src/canvas/spatial/capture.ts`: persisted snapshot/scientific-object capture and stroke grouping.
- `src/canvas/spatial/index.ts`: `CanvasSpatialIndex` uniform-grid implementation.
- `src/canvas/spatial/graph.ts`: deterministic geometry graph, recognition merge, caps, validation.
- `src/canvas/spatial/analysis.ts`: validated `CanvasAnalysisResult` merge and analysis fingerprint.
- `src/canvas/spatial/slice.ts`: client-safe bounded graph slicing.
- `src/canvas/ai/scene-context.ts`: `buildCanvasSceneAIContext`.
- `src/canvas/ai/scene-tools.ts`: scene tool schemas, scene read/slice helper, evidence-search transport, scene build transport.
- `server/canvas-intelligence/recognition/adapter.ts`: adapter interface, mode selection, batching/timeout.
- `server/canvas-intelligence/recognition/baseline.ts`: deterministic geometry-only adapter.
- `server/canvas-intelligence/scene.ts`: scene build/search orchestration.
- `server/canvas-intelligence/scene-store.ts`: SQLite graph store, FTS5 retriever, revision lifecycle.
- `server/canvas-intelligence/scene-http.ts`: build, exact query, and current-course search endpoints.
- `scripts/benchmark-canvas-scene.ts`: 10,000-node grid benchmark.

Modify:

- `src/canvas/ai/canvas-bridge.ts`: optional scene context and the two new read-only tools.
- `server/agent.ts`: bind scene tool schemas and add scene trust instructions.
- `server/api.ts`: register `createCanvasSceneHandler`.
- `src/canvas/CanvasStudio.tsx`: refresh scene after save/analysis; clear stale graphs; pass graph to bridge.
- `docs/superpowers/specs/2026-11-18-spatial-canvas-intelligence-design.md`: set status to accepted.

Tests: `tests/canvas-scene-contract.test.ts`, `tests/canvas-scene-capture.test.ts`, `tests/canvas-scene-index.test.ts`, `tests/canvas-scene-recognition.test.ts`, `tests/canvas-scene-graph.test.ts`, `tests/canvas-scene-analysis.test.ts`, `tests/canvas-scene-store.test.ts`, `tests/canvas-scene-service.test.ts`, `tests/canvas-scene-http.test.ts`, `tests/canvas-scene-context.test.ts`, `tests/canvas-scene-tools.test.ts`, `tests/e2e/canvas-scene.spec.ts`; update `tests/tutor-integration.test.ts`.

---

### Task 1: Contracts and deterministic identity

**Files:** Create `src/canvas/spatial/types.ts`, `src/canvas/spatial/identity.ts`, `tests/canvas-scene-contract.test.ts`; modify the design status.

**Interfaces:** `types.ts` exports `CANVAS_SCENE_SCHEMA_VERSION = 1`, `CANVAS_SCENE_MAX_NODES = 10_000`, `CANVAS_SCENE_MAX_EDGES = 30_000`, `CANVAS_SCENE_MAX_CONTEXT_CHARS = 6_000`, `CanvasSceneRefSchema`, `CanvasSceneBoundsSchema`, `CanvasScenePointSchema`, `CanvasSceneStrokeSchema`, `CanvasSceneNodeSchema`, `CanvasSceneEdgeSchema`, `CanvasSceneGraphSchema`, and their inferred types. `identity.ts` exports `sha256Hex(value: string): string`, `shortHash(value: string): string` (first 16 lowercase hex), and `sceneEdgeId(from: string, kind: CanvasSceneEdge["kind"], to: string, basis: CanvasSceneEdge["basis"]): string` returning `e:<shortHash(from|kind|to|basis)>`.

- [ ] Set the design document status to `Accepted`.
- [ ] Write `tests/canvas-scene-contract.test.ts`: parse a complete valid graph; reject unknown node kinds, unknown keys, non-finite bounds, negative dimensions, oversized node/edge arrays, and invalid edge references; assert `sceneEdgeId` is stable and matches `^e:[a-f0-9]{16}$`; assert `sha256Hex` is independent of object key order by hashing `stableJson` output.
- [ ] Run `npx vitest run tests/canvas-scene-contract.test.ts`; expected: failure because the modules do not exist.
- [ ] Implement the schemas exactly as design §8.1-§8.5 using `z.strictObject`. Keep every identifier bounded where the design bounds it. Do not import Node APIs from `types.ts`.
- [ ] Run `npx vitest run tests/canvas-scene-contract.test.ts`; expected: pass.
- [ ] Commit with `feat(canvas): add spatial scene contracts`.

### Task 2: Capture, normalization, and stroke features

**Files:** Create `src/canvas/spatial/normalize.ts`, `src/canvas/spatial/capture.ts`, `tests/canvas-scene-capture.test.ts`.

**Interfaces:** `capture.ts` exports `captureCanvasScene(input: { boardId: string; snapshot: unknown; scientificObjects?: readonly unknown[] }): CanvasSceneCapture`, where `CanvasSceneCapture = { nodes: CanvasSceneNode[]; strokes: CanvasSceneStroke[]; groups: CanvasSceneGroup[]; warnings: string[]; truncated: boolean }` and `CanvasSceneGroup = { id: string; sourceIds: string[]; bounds: CanvasSceneBounds }`. `normalize.ts` exports `toSceneBounds(bounds: { x: number; y: number; width: number; height: number }): CanvasSceneBounds`, `strokeFeatures(points: readonly CanvasScenePoint[]): CanvasSceneStroke["features"]`, `sampleStroke(points, maxPoints = 512)`, `resampleTrajectory(stroke, count = 128): number[][]`, and `rasterizeStroke(stroke, size = 96): { width: number; height: number; grayscaleBase64: string }`.

- [ ] Implement capture through the existing `normalizeCanvasInput({ boardId, snapshot, scientificObjects, selectedIds: [] })`, not a parallel snapshot parser. Reuse `groupCanvasInkStrokes` from `src/canvas/ocr-regions.ts`.
- [ ] Map `draw`/`highlight` to `stroke` nodes with `q:<recordId>`; map all other Quickdraw records to `native-object`; map scientific objects to `s:<objectId>`; map groups to `g:<shortHash(sorted source IDs)>`.
- [ ] Convert Quickdraw `{ x, y, w, h }` to scene `{ x, y, width, height }` once at this boundary. Reject negative/non-finite dimensions. A 0-size valid text/point record remains valid.
- [ ] Cap captured records at 5,000 after sorting by ID; set `truncated` and add a warning when records are omitted. Cap group/source-region `sourceRefs` at 64 sorted IDs, retaining full membership in `contains` edges and warning when capped.
- [ ] Pressure: missing/non-finite third value becomes `null`; finite values outside `[0,1]` are dropped to `null` with a warning, never clamped; non-finite `x`/`y` rejects the whole stroke record with a warning; if every finite reading is `0.5`, `pressure.available` is false and mean/min/max are null; otherwise compute stats from all finite readings including `0.5` values.
- [ ] Sampling: raw points up to 512 with `sampling: "none"`; above 512 apply deterministic RDP with epsilon `1.5` world units, then uniform sampling to 512 and set `sampling: "rdp"`; preserve first/last points. Bounds and `pointCount` always come from raw points.
- [ ] Features: path length by Euclidean segment sum; aspect `max(width,height) / max(min(width,height),1)`; orientation from the covariance principal axis in radians (`0` when degenerate, normalized to `[-PI/2, PI/2]`); turn count for consecutive triples whose direction cosine is `< 0.8`; closed when endpoint distance `<= max(4, 0.08 * pathLength)`; endpoint distance as Euclidean.
- [ ] Rasterization is a deterministic 96 x 96 8-bit grayscale image, aspect-preserved and centered by bounds, encoded as base64 of exactly 9,216 bytes. Trajectory is 128 points with `[xNorm,yNorm,dx,dy,arc,curvature,pressureMask,pressureValue]`, no timestamp channel.
- [ ] Write tests for: mixed native/text/arrow/science/stroke capture and bounds conversion; rotated records; missing and all-`0.5` pressure; out-of-range pressure; invalid stroke rejection; simple-feature exact values; closed shape; RDP/sampling endpoint preservation; deterministic raster/resample output; group `contains` coverage; scientific text truncation.
- [ ] Run `npx vitest run tests/canvas-scene-capture.test.ts`; expected: fail, then pass after implementation.
- [ ] Commit with `feat(canvas): capture normalized spatial strokes`.

### Task 3: Uniform-grid spatial index

**Files:** Create `src/canvas/spatial/index.ts`, `scripts/benchmark-canvas-scene.ts`, `tests/canvas-scene-index.test.ts`.

**Interfaces:** Export the design §10.1 `CanvasSpatialIndex`, `createCanvasSpatialIndex(options?: { cellSize?: number; linearThreshold?: number; maxCellsPerNode?: number }): CanvasSpatialIndex`, and `GridCanvasSpatialIndex`.

- [ ] Defaults: cell size 128, accepted range 64-256; linear scan below 256 nodes; overflow above 256 cells per node.
- [ ] Insert each node into every intersected cell. Deduplicate query results by node ID. Query results sort by stable ID. Nearest distance is distance to bounds (zero inside). Nearest ties sort by distance then ID.
- [ ] Write tests for intersecting queries, multi-cell deduplication, zero-size bounds, overflow nodes, linear-scan parity, removal, inside-bounds distance, and nearest tie-breaking.
- [ ] Add `scripts/benchmark-canvas-scene.ts` building 10,000 synthetic nodes and running 1,000 mixed queries. Print node count, build time, and p95 query time; do not fail the process on timing.
- [ ] Run `npx vitest run tests/canvas-scene-index.test.ts`; expected: fail, then pass. Run `npx tsx scripts/benchmark-canvas-scene.ts` and record the p95 measurement.
- [ ] Commit with `feat(canvas): add uniform-grid scene index`.

### Task 4: Recognition adapter and deterministic baseline

**Files:** Create `server/canvas-intelligence/recognition/adapter.ts`, `server/canvas-intelligence/recognition/baseline.ts`, `tests/canvas-scene-recognition.test.ts`.

**Interfaces:** Export the design §8.6 `CanvasRecognitionInput`, `CanvasRecognitionCandidate`, `CanvasRecognitionResult`, `CanvasRecognitionAdapter`, `CanvasRecognitionMode`. `adapter.ts` exports `createRecognitionAdapter(options: { mode: CanvasRecognitionMode; adapter?: CanvasRecognitionAdapter }): { adapter: CanvasRecognitionAdapter | null; warnings: string[] }` and `recognizeStrokes(adapter, inputs, options?: { signal?: AbortSignal; timeoutMs?: number; batchSize?: number }): Promise<{ results: CanvasRecognitionResult[]; warnings: string[] }>`. `baseline.ts` exports `BaselineCanvasRecognitionAdapter` with id `geometry-baseline` and version `1`.

- [ ] Baseline rules are deterministic: line-like (`aspect >= 4`, `turnCount <= 1`) returns `line`/`underline`; closed (`closed && aspect <= 3`) returns `closed shape`/`circle`; compact (`pathLength <= 8` and max dimension `<= 8`) returns `dot`; branched (`turnCount >= 3 && !closed`) returns `cross`; otherwise `stroke`. At most two candidates; all confidence values are `>= 0.45`; `uncertain: true` with reason `Geometry-only symbol candidate.`; never transcribe text.
- [ ] Batch size is 32 and adapter timeout is 2,000 ms. A timeout/error yields a warning and no result for that batch; orchestration falls back to baseline.
- [ ] Write tests for obvious line/closed/dot/branched/unknown strokes, confidence bounds, candidate cap, no text transcription, deterministic repeats, invalid adapter output, and batch-size enforcement. Include a fake adapter that times out and one that returns invalid candidates.
- [ ] Run `npx vitest run tests/canvas-scene-recognition.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): add baseline scene recognition`.

### Task 5: Deterministic geometry scene graph

**Files:** Create `src/canvas/spatial/graph.ts`, `tests/canvas-scene-graph.test.ts`.

**Interfaces:** Export `buildGeometryScene(input: { scope: { boardId: string; courseId: string; lessonId: string }; revision: number; revisionHash: string; snapshotHash: string; capture: CanvasSceneCapture; recognition?: { mode: CanvasScene["recognition"]["mode"]; adapterId: string | null; adapterVersion: string | null; candidates: Array<{ strokeSceneId: string; label: string; kind: CanvasRecognitionCandidate["kind"]; confidence: number; alternatives: string[]; uncertaintyReasons: string[] }> }; builtAt: string }): CanvasSceneGraph` and `finalizeCanvasScene(graph: CanvasSceneGraph): CanvasSceneGraph`.

- [ ] Create source nodes from capture. Direct source nodes have `sourceRefs: []` because `ref` is the source; group nodes retain up to 64 sorted source refs. Set `recordType`, text, origin, verification status, confidence, bounds basis, and uncertainty reasons exactly as design §8.3.
- [ ] Create `contains` edges from groups to every member stroke. Create scientific `relationship` edges from `ScientificObject.kind === "relationship"` when both endpoint scene nodes exist; otherwise add a warning.
- [ ] Insert only source nodes (not recognition candidates) into `createCanvasSpatialIndex()`. Emit geometric caps after deterministic sorting: `overlaps` at most 8 per node; `near` at most 3 per node within 96 world units; directional `left-of`/`right-of`/`above`/`below` only for selected near pairs and at most 3 per node; `aligned-with` at most 2 per node within 96 units and 8 units axis tolerance.
- [ ] Symmetric edge pairs use lexicographically smaller node ID as `from`. `near` uses bounds-gap distance. Directional kind is derived from the relative centers of the chosen pair. Ties sort by distance then `from`/`to` IDs before caps are applied.
- [ ] Recognition candidates become `c:<strokeSceneId>:<adapterId>:<rank>` nodes with `ref: { scope: "scene", id: <candidateId> }`, stroke bounds, `boundsBasis: "derived"`, `geometry: null`, `text` label, `recordType` kind, origin `geometry` for baseline or `model` for adapter, `verificationStatus: "unconfirmed"`. Add one `recognizes` edge per candidate. Candidate alternatives are appended to bounded `uncertaintyReasons` as `Alternatives: ...`, not separate nodes.
- [ ] `finalizeCanvasScene` truncates node text to 2,000 characters with a `Text truncated for scene context.` reason; sorts nodes and edges by ID; enforces 10,000 nodes and 30,000 edges; drops incident edges for dropped nodes; deduplicates warnings to the first 64; ORs `truncated`; validates with `CanvasSceneGraphSchema`.
- [ ] Determinism: repeated builds with the same inputs except `builtAt` must produce identical nodes, edges, warnings, recognition metadata, and IDs. `analysisFingerprint` is `null` in this task.
- [ ] Write tests for node IDs/refs, group contains, overlapping/near/directional/aligned caps, recognition-only `recognizes` topology, source-ref cap, text truncation, graph caps, relationship edges, Zod validation, and deterministic repeats.
- [ ] Run `npx vitest run tests/canvas-scene-graph.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): build deterministic scene graphs`.

### Task 6: Analysis evidence merge

**Files:** Create `src/canvas/spatial/analysis.ts`, `tests/canvas-scene-analysis.test.ts`.

**Interfaces:** Export `mergeCanvasAnalysisIntoScene(graph: CanvasSceneGraph, capture: CanvasSceneCapture, analysis: CanvasAnalysisResult): CanvasSceneGraph` and `canvasAnalysisFingerprint(analysis: CanvasAnalysisResult): string`.

- [ ] Fingerprint exactly this stable projection: `sha256Hex(stableJson({ revisionHash, evidence: [...observedEvidence.items, ...inferredInterpretations.evidence].map(projectEvidence), relationships }))`, where `projectEvidence` keeps only `id, origin, kind, subjectId, claimKey, claimValue, text, sourceRefs, sourceRegionId, worldRegion, association, confidence, locationPrecision, uncertain, uncertaintyReasons` and relationships keep `fromId,toId,relation,sourceIds,confidence,basis,classification,uncertainty`. Exclude provenance, timestamps, raw values, omitted regions, and interpretation statements.
- [ ] Skip native/geometry evidence that restates the snapshot and skip geometry observations recomputed by the graph. Explicit observed geometry relationships with both endpoint scene nodes become `relation` edges, origin `geometry`, verification `derived`, basis `explicit`.
- [ ] OCR evidence with `sourceRegion`: create one `r:<regionId>` region node using `sourceRegion.worldBounds`, `boundsBasis: "region"`, origin `ocr`, verification `derived`, source refs capped at 64. Create one `o:<regionId>:<evidenceId>` item node using the same region bounds, `boundsBasis: "region"`, origin `ocr`, verification `unconfirmed`, text/confidence/source refs from evidence. Add `derived-from` item to region.
- [ ] Add `part-of` from an OCR region to a unique capture group whose source IDs contain all region source IDs. Do not invent membership when zero or multiple groups match.
- [ ] OCR with `worldRegion` but no source region creates `o:world:<shortHash(worldRegion)>:<evidenceId>` using region bounds. OCR with neither is skipped with a warning and no fabricated bounds. If `locationPrecision === "item"` while bounds are region-level, keep `boundsBasis: "region"` and add `Item-level OCR bounds are unavailable; region bounds are used.`.
- [ ] Add `labels` edges only for validated `evidence.association.candidateRefs` that resolve to existing `q:`/`s:` nodes. Always origin `ocr`, verification `unconfirmed`, confidence null, basis `ocr-region`, reason `OCR spatial association is unconfirmed.`.
- [ ] Model evidence of kind object/label/quantity/observation/association becomes `m:<evidenceId>` with origin `model`, verification `unconfirmed`, confidence/text/source refs from evidence. Use `worldRegion` when present; otherwise union bounds of known source refs and `boundsBasis: "source-union"` with `Model observation bounds are approximated from source objects.`; otherwise skip with a warning.
- [ ] Model and observed relationships become `relation` edges when both endpoints exist. Observed edges use `derived`/`explicit`; model edges use `unconfirmed`/`model` plus uncertainty reasons. Interpretations remain outside the graph.
- [ ] Each evidence ID creates at most one node; re-merging is idempotent. Truncate text to 2,000 characters with a reason. Call `finalizeCanvasScene` at the end and set `analysisFingerprint`.
- [ ] Write tests for snapshot evidence skipping, OCR region/item bounds, derived-from/part-of/labels edges, item-precision warning, world-only OCR, no-anchor skip, source-union model bounds, model/observed relationships, interpretation exclusion, fingerprint stability/change, idempotent remerge, and text truncation.
- [ ] Run `npx vitest run tests/canvas-scene-analysis.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): merge analysis evidence into scenes`.

### Task 7: SQLite graph store and FTS5 retrieval

**Files:** Create `server/canvas-intelligence/scene-store.ts`, `tests/canvas-scene-store.test.ts`.

**Interfaces:** Export `initializeCanvasSceneSchema(database)`, `CanvasSceneRetriever` with `index(graph): Promise<void>` and `search(scope, query, options): Promise<{ nodes; edges; warnings; truncated }>`, `CanvasSceneSearchScope` exactly as design §14.4, `CanvasSceneStoreError` with codes `stale_revision | index_unavailable | scope_mismatch`, and `SqliteCanvasSceneRetriever` with `loadExact(scope): CanvasSceneGraph | null`.

- [ ] Create `canvas_scene_graphs` with primary key `(board_id, revision_hash)` and columns from design §14.1. Create `canvas_scene_index` with unique `(board_id, revision_hash, node_id)` and FTS5 `canvas_scene_search` external-content over `canvas_scene_index.text` with insert/update/delete triggers.
- [ ] `index` saves the graph first in its own transaction, then replaces index rows in a second transaction. If the index transaction fails, the graph remains loadable and `index` throws; the build layer reports `index_status: failed`.
- [ ] Index only non-empty text nodes. Persist `source_refs_json` and `node_json`. Recognition candidates retain `verification_status: "unconfirmed"`.
- [ ] Prune revisions older than the current and immediately previous revision per board after a successful save. Deleting index rows must delete matching FTS rows through triggers.
- [ ] Exact scope requires course, lesson, board, and revision hash. If no active canvas exists or scope differs, throw `scope_mismatch`. If the persisted canvas revision differs from the graph revision, throw `stale_revision`. If no graph/index exists, throw `index_unavailable` with `canRebuild: true`.
- [ ] Current-course scope requires course; optional lesson/board. Join `canvas_scene_graphs.revision` to the persisted `canvases.revision`; never use an older graph. Add a warning for a matching board whose active revision has no graph. Exclude superseded and rollback revisions.
- [ ] Sanitize input exactly like `searchDocuments`: replace `"*:^(){}\[\]` with spaces, split on whitespace, take 20 terms, quote and escape, join with ` OR `. Empty sanitized input returns an empty result with a warning.
- [ ] Rank by `bm25(canvas_scene_search)` then `node_id`; clamp limit to `1..20`; return node JSON plus incident edges from the stored graph, sorted by edge ID, capped at 40 edges. Set `truncated` when nodes or edges are omitted.
- [ ] Write tests for schema creation, graph round-trip, FTS text hit, candidate status, exact search, stale exact error, current-course active-only behavior, rollback exclusion, missing-graph warning, cross-course rejection, sanitization, incident edges, and index failure preserving `loadExact`.
- [ ] Run `npx vitest run tests/canvas-scene-store.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): persist and retrieve scene graphs`.

### Task 8: Scene build service and HTTP API

**Files:** Create `server/canvas-intelligence/scene.ts`, `server/canvas-intelligence/scene-http.ts`, `tests/canvas-scene-service.test.ts`, `tests/canvas-scene-http.test.ts`; modify `server/api.ts`.

**Interfaces:** `scene.ts` exports `CanvasSceneBuildRequestSchema`, `CanvasSceneQueryRequestSchema`, `CanvasSceneCurrentSearchRequestSchema`, `buildCanvasScene(database, boardId, input, options?): Promise<{ scene: CanvasSceneGraph; indexStatus: "indexed" | "failed"; warnings: string[] }>`, `queryCanvasSceneExact(database, boardId, input, options?)`, and `searchCanvasEvidenceCurrentCourse(database, input, options?)`. `scene-http.ts` exports `createCanvasSceneHandler(database, origin, options?)` returning `(request, response) => Promise<boolean>`.

- [ ] Build request: strict `{ courseId, lessonId, expectedRevision, analysis: unknown | null }`. Load only the persisted canvas row for `(boardId, courseId, lessonId)`. Missing canvas is `404 scope_mismatch`; wrong expected revision is `409 stale_revision`.
- [ ] Parse the persisted document with `parseCanvasDocument`. Compute `currentCanvasRevision` for revision/snapshot/revision hashes. When `analysis` is present, validate it with `validateCanvasAnalysisAtReceiver`; any revision/snapshot/scope mismatch is `409 stale_revision` or `400 invalid_request` according to the analysis error.
- [ ] Capture with `boardId`, `document.snapshot`, and `document.objects`. Resolve recognition mode from `CANVAS_SCENE_RECOGNITION` (`off|baseline|adapter`, default `baseline`). If adapter mode has no adapter or the adapter fails, fall back to baseline and add a warning.
- [ ] Build `CanvasRecognitionInput[]` for strokes, recognize in batches of 32 with a 2,000 ms timeout, filter confidence `>= 0.45`, rank by confidence desc then label, keep top 2 per stroke and 4,000 total, and add a truncation warning when capped.
- [ ] Call `buildGeometryScene`; when analysis exists, call `mergeCanvasAnalysisIntoScene`; validate the final graph. Build with `builtAt: new Date().toISOString()`.
- [ ] Persist/index through `SqliteCanvasSceneRetriever.index`. On index failure, return the graph with `indexStatus: "failed"`, a warning, and no rollback. Never let indexing failure change the saved canvas.
- [ ] HTTP build: `POST /api/canvases/:boardId/scene`. HTTP exact query: `POST /api/canvases/:boardId/scene/query` with `{ courseId, lessonId, revisionHash, query, nodeKinds?, limit }`, limit clamped `1..20`. HTTP current-course search transport for the tool: `POST /api/canvases/scene/search` with `{ courseId, lessonId?, boardId?, query, nodeKinds?, limit }`. Register the handler in `server/api.ts` before the generic canvas GET route.
- [ ] Status mapping: `400 invalid_request`, `404 scope_mismatch`, `409 stale_revision`, `409 index_unavailable` plus `canRebuild:true`, `413 payload_too_large`, `502 scene_build_failed`. Include CORS headers consistent with existing canvas handlers; body limit 20,000,000 bytes.
- [ ] Tests for build success with stroke/scientific/group nodes; stale revision; cross-scope; valid analysis merge; invalid/stale analysis; adapter failure fallback; index failure response; exact query results; missing index error; current-course search; and cross-course rejection.
- [ ] Run `npx vitest run tests/canvas-scene-service.test.ts tests/canvas-scene-http.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): expose scene build and search APIs`.

### Task 9: Bounded CopilotKit scene context and tools

**Files:** Create `src/canvas/spatial/slice.ts`, `src/canvas/ai/scene-context.ts`, `src/canvas/ai/scene-tools.ts`, `tests/canvas-scene-context.test.ts`, `tests/canvas-scene-tools.test.ts`; modify `src/canvas/ai/canvas-bridge.ts`, `server/agent.ts`, `tests/tutor-integration.test.ts`.

**Interfaces:** `slice.ts` exports `sliceCanvasScene(graph, options: { nodeIds?: readonly string[]; viewport?: CanvasSceneBounds; maxNodes?: number; maxEdges?: number; radius?: number }): CanvasSceneGraph`. `scene-context.ts` exports `buildCanvasSceneAIContext(graph, options: { selectedSourceIds: readonly string[]; viewport: CanvasSceneBounds; maxChars?: number }): CanvasSceneAIContext`. `scene-tools.ts` exports `canvasSceneReadSchema`, `canvasEvidenceSearchSchema`, `getCanvasSceneSlice(graph, input, scope)`, `searchCanvasEvidence(apiBase, trustedScope, input)`, and `requestCanvasScene(apiBase, board, trustedScope, analysis, signal?)`.

- [ ] `sliceCanvasScene` selects explicit node IDs first, then viewport hits, then one-hop neighbors within radius 240, and unresolved `labels` edges incident to the selected set. Clamp nodes to `1..24` and edges to `0..48`. Add nodes/edges deterministically by selection order then ID. Set `truncated` when anything is omitted and preserve graph warnings.
- [ ] `buildCanvasSceneAIContext` maps `selectedSourceIds` to scene nodes by `ref`, builds a slice, and publishes scope/revision/revisionHash, node counts by kind, selected/visible nodes, model observations, unresolved label associations, warnings, and `truncated`. Budget is 6,000 characters by default; trim non-selected nodes in reverse selection order, then edges from the end, then warnings, until the serialized context fits. Never include raw `pts` or the full graph.
- [ ] Tool schemas: `get_canvas_scene` accepts `boardId`, optional `nodeIds` (max 24), `viewport`, `maxNodes` (`1..24`), and `maxEdges` (`0..48`). `search_canvas_evidence` accepts `query` (`1..200`), optional `boardId`, optional `lessonId`, and `limit` (`1..20`, default 8). Never accept `courseId` from the tool; use the trusted bridge scope.
- [ ] `getCanvasSceneSlice` rejects `boardId` mismatch, returns `{ error: "scene_unavailable", warnings, truncated: false }` when no graph, and otherwise returns the bounded slice with source refs and uncertainty. `searchCanvasEvidence` posts `{ courseId, lessonId, boardId?, query, limit }` to `/api/canvases/scene/search`, validates the response with Zod, and returns warnings/truncation on every result.
- [ ] `useQuickdrawAIBridge` accepts `scene?: CanvasSceneGraph | null`. When present, its `useAgentContext` value is `buildCanvasSceneAIContext` and the legacy `spatialRelationships` array is not published. When absent, keep the existing `buildCanvasAIContext` fallback. Keep `propose_canvas_action` and `get_canvas_state` unchanged. Register `get_canvas_scene` and `search_canvas_evidence` as read-only frontend tools.
- [ ] `server/agent.ts` imports the two schemas and binds each tool only when the corresponding frontend action exists for the same canvas scope. Add instructions that scene IDs are read-only, proposals use raw source IDs, and unconfirmed associations or recognition candidates must not be stated as facts.
- [ ] Write tests for slice caps/order/truncation, context budget and selected priority, no raw points/full graph, scene-present vs. fallback context, scope mismatch, tool schema bounds, search transport course scoping, malformed search response, and tutor tool binding. Update `tests/tutor-integration.test.ts` to assert both new tool names bind only for the active canvas scope.
- [ ] Run `npx vitest run tests/canvas-scene-context.test.ts tests/canvas-scene-tools.test.ts tests/tutor-integration.test.ts`; expected: fail, then pass.
- [ ] Commit with `feat(canvas): expose bounded scene context and tools`.

### Task 10: CanvasStudio lifecycle and full verification

**Files:** Modify `src/canvas/CanvasStudio.tsx`; create `tests/e2e/canvas-scene.spec.ts`.

**Interfaces:** `CanvasStudio` state adds `sceneGraph: CanvasSceneGraph | undefined`, a scene request sequence ref, and an `AbortController` ref. `useQuickdrawAIBridge` receives `scene: sceneGraph`.

- [ ] Add `refreshScene(board, analysis?)` using `requestCanvasScene`; it posts `{ courseId, lessonId, expectedRevision: board.revision, analysis: analysis ?? null }`. Increment the sequence, abort the previous request, clear `sceneGraph` on request start, and set the result only when the sequence is current, the board ID matches, and `scene.revision === board.revision`.
- [ ] Call `refreshScene` after every successful `postDocument` save using the returned revision. Call it again after a successful analysis using the analysis revision and validated analysis. A scene failure must not clear analysis, overwrite the saved status, or roll back the board.
- [ ] Clear `sceneGraph`, sequence, and in-flight request on `scheduleSave`, board load/switch, board delete, and proposal apply that changes the board. Do not write scene data into `documentRef` or `CanvasDocument`.
- [ ] Pass `sceneGraph` into `useQuickdrawAIBridge`. Keep `CanvasAnalysisTutorContext` unchanged. Ensure the existing `spatialRelationships` context is replaced, not duplicated, when the graph is present.
- [ ] Add `tests/e2e/canvas-scene.spec.ts`: create a course/lesson, open the board, add an equation, wait for `All changes saved`, then poll `POST /api/canvases/:id/scene` with the current revision and expect a scene containing the scientific object. Assert a stale revision returns `409`.
- [ ] Run `npx vitest run tests/canvas-scene-contract.test.ts tests/canvas-scene-capture.test.ts tests/canvas-scene-index.test.ts tests/canvas-scene-recognition.test.ts tests/canvas-scene-graph.test.ts tests/canvas-scene-analysis.test.ts tests/canvas-scene-store.test.ts tests/canvas-scene-service.test.ts tests/canvas-scene-http.test.ts tests/canvas-scene-context.test.ts tests/canvas-scene-tools.test.ts tests/tutor-integration.test.ts`; expected: all pass.
- [ ] Run `npm test -- --maxWorkers=1`; expected: all unit/integration tests pass.
- [ ] Run `npm run build`; expected: TypeScript build and Vite production build pass.
- [ ] Run `npx tsx scripts/benchmark-canvas-scene.ts`; record build and p95 query timing; if p95 exceeds 5 ms, tune cell size/overflow before considering an R-tree and record the result.
- [ ] Run `npx playwright test tests/e2e/canvas-scene.spec.ts`; expected: pass. Then review `git diff` and confirm no database, `.worktrees`, or unrelated user files changed.
- [ ] Commit with `feat(canvas): keep scene graph current in studio`.

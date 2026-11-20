# Spatial Canvas Intelligence Design

- Date: 2026-11-18
- Status: Proposed
- Decision: Option C, hybrid native core with a learned-model adapter boundary
- Scope owner: StudyAI MK3 canvas and tutor

## 1. Intent

StudyAI already turns a persisted Quickdraw board into OCR regions, structural observations, evidence, and reviewable tutor proposals. What it does not have is a durable, source-linked representation of the ink and objects as a spatial scene. The current AI context samples at most six points from a freehand stroke, drops pressure, and computes spatial relationships ad hoc. There is no scene graph to query, no revision-bound retrieval index, and no clean boundary for a learned stroke recognizer.

This design adds a spatial canvas intelligence layer that:

- captures freehand geometry, pressure, and deterministic stroke features;
- builds a versioned scene graph over strokes, groups, OCR items, native objects, scientific objects, and model observations;
- exposes source-linked spatial queries through a bounded native index;
- normalizes strokes for a trajectory stream and a raster stream;
- ships a deterministic baseline recognizer and a stable adapter contract for later ONNX or FastAPI models;
- feeds a bounded scene summary to CopilotKit without creating a second analysis authority;
- indexes scene text in SQLite FTS5 for revision-scoped retrieval.

The result should make the tutor better at answering "what is near what" and "what did the student draw here" while keeping every uncertain claim visibly uncertain and every derived artifact rebuildable.

## 2. Goals

1. Capture freehand strokes from persisted Quickdraw snapshots with bounds, ordered points, pressure when available, and deterministic geometry features.
2. Build a `CanvasSceneGraph` with stable IDs, source references, confidence, and uncertainty metadata.
3. Provide a native spatial index that answers rectangle and nearest queries without adding a runtime dependency.
4. Normalize strokes into fixed-size trajectory and raster inputs suitable for a dual-stream recognizer.
5. Ship a deterministic baseline recognizer and a `CanvasRecognitionAdapter` interface for later learned models.
6. Merge OCR and model observations into the graph as unconfirmed evidence, never as ground truth.
7. Give CopilotKit a bounded scene slice and a read-only scene query tool, while preserving the existing approval-gated mutation tool.
8. Persist scene graphs and searchable node text in SQLite, keyed by board, course, lesson, revision, and snapshot hash.
9. Keep stale revisions, cross-scope access, oversized inputs, and malformed geometry from reaching the tutor.
10. Add unit, integration, browser, and performance tests for the above.

## 3. Non-goals

- Training, fine-tuning, or shipping CNN, BiLSTM, or ViT weights.
- Replacing the existing OCR, structure, fusion, or evidence pipeline.
- Treating a geometry-derived association as a verified label assignment.
- Automatically applying tutor-proposed canvas edits.
- Adding Python, FastAPI, ChromaDB, PyTorch, ONNX Runtime, or an R-tree dependency in the initial implementation.
- Changing the Quickdraw snapshot or `CanvasDocument` as the source of truth.
- Full-board semantic understanding or handwriting transcription from coordinates alone.
- A new UI for browsing the scene graph. The graph is consumed by the tutor and retrieval layers first.
- Cross-course retrieval without an explicit scope.

## 4. Anti-goals

- A second spatial authority that disagrees with `CanvasSpatialAssociationSchema` or `CanvasEvidenceBundle`.
- Model output presented as confirmed text, a confirmed object, or a confirmed relationship.
- A scene response or CopilotKit context that grows without a hard cap.
- An index that can return nodes from a stale or different board revision.
- Silent loss of pressure, source IDs, uncertainty, or truncation.
- A learned adapter that is required for the canvas to load or for the tutor to answer geometry questions.
- Graph edges that imply meaning the geometry cannot support.

## 5. Current State and Constraints

### 5.1 Quickdraw data

- `shape.props.pts` is a flat array of `[x, y, pressure, ...]` triplets.
- Pressure is in `[0, 1]`; `0.5` is the no-reading value used when pressure is unavailable.
- No timestamp is captured. Point order exists, but real elapsed time does not.
- A single tap can produce a dot with no meaningful trajectory.
- `store.shapes()` excludes `asset` records.
- `store.getSnapshot()` returns `{ document: { store: { id: record } } }`.
- `store.loadSnapshot(snapshot, source = "remote")` replaces the document.

### 5.2 Existing canvas intelligence

- `src/canvas/ocr-capture.ts` and `server/canvas-intelligence/regions.ts` parse `props.pts` in steps of three and currently retain only `x` and `y`.
- `src/canvas/ai/canvas-context.ts` samples at most six stroke points and computes `spatialRelationships` with simple bounds checks.
- `src/canvas/scene.ts` has object anchors and bounds resolution, but not a graph.
- `server/canvas-intelligence/types.ts` already defines `CanvasSpatialAssociationSchema`, OCR source regions, and uncertainty fields.
- `server/canvas-intelligence/evidence.ts` already builds a revision-bound evidence bundle and selected context.
- `server/canvas-analysis/contract.ts` already binds analyses to board, course, lesson, persisted revision, snapshot hash, source IDs, and provenance.
- `server/canvas-persistence/service.ts` already enforces strict saves, expected revisions, and scope ownership.
- `src/canvas/ai/canvas-bridge.ts` already exposes `propose_canvas_action` and `get_canvas_state` through CopilotKit.

### 5.3 Storage and runtime

- SQLite is already present through `better-sqlite3`; document search uses FTS5.
- There is no ChromaDB, vector store, Python runtime, ONNX Runtime, PyTorch, or `rbush`.
- The existing application is local-first and runs on Node >= 22 with the current React/Vite/TypeScript stack.
- `AGENTS.md` requires an ADR for significant reuse-versus-build decisions and a demonstrated capability gap before adding a dependency.

### 5.4 Accepted decision that constrains this work

`docs/decisions/ADR-2026-11-11-grounded-canvas-regions.md` selected source-linked `exportImage` crops and deferred a generalized scene graph. This design does not undo the crop decision. It adds a narrow deterministic scene graph over persisted canvas data and explicitly supersedes only the "no scene graph" portion for this scope. A new ADR is required before implementation.

## 6. Approaches Considered

### Approach A: Native deterministic only

Build stroke capture, normalization, a spatial index, and a scene graph entirely in TypeScript. Use geometric rules for symbol candidates. Keep OCR as the only text recognizer.

- Advantages: no new runtime, lowest operational risk, fast to ship, easy to test, local-first by construction.
- Disadvantages: does not provide a real learned dual-stream recognizer; the requested CNN/BiLSTM/ViT path remains unfulfilled.

### Approach B: Python model service first

Add a FastAPI or Python worker that owns stroke rasterization, a 1D-CNN plus BiLSTM trajectory model, a ViT raster model, fusion, and graph inference. The Node app calls it over loopback.

- Advantages: strongest ML tooling; natural home for training and inference; can iterate on models independently.
- Disadvantages: requires a second runtime, model artifacts, dataset work, and new operational failure modes; no usable weights exist today; delays useful deterministic canvas intelligence.

### Approach C: Hybrid native core with an adapter boundary

Ship the deterministic capture, index, scene graph, and baseline recognition in the existing TypeScript/Node app. Define a narrow `CanvasRecognitionAdapter` contract. A later ONNX Runtime adapter or loopback FastAPI adapter can supply the learned trajectory and raster streams without changing the graph, API, or tutor integration.

- Advantages: delivers useful behavior now; preserves local-first architecture; keeps the learned-model path real and testable; avoids a dependency on unavailable weights; lets the adapter be swapped behind one interface.
- Disadvantages: two recognizer paths to maintain; the adapter contract must be designed carefully so it does not leak model-specific assumptions.

**Chosen: Approach C.** The user selected this option. The native core is the product now; the learned adapter is a later capability behind a stable boundary.

## 7. Architecture

### 7.1 Ownership

- The persisted Quickdraw snapshot plus `ScientificObject[]` is the source of truth.
- The scene graph is a derived, rebuildable view. It is never edited directly by the tutor.
- OCR and model observations are evidence. They enter the graph with `origin` and `verificationStatus` that prevent them from being treated as confirmed.
- The server owns graph construction and validation. The client may display or summarize a graph, but it does not invent authoritative node IDs or associations.
- SQLite stores the graph and search index as a cache/retrieval layer. The canvas document remains the canonical save format.

### 7.2 Data flow

1. A board is saved through the existing canvas persistence path.
2. The client asks the scene endpoint to build the current scene for the saved revision.
3. The server loads the persisted canvas, parses strokes and objects, and normalizes geometry.
4. The capture layer extracts ordered points, pressure availability, bounds, and deterministic features.
5. The spatial index is built over scene nodes.
6. The graph builder emits nodes and source-linked edges.
7. If a validated `CanvasAnalysisResult` is supplied, OCR and model observations are merged as unconfirmed evidence.
8. The graph is validated by Zod and returned.
9. The graph and flattened node text are persisted and indexed in SQLite FTS5, keyed by revision.
10. CopilotKit receives a bounded scene summary and can query the current graph or the revision-scoped index.

### 7.3 Proposed module layout

Client/shared:

- `src/canvas/spatial/types.ts`: Zod schemas and inferred types for points, strokes, nodes, edges, graphs, queries, and recognition.
- `src/canvas/spatial/capture.ts`: parse Quickdraw records and scientific objects into normalized scene inputs.
- `src/canvas/spatial/normalize.ts`: finite-number checks, bounds conversion, resampling, pressure normalization, feature extraction.
- `src/canvas/spatial/index.ts`: `CanvasSpatialIndex` interface and native grid implementation.
- `src/canvas/spatial/graph.ts`: deterministic graph builder and graph slice helpers.
- `src/canvas/spatial/recognition.ts`: adapter interface and deterministic baseline recognizer.
- `src/canvas/ai/scene-context.ts`: bounded scene summary for CopilotKit.

Server:

- `server/canvas-intelligence/scene.ts`: server-side scene build orchestration.
- `server/canvas-intelligence/scene-store.ts`: SQLite graph persistence, FTS5 index, revision invalidation.
- `server/canvas-intelligence/scene-http.ts`: scene build and query endpoints.
- `server/canvas-intelligence/recognition/adapter.ts`: adapter registry and fake adapter for tests.
- `server/canvas-intelligence/recognition/baseline.ts`: deterministic baseline adapter implementation.

The exact file split may change if the builder finds a cleaner boundary, but the ownership and contract boundaries above are fixed.

## 8. Core Contracts

All contracts use Zod 4, strict objects where the input crosses a trust boundary, and finite numbers. Bounds use `{ x, y, width, height }` to match the existing server OCR and evidence contracts; Quickdraw `{ x, y, w, h }` bounds are converted at the capture boundary.

### 8.1 References and points

```ts
const CanvasSceneRefSchema = z.object({
  scope: z.enum(["quickdraw", "science", "ocr", "model", "scene"]),
  id: z.string().min(1).max(512),
});

const CanvasSceneBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

const CanvasScenePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().min(0).max(1).nullable(),
});
```

`pressure: null` means the triplet did not contain a usable pressure value. The capture layer also records whether the stroke has any non-`0.5` pressure reading; a stroke whose readings are all `0.5` is marked pressure-unavailable rather than pretending the values are meaningful.

### 8.2 Stroke

```ts
const CanvasSceneStrokeSchema = z.object({
  id: z.string().min(1),                 // scene ID
  recordId: z.string().min(1),           // Quickdraw record ID
  type: z.enum(["draw", "highlight"]),
  bounds: CanvasSceneBoundsSchema,
  points: z.array(CanvasScenePointSchema).max(512),
  pointCount: z.number().int().nonnegative(),
  sampling: z.enum(["none", "uniform", "rdp"]),
  pressure: z.object({
    available: z.boolean(),
    mean: z.number().min(0).max(1).nullable(),
    min: z.number().min(0).max(1).nullable(),
    max: z.number().min(0).max(1).nullable(),
  }),
  features: z.object({
    pathLength: z.number().nonnegative(),
    aspect: z.number().nonnegative(),
    orientation: z.number(),              // radians, principal axis
    turnCount: z.number().int().nonnegative(),
    closed: z.boolean(),
    endpointDistance: z.number().nonnegative(),
  }),
});
```

Rules:

- Raw points are retained up to 512. Above that, deterministic Ramer-Douglas-Peucker simplification is applied with a fixed epsilon, then uniform sampling to the cap.
- Bounds are computed from all raw points before simplification.
- `pointCount` is the raw count, not the retained count.
- Empty or single-point strokes are valid; their features are zeroed where undefined.
- All numbers must be finite; non-finite records are rejected with a warning rather than silently clamped.

### 8.3 Scene node

```ts
const CanvasSceneNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "stroke",
    "stroke-group",
    "ocr-region",
    "ocr-item",
    "scientific-object",
    "native-object",
    "model-observation",
    "recognition-candidate",
  ]),
  ref: CanvasSceneRefSchema,
  bounds: CanvasSceneBoundsSchema,
  boundsBasis: z.enum(["source", "region", "source-union", "derived"]),
  text: z.string().max(2000).nullable(),
  recordType: z.string().max(64).nullable(),
  origin: z.enum(["quickdraw", "geometry", "ocr", "model", "science"]),
  verificationStatus: z.enum(["source", "derived", "unconfirmed"]),
  confidence: z.number().min(0).max(1).nullable(),
  sourceRefs: z.array(CanvasSceneRefSchema).max(64),
  geometry: z.object({
    centroid: z.object({ x: z.number().finite(), y: z.number().finite() }).nullable(),
    orientation: z.number().nullable(),
    pathLength: z.number().nonnegative().nullable(),
    pointCount: z.number().int().nonnegative().nullable(),
    aspect: z.number().nonnegative().nullable(),
    pressureMean: z.number().min(0).max(1).nullable(),
  }).nullable(),
  uncertaintyReasons: z.array(z.string().max(300)).max(16),
});
```

Node ID rules:

- Native Quickdraw record: `q:<recordId>`.
- Scientific object: `s:<objectId>`.
- Stroke group: `g:<first-16-hex-of-sha256(sorted-source-ids)>`.
- OCR region: `r:<regionId>`.
- OCR item with a source region: `o:<sourceRegionId>:<evidenceId>`.
- OCR item without a source region but with a `worldRegion`: `o:world:<first-16-hex-of-sha256(worldRegion)>:<evidenceId>`.
- Model observation: `m:<evidenceId>`.
- Recognition candidate: `c:<strokeSceneId>:<adapterId>:<rank>`.

OCR IDs use the validated evidence ID rather than the OCR item index so an inserted or reordered item cannot silently rename an existing node. Stable hashing is used only to keep IDs compact. The graph retains all source IDs in `sourceRefs`; `sourceRefs` never contains a `scene` scope, which is reserved for a node's own `ref` when it has no external source. Recognition candidates have `ref: { scope: "scene", id: <candidateId> }`, `bounds` equal to the source stroke bounds, `boundsBasis: "derived"`, `geometry: null`, `text` equal to the candidate label, `recordType` equal to the candidate kind, `origin` equal to `"geometry"` for the baseline and `"model"` for a learned adapter, and `verificationStatus: "unconfirmed"`.

### 8.4 Scene edge

```ts
const CanvasSceneEdgeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "contains",
    "overlaps",
    "near",
    "left-of",
    "right-of",
    "above",
    "below",
    "aligned-with",
    "labels",
    "part-of",
    "relation",
    "derived-from",
    "recognizes",
  ]),
  from: z.string().min(1),
  to: z.string().min(1),
  origin: z.enum(["native", "geometry", "ocr", "model"]),
  verificationStatus: z.enum(["source", "derived", "unconfirmed"]),
  basis: z.enum(["bounds", "points", "ocr-region", "model", "recognition", "explicit"]),
  distance: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  sourceRefs: z.array(CanvasSceneRefSchema).max(64),
  uncertaintyReasons: z.array(z.string().max(300)).max(16),
});
```

Edge rules:

- `contains`: group to stroke; source-derived.
- `derived-from`: OCR item to region; source-derived.
- `part-of`: OCR region to stroke group when the existing region contract supports it; source-derived.
- `overlaps`: intersecting bounds, geometry-derived, capped per node.
- `near`: nearest neighbors within a distance threshold, geometry-derived, capped per node.
- `left-of` / `right-of` / `above` / `below`: directional geometry for the selected nearest pairs only, not all pairs.
- `aligned-with`: centers within a small tolerance on one axis and within the proximity threshold; geometry-derived.
- `labels`: OCR item to an existing candidate from `associateOCRLabels`; always `unconfirmed`, confidence null, basis `ocr-region`.
- `recognizes`: recognition candidate to its stroke; `unconfirmed`, basis `recognition`, confidence copied from the candidate.
- `relation`: an explicit scientific-object relationship or a model relationship; `unconfirmed` unless the source object itself is authoritative.
- Edge IDs are deterministic: `e:<first-16-hex-of-sha256(from|kind|to|basis)>`.

### 8.5 Scene graph

```ts
const CanvasSceneGraphSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.object({
    boardId: z.string().min(1),
    courseId: z.string().min(1),
    lessonId: z.string().min(1),
  }),
  revision: z.number().int().nonnegative(),
  revisionHash: z.string().min(1),
  snapshotHash: z.string().min(1),
  builderVersion: z.string().min(1),
  analysisFingerprint: z.string().nullable(),
  recognition: z.object({
    mode: z.enum(["off", "baseline", "adapter"]),
    adapterId: z.string().nullable(),
    adapterVersion: z.string().nullable(),
    candidateCount: z.number().int().nonnegative(),
  }),
  builtAt: z.string().datetime(),
  nodes: z.array(CanvasSceneNodeSchema).max(10_000),
  edges: z.array(CanvasSceneEdgeSchema).max(30_000),
  warnings: z.array(z.string().max(300)).max(64),
  truncated: z.boolean(),
});
```

The graph is deterministic for a given snapshot, scientific object list, optional analysis with the same `analysisFingerprint`, builder version, and recognition adapter/version. `builtAt` is excluded from equality checks. Nodes and edges are sorted by stable IDs before hashing or persistence. `analysisFingerprint` is a stable hash of the validated analysis inputs that affect the graph; it is `null` when no analysis is merged.

### 8.6 Recognition adapter

```ts
export type CanvasRecognitionInput = {
  strokeId: string;
  trajectory: number[][];          // [N, F], no timestamp channel
  raster: { width: number; height: number; grayscaleBase64: string };
  geometry: CanvasSceneStroke["features"];
  pressureAvailable: boolean;
};

export type CanvasRecognitionCandidate = {
  label: string;
  kind: "symbol" | "text" | "shape" | "unknown";
  confidence: number;
  alternatives: string[];
};

export type CanvasRecognitionResult = {
  adapterId: string;
  adapterVersion: string;
  candidates: CanvasRecognitionCandidate[];
  uncertain: boolean;
  uncertaintyReasons: string[];
  latencyMs: number;
};

export interface CanvasRecognitionAdapter {
  readonly id: string;
  readonly version: string;
  recognize(
    inputs: CanvasRecognitionInput[],
    signal?: AbortSignal,
  ): Promise<CanvasRecognitionResult[]>;
}
```

The baseline adapter is deterministic and availability-independent. A later ONNX adapter runs in a worker thread; a later FastAPI adapter uses loopback only. Both are optional. The core scene endpoint must work with the adapter disabled.

## 9. Capture and Normalization

### 9.1 Capture

`captureCanvasScene` accepts the persisted snapshot, `ScientificObject[]`, and optional validated analysis. It produces:

- native records with stable IDs, bounds, text, arrow geometry, and record type;
- scientific objects with bounds and a compact semantic summary;
- freehand strokes with ordered points and pressure;
- stroke groups using the existing gap-based grouping contract;
- OCR regions and items from validated evidence, when present;
- model observations from validated evidence, when present;
- recognition candidates from the configured recognizer, after stroke capture.

The capture layer reuses existing geometry helpers where possible. It does not duplicate the analysis pipeline or call a model.

### 9.2 Analysis merge mapping

`CanvasAnalysisResult` is merged by evidence type, not copied wholesale:

| Analysis input | Graph mapping |
|----------------|---------------|
| Native or geometry evidence that restates the snapshot | Skip; the source node already represents it. |
| Geometry observation text recomputed by the graph | Skip; the graph's own edges are the spatial record. |
| Explicit geometry relationship with known endpoints | `relation` edge, `derived`, basis `explicit`. |
| OCR item with a validated `sourceRegion` | `ocr-region` node, `ocr-item` node using the region's `worldBounds`, `derived-from` edge, and `labels` edge when an association candidate exists. |
| OCR item with `worldRegion` but no source region | `ocr-item` node with `boundsBasis: "region"`; no region node. |
| OCR item with neither a source region nor a world region | Skip with a warning; it remains in the analysis result, not the spatial graph. |
| Model observation with `worldRegion` | `model-observation` node with `boundsBasis: "region"`. |
| Model observation with no region but known source refs | Node with union bounds and `boundsBasis: "source-union"`; warnings name the approximation. |
| Model observation with no spatial anchor | Skip with a warning; it remains in the analysis result. |
| Model relationship with both endpoints in the graph | `relation` edge, `unconfirmed`, basis `model`. |
| Interpretation statement | Not a graph node; it remains in the analysis result. |

Mapping rules:

- Each evidence ID creates at most one node. Re-merging the same analysis is idempotent.
- The evidence contract provides region-level OCR bounds, not item-level boxes. OCR nodes use those region bounds with `boundsBasis: "region"` and a warning when `locationPrecision` claims item precision; the graph must not imply item-level bounds it does not have.
- Node text is truncated to 2,000 characters, and a visible uncertainty reason records the truncation.
- A model observation never creates a `labels` edge unless the existing validated association already names a candidate.
- Region-less OCR and model nodes are inserted into the spatial index only when they have bounds; skipped evidence is counted in warnings.
- The graph records `analysisFingerprint` so a graph built with analysis cannot be mistaken for the geometry-only graph.

### 9.3 Bounds conversion

Quickdraw bounds are `{ x, y, w, h }`; scene and OCR bounds are `{ x, y, width, height }`. Conversion happens once at the capture boundary. Negative or non-finite widths/heights are rejected. Zero-size text and point records are allowed only if the source record is valid.

### 9.4 Pressure

- A triplet without a finite third component yields `pressure: null`.
- Values outside `[0, 1]` are rejected, not clamped.
- If every finite reading in a stroke is `0.5`, `pressure.available` is false.
- Otherwise pressure statistics are computed from the finite readings and `0.5` values are retained as recorded.
- No pressure value is invented and no timestamp is synthesized.

### 9.5 Resampling

- Retain raw points up to 512.
- For larger strokes, simplify with RDP using a fixed world-unit epsilon, then sample uniformly to 512.
- For recognition, resample to 128 trajectory points with cumulative arc-length parameterization.
- For raster input, render a 96 x 96 grayscale image from the normalized stroke, preserving aspect ratio and centering by bounds.
- All resampling is deterministic and independent of wall-clock time.

### 9.6 Features

Per-stroke features are deliberately small and interpretable:

- path length;
- bounding-box aspect ratio;
- principal orientation;
- turn count above a fixed angle threshold;
- closedness and endpoint distance;
- pressure availability and statistics;
- point count and retained sample count.

No feature claims semantic meaning. Features are inputs to the baseline and to the adapter, not labels.

## 10. Spatial Index

### 10.1 Interface

```ts
export interface CanvasSpatialIndex {
  insert(node: CanvasSceneNode): void;
  remove(id: string): void;
  query(bounds: CanvasSceneBounds): CanvasSceneNode[];
  nearest(
    point: { x: number; y: number },
    limit: number,
    maxDistance: number,
  ): Array<{ node: CanvasSceneNode; distance: number }>;
  size(): number;
}
```

### 10.2 Implementation

The initial implementation is a native uniform grid:

- Default cell size: 128 world units, tunable between 64 and 256.
- Each node is inserted into every cell its bounds intersect.
- Nodes covering more than 256 cells go into an overflow list instead of exploding the grid.
- Queries scan intersecting cells plus the overflow list, deduplicate by node ID, and sort by distance then ID.
- Boards with fewer than 256 nodes use a linear scan, which is simpler and faster at that size.
- The index is rebuilt per scene graph; it is not mutated by tutor proposals.

### 10.3 Why not an R-tree

`rbush` is not present, and the current board sizes do not justify a new dependency. The interface above allows an R-tree implementation later if benchmarks show the grid is insufficient. The ADR must record this call.

### 10.4 Performance target

- Index build and 1,000 mixed queries on a 10,000-node synthetic graph: p95 under 5 ms on the development machine.
- If the target is missed, tune cell size and overflow thresholds first; only then evaluate an R-tree.
- The benchmark is a release check, not a runtime assertion.

## 11. Scene Graph Construction

### 11.1 Build order

1. Capture native records and scientific objects.
2. Build strokes and stroke groups.
3. Insert source nodes into the spatial index.
4. Run the configured recognizer over the captured strokes and merge candidate nodes.
5. Emit geometric edges using index queries with fixed caps.
6. Merge OCR regions, OCR items, and existing associations from validated analysis.
7. Merge model observations and relationships from validated analysis.
8. Sort nodes and edges, validate with Zod, and compute warnings/truncation.
9. Return the graph and persist/index it when the server is building.

### 11.2 Recognition merge policy

Recognition is part of the scene build, but it is not a new analysis authority.

- Mode is `baseline` by default and can be set to `adapter` or `off` by configuration.
- An enabled adapter replaces baseline results for the strokes it successfully processes. Strokes that time out, fail, or are unsupported fall back to baseline candidates with a warning.
- Candidates are included only when confidence is at least `0.45`; retain at most the top 2 candidates per stroke and at most 4,000 candidate nodes total.
- Each retained candidate becomes a `recognition-candidate` node and a `recognizes` edge to its stroke. Candidate bounds are the stroke bounds, never invented geometry.
- Candidate nodes are not inserted into the geometric edge index and receive no `overlaps`, `near`, or directional edges; their only topology is `recognizes`.
- Candidate text is indexed by FTS5 with its `unconfirmed` status; retrieval must return that status to the caller.
- If the adapter returns more candidates than allowed, keep the deterministic top-ranked set and add a truncation warning.
- Candidate IDs include the adapter ID and rank. Alternatives remain candidate metadata for context and are not separate graph nodes. The graph's `recognition` metadata records the adapter version so a version change is a different graph build.

### 11.3 Edge caps

- `overlaps`: at most 8 per node.
- `near`: at most 3 per node, within 96 world units.
- Directional edges: only for the same nearest pairs, at most 3 per node.
- `aligned-with`: at most 2 per node, within 96 world units and 8 world units of axis tolerance.
- OCR `labels` edges: at most the candidates already retained by the validated association.
- `recognizes` edges: at most 2 per stroke, matching the candidate cap.
- `relation` edges: at most the source relationships, capped by the graph edge total.

Caps are applied after deterministic sorting so the same input always produces the same edge set.

### 11.4 Labels and meaning

Geometry can support "near", "overlaps", "left of", and "part of a stroke group". It cannot support "this is a velocity vector" or "this label belongs to that atom" as fact. OCR label edges and model observations therefore remain `unconfirmed`, with reasons that explain the limitation.

### 11.5 Graph slicing

`sliceCanvasScene` returns a bounded subgraph for a selection, viewport, or node ID:

- selected nodes first;
- their incident edges;
- one-hop neighbors within a radius;
- unresolved label associations;
- a hard node/edge cap and a `truncated` flag.

The slice is the only graph shape that reaches CopilotKit context. The full graph is available to the read tool and retrieval layer.

## 12. Recognition

### 12.1 Deterministic baseline

The baseline adapter uses geometry only:

- line-like vs closed vs compact vs branched;
- orientation and aspect;
- turn count and endpoint proximity;
- pressure availability;
- optional template distance for a small set of common marks (line, arrow, circle, box, triangle, cross, check, underline, slash).

It returns candidates with `uncertain: true` and a reason such as "Geometry-only symbol candidate." It never transcribes text. Text recognition remains OCR.

### 12.2 Trajectory stream

- Input: 128 points, channels for normalized `x`, `y`, delta `x`, delta `y`, cumulative arc length, curvature, and a pressure mask/value.
- No time channel. The sequence order is preserved, but the model must be trained and evaluated as an order-based model, not a real-time handwriting model.
- The BiLSTM, if used later, models point order, not elapsed time.

### 12.3 Raster stream

- Input: 96 x 96 grayscale, aspect-preserved and centered.
- Optional ViT or CNN adapter.
- Rasterization is deterministic for a given stroke and transform.

### 12.4 Fusion

- Concatenate adapter embeddings with deterministic geometry features.
- Produce top-k candidates and alternatives.
- Do not claim calibrated probabilities without calibration data.
- Every candidate is evidence, not a verified label.

### 12.5 Adapter operation

- Recognition mode defaults to `baseline`; `off` omits candidates, and `adapter` is opt-in.
- Optional ONNX adapter runs in a worker thread with a 2,000 ms timeout per batch.
- Optional FastAPI adapter is loopback-only and is never started by the app automatically.
- Maximum batch: 32 strokes.
- On timeout, error, or invalid output, the graph build continues with baseline candidates and a warning.
- No model output can mutate the canvas or bypass approval.

## 13. CopilotKit Integration

### 13.1 Scene context

Add `buildCanvasSceneAIContext` in `src/canvas/ai/scene-context.ts`:

- scope, revision, revision hash;
- node counts by kind;
- selected and visible scene slice;
- unresolved OCR label associations;
- model observations with confidence and uncertainty reasons;
- warnings and truncation flag;
- a hard 6,000-character budget, leaving room in the existing 12,000-character canvas context budget.

`useQuickdrawAIBridge` accepts an optional scene graph. When present, the scene summary becomes the only source of computed spatial relationships. The legacy `spatialRelationships` array is removed from the active context to avoid two spatial authorities. If the scene graph is unavailable, the legacy context remains the fallback.

### 13.2 Tools

- Keep `propose_canvas_action` unchanged. It remains the only mutation path and still requires user approval.
- Keep `get_canvas_state` for raw Quickdraw records.
- Add `get_canvas_scene`: read-only, current board, accepts `boardId`, optional `nodeIds`, `viewport`, `maxNodes`, and `maxEdges`. Returns a bounded slice with source refs and uncertainty.
- Add `search_canvas_evidence`: read-only FTS5 search across the current course's active revisions, with `query`, optional `boardId`, `lessonId`, and `limit`. It never searches a stale or rollback revision. Returns nodes and incident edges, not raw chunks.

Tool schemas are Zod objects, max 8 tools total, and every result includes `truncated` and `warnings`.

### 13.3 Context rules

- Never send the full graph to the model.
- Never send raw `pts` arrays.
- Never send a node without its source refs or uncertainty reasons.
- Prefer selected nodes and unresolved associations over a broad board dump.
- Include at most 24 nodes and 48 edges in one slice.
- Include scene node IDs and their raw source IDs. Proposals continue to reference raw Quickdraw/science IDs; scene IDs are read-only references. Validate every raw ID again in `propose_canvas_action`.

## 14. Persistence and Retrieval

### 14.1 Primary store

Use SQLite FTS5, already present in the application. Do not add ChromaDB in the initial implementation.

Proposed tables:

- `canvas_scene_graphs`: `board_id`, `course_id`, `lesson_id`, `revision`, `revision_hash`, `snapshot_hash`, `graph_json`, `created_at`, primary key `(board_id, revision_hash)`.
- `canvas_scene_index`: `id` integer primary key, `board_id`, `course_id`, `lesson_id`, `revision`, `revision_hash`, `node_id`, `kind`, `verification_status`, `text`, `source_refs_json`, `node_json`, unique `(board_id, revision_hash, node_id)`.
- `canvas_scene_search`: FTS5 over `text` with content linked to `canvas_scene_index`, plus joined scope columns for filtering.

The builder may use an external-content FTS5 table with triggers or a standalone FTS5 table if the external-content form makes scope filtering or migration too fragile. The query contract is fixed; the DDL detail is a builder call.

### 14.2 Indexing rules

- Index only node text: labels, OCR text, scientific labels/titles, model observation text, and recognition-candidate labels. Recognition candidates are indexed with `verification_status: "unconfirmed"`.
- Do not index raw coordinates, raw point arrays, or binary image data.
- Scope columns are mandatory on every query.
- Exact-revision query: requires `courseId`, `lessonId`, `boardId`, and `revisionHash`.
- Current-course query: requires `courseId`, with optional `lessonId` and `boardId`. It resolves each board's active revision by joining `canvas_scene_graphs.revision` to the persisted canvas revision; it never falls back to an older graph.
- A board with no graph for its active revision is skipped with a warning in current-course mode, or returns `409 index_unavailable` in exact mode.
- Rollback and superseded revisions are never returned by current-course queries.
- Results are ranked by `bm25` then stable node ID.
- Return nodes plus incident edges, capped at 20 nodes and 40 edges.
- Sanitize FTS input the same way the existing document search does.

### 14.3 Revision lifecycle

- A new canvas save increments the persisted revision.
- The scene build for a new revision replaces the active graph for that board.
- The previous revision may be retained for one rollback window; older revisions are pruned.
- An exact query for a stale revision returns `409 stale_revision`; it never serves an old graph as current. A current-course query resolves active revisions per board and silently excludes superseded or rollback revisions, reporting them in `warnings`.
- If indexing fails, the graph response still succeeds with `indexStatus: "failed"` and a warning. The next build retries. Retrieval for that revision returns `index_unavailable`.

### 14.4 ChromaDB adapter

Define `CanvasSceneRetriever` with `index(graph)` and:

```ts
type CanvasSceneSearchScope =
  | { mode: "exact"; courseId: string; lessonId: string; boardId: string; revisionHash: string }
  | { mode: "current-course"; courseId: string; lessonId?: string; boardId?: string };

search(
  scope: CanvasSceneSearchScope,
  query: string,
  options: { nodeKinds?: CanvasSceneNode["kind"][]; limit: number },
): Promise<{ nodes: CanvasSceneNode[]; edges: CanvasSceneEdge[]; warnings: string[]; truncated: boolean }>;
```

The initial implementation is SQLite. A future Chroma adapter can implement the same interface after an ADR demonstrates a gap that FTS5 cannot cover. No Chroma dependency is added now.

## 15. API

### 15.1 Build scene

`POST /api/canvases/:boardId/scene`

Request:

```json
{
  "courseId": "...",
  "lessonId": "...",
  "expectedRevision": 7,
  "analysis": null
}
```

- Selection is a client/context concern, not a build input; the build is always for the whole board at the requested revision.
- `analysis` is optional and must be a validated `CanvasAnalysisResult` for the same board, course, lesson, revision, and snapshot hash.
- The server loads the persisted canvas, rejects stale or cross-scope requests, builds the graph, optionally merges the analysis, persists/indexes it, and returns `{ scene, indexStatus, warnings }`.
- Status codes: `200`, `400 invalid_request`, `404 scope_mismatch`, `409 stale_revision`, `413 payload_too_large`, `502 scene_build_failed`.

### 15.2 Query scene

`POST /api/canvases/:boardId/scene/query`

Request:

```json
{
  "courseId": "...",
  "lessonId": "...",
  "revisionHash": "...",
  "query": "velocity arrow",
  "nodeKinds": ["ocr-item", "scientific-object"],
  "limit": 8
}
```

- Returns `{ nodes, edges, truncated, warnings }`.
- This endpoint is exact-revision only. The CopilotKit `search_canvas_evidence` tool uses `CanvasSceneRetriever` current-course mode instead.
- `limit` is clamped to `[1, 20]`.
- Missing index returns `409 index_unavailable` with `canRebuild: true`.
- Cross-scope access is rejected before any search.

### 15.3 Existing endpoints

- `POST /api/canvases/:boardId/analysis` is unchanged.
- Canvas save is unchanged. The client triggers a scene build after a successful save; a scene build failure does not roll back the save.
- The scene build may be debounced or queued, but the last requested revision must win.

## 16. Client Integration

- `CanvasStudio.tsx` keeps a `sceneGraph` state for the current persisted revision.
- After a successful save, it calls the scene endpoint with the returned revision.
- After a canvas analysis returns, it may call the scene endpoint again with the validated analysis to merge OCR/model observations.
- `useQuickdrawAIBridge` receives the graph and publishes the scene summary through `useAgentContext`.
- The existing proposal flow is unchanged. Proposals reference raw source IDs from `ref`, not scene IDs; the validator checks them against the current board and revision.
- The scene graph is never written into `CanvasDocument`; it is a derived artifact.

## 17. Security and Bounds

- All external input is Zod-validated and strictly bounded.
- Maximum ink records captured: 5,000.
- Maximum retained points per stroke: 512.
- Maximum scene nodes: 10,000.
- Maximum scene edges: 30,000.
- Maximum node text: 2,000 characters.
- Maximum scene context: 6,000 characters.
- Maximum retrieval results: 20 nodes and 40 edges.
- Maximum recognition batch: 32 strokes.
- Maximum recognition candidates: 2 per stroke, 4,000 nodes total.
- Recognition adapter timeout: 2,000 ms; failure is non-fatal.
- No dynamic code execution, no `eval`, no shell commands, no arbitrary URLs.
- FastAPI, if ever used, binds loopback only and is opt-in.
- No secrets in logs; no raw canvas image data in FTS5.
- SQLite queries are parameterized; FTS input is sanitized.
- Canvas mutations still require explicit user approval.

## 18. Observability and Evaluation

Record, without canvas content:

- scene build duration;
- node and edge counts;
- truncation reasons;
- index build duration and status;
- retrieval query duration and result count;
- recognition adapter ID, version, latency, and failure reason;
- stale-revision and scope-mismatch counts.

Evaluation fixtures:

- strokes with missing pressure, all-`0.5` pressure, single-point dots, self-intersections, and dense handwriting;
- boards with overlapping labels, ambiguous OCR associations, and no scientific objects;
- a 10,000-node synthetic graph for the index benchmark;
- stale and cross-scope requests;
- adapter timeout and invalid-output cases.

Success measures for this phase:

- deterministic graph equality across repeated builds;
- zero stale-index reads in tests;
- no unconfirmed label edge becomes a verified assignment;
- p95 spatial query under 5 ms on the benchmark;
- bounded context and bounded scene response.

## 19. Testing

### Unit

- Parse `pts` triplets, missing third values, non-finite values, all-`0.5` pressure, and single-point strokes.
- Normalize bounds, resample, compute features, and rasterize deterministically.
- Insert/query/nearest behavior of the grid, including overflow nodes and tie-breaking.
- Graph node/edge IDs, caps, sorting, and deterministic hashing.
- Zod rejection of oversized arrays, unknown node kinds, invalid edges, and non-finite geometry.
- Baseline recognition returns uncertain candidates and never text; candidates become bounded nodes with `recognizes` edges.
- Analysis mapping skips region-less evidence without fabricating bounds and does not duplicate snapshot evidence.
- FTS query sanitation and both exact and current-course scope filters.
- Revision and snapshot-hash rejection, including rollback exclusion in current-course mode.

### Integration

- Build a scene from a persisted board and assert source refs, counts, and warnings.
- Merge a validated analysis and assert OCR/model nodes are `unconfirmed`; assert region-less evidence is skipped with warnings.
- Reject a stale analysis, stale revision, and cross-scope request; assert current-course retrieval excludes rollback revisions.
- Persist and query a graph; assert stale index is not served.
- Verify `indexStatus: "failed"` does not fail the scene response.
- Verify CopilotKit tool schemas and bounded results.

### Browser

- Draw a stroke, save, build the scene, and confirm the tutor context includes the scene summary.
- Confirm `propose_canvas_action` still requires approval.
- Confirm the scene graph does not alter the canvas document or bypass save revision checks.
- Confirm a scene build failure leaves the saved board usable.

### Build and performance

- `npm test`
- `npm run build`
- `npm run test:e2e` when the environment supports it
- index benchmark at 10,000 nodes
- graph build benchmark at 2,000 strokes

## 20. Rollout Phases

### Phase 0: Contracts and fixtures

Add Zod contracts, fixtures, deterministic hashing, and failing tests. Record the ADR. No runtime behavior changes.

### Phase 1: Capture and index

Add stroke capture, pressure handling, normalization, feature extraction, and the native grid. Expose pure functions with unit tests.

### Phase 2: Scene graph

Add node/edge construction, caps, deterministic ordering, and graph slicing. Build the baseline recognizer and adapter registry.

### Phase 3: Persistence and retrieval

Add SQLite tables, graph persistence, FTS5 indexing, revision lifecycle, and the build/query endpoints.

### Phase 4: CopilotKit

Add the scene summary, `get_canvas_scene`, and `search_canvas_evidence`. Remove the legacy active spatial relationships when the scene graph is present; keep the fallback.

### Phase 5: Optional learned adapter

Add an ONNX or FastAPI adapter behind the fixed interface only after model artifacts, evaluation data, and an ADR exist. This phase is not a prerequisite for Phases 1-4.

## 21. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Pressure is unavailable or synthetic | Mark availability; never invent values; baseline works without it. |
| No timestamps make temporal models misleading | Use order and arc-length features; state the limitation; evaluate under it. |
| Graph explodes on dense boards | Hard caps, nearest-neighbor limits, overflow storage, truncation warnings. |
| OCR associations are treated as labels | `unconfirmed` edges, null confidence, explicit uncertainty reasons. |
| Stale graph is served | Revision hash on every graph; exact queries require it; current-course queries resolve active revisions; 409 on exact mismatch. |
| Index build slows saves | Build is separate and best-effort; save remains authoritative. |
| FTS5 ranking is weak | Deterministic ranking and source refs; Chroma adapter deferred until a proven gap. |
| Native grid misses the target | Benchmark; tune cell size; swap implementation behind the interface. |
| Learned adapter is unavailable | Baseline remains available; adapter failure is a warning, not a blocker. |
| Dirty worktree causes mixed changes | Isolate this work; do not commit unrelated canvas or docs changes. |

## 22. Decisions Left to the Builder

These are implementation calls that do not change the product behavior above:

- exact SQLite DDL, FTS5 tokenizer, and trigger strategy;
- grid cell size and overflow thresholds after benchmark;
- whether the first learned adapter is ONNX or FastAPI, once artifacts exist;
- exact baseline template set and threshold values;
- exact log fields and metrics sink;
- whether scene builds are debounced, queued, or triggered only on save and analysis completion.

Anything that changes the contract, the source-of-truth rule, the retrieval scope rule, or the approval gate must return to the design owner.

## 23. Required ADR

Before implementation, add an ADR covering:

- chosen Approach C and the rejected alternatives;
- native grid versus R-tree;
- SQLite FTS5 versus ChromaDB;
- scene graph as a derived artifact, not a second source of truth;
- how this supersedes the "deferred scene graph" portion of `ADR-2026-11-11-grounded-canvas-regions.md` while preserving its source-linked crop decision.

## 24. Acceptance Criteria

- A persisted board with freehand strokes builds a deterministic, revision-bound scene graph.
- Pressure is retained when present; unavailable pressure is marked and does not break capture.
- No timestamp is synthesized.
- The spatial index answers rect and nearest queries with stable results and meets the benchmark target.
- OCR and model observations appear as unconfirmed nodes/edges with source refs and uncertainty; evidence with no spatial anchor is skipped with a warning rather than given fabricated bounds.
- Recognition candidates are bounded to their strokes, capped, and marked unconfirmed.
- The scene graph is not stored in `CanvasDocument` and cannot be edited by the tutor.
- CopilotKit receives a bounded scene summary and read-only scene tools.
- `propose_canvas_action` remains approval-gated and validates current board IDs/revisions.
- The scene endpoint rejects stale, cross-scope, oversized, and malformed input.
- SQLite FTS5 retrieval is revision-scoped and never serves stale data as current.
- Unit, integration, browser, and build checks pass with failures attributed to code or environment.
- No new runtime dependency is required for the initial implementation.

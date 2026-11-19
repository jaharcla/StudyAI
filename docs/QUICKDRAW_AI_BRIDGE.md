# Quickdraw AI Bridge

This bridge is integrated in `CanvasStudio.tsx`. It uses the Quickdraw store/editor, Zod, and CopilotKit v2 to provide canvas context, read tools, and reviewable action proposals. The user must apply a proposal before it changes the board.

## Exports

- `buildCanvasAIContext(options)` in `src/canvas/ai/canvas-context.ts`
- `canvasActionSchema`, `validateCanvasAction`, `proposeCanvasAction`, `approveCanvasProposal`, `canvasFingerprint` in `src/canvas/ai/canvas-actions.ts`
- `useQuickdrawAIBridge(options)` in `src/canvas/ai/canvas-bridge.ts`

Context includes board/course/lesson scope, selected shapes, visible native shapes, typed text, arrow endpoints, spatial relationships, and nearby structured scientific objects. Raw draw/highlight strokes include point count, bounds, and at most six sampled points; coordinates are not interpreted as scientific handwriting. Text bounds are marked as approximations because Quickdraw's native text-layout helper requires a browser canvas.

Actions allow native geo, arrow, line, text, and note shapes. Updates only allow validated geometry and per-type properties. Every action is Zod parsed, scope checked, and captured against a canonical board fingerprint. Approval rejects changed boards, stale proposals, missing IDs, unsupported shapes, and invalid geometry. Approved mutations use one Quickdraw store transaction, retaining native IDs on updates and using store history for undo/redo. Connections create a native arrow between two shape centers and record both IDs in arrow props.

## CanvasStudio integration

`CanvasStudio` calls `useQuickdrawAIBridge` with the active board, course, lesson, selection, viewport, and structured objects. CopilotKit receives bounded context and exposes `get_canvas_state` and `propose_canvas_action`. The handler records proposals for review; the Apply path checks the authoritative board revision before saving. Stale or cross-board proposals are rejected. Math and scientific-object proposals use their own validated approval paths.

## Canvas recognition

`server/canvas-intelligence/recognition/` adds a Node-native, unconfirmed recognition stage to Canvas Intelligence. It renders each grouped freehand stroke server-side from the persisted snapshot, then runs a deterministic geometry baseline or an ONNX CLIP adapter. Candidates keep their source stroke IDs, bounds, confidence, alternatives, and uncertainty reasons, and enter the evidence bundle with origin `recognition`. They are never treated as model interpretations or verified labels.

- Mode: `CANVAS_RECOGNITION=off|baseline|clip|auto` (code default `baseline`; `.env.example` enables `auto`).
- Model: MIT `onnx-community/CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX`, int8, cached under `CANVAS_MODEL_CACHE` (default `data/models`). No Python runtime.
- Few-shot: `canvas_recognition_examples` stores per-course CLIP embeddings. `POST /api/canvas-recognition/examples` teaches one rendered example; `GET /api/canvas-recognition/examples?course=...` returns label counts.
- Teach from ink: `POST /api/canvases/:boardId/recognition/teach` with `{ courseId, lessonId, strokeIds, label }` renders the persisted stroke group with the same rasterizer used for recognition queries, then embeds it. Scene builds and deep analysis both load the stored prototypes; previously scene builds ignored them.
- Feedback: `POST /api/canvases/:boardId/recognition/feedback` with `{ courseId, lessonId, strokeIds, decision: "accept" | "correct" | "reject", label? }` stores the latest decision per board and stroke group in `canvas_recognition_feedback`. Accept and correct teach a prototype; plain reject suppresses the group's candidates. Confirmed labels appear in the scene as `origin: "user"` / `verificationStatus: "confirmed"`.
- Canvas UI: the **Labels** button opens a review panel. Select freehand strokes on the board to teach a label, then accept, correct, or dismiss recognition candidates; the panel shows taught-label counts.
- Abstain: candidates below `CANVAS_RECOGNITION_MIN_CONFIDENCE` or too close to the runner-up (`CANVAS_RECOGNITION_MIN_MARGIN`) are discarded rather than guessed. The defaults stay at 0.18 / 0.03 until `npx tsx scripts/calibrate-clip-thresholds.ts` replays at least 20 accept and 5 correct/dismiss decisions recorded through the Labels panel and shows a grid cell that beats them by 0.05 balanced accuracy. The script is report-only and prints the sweep table plus the recommendation.
- Failure: a missing model, timeout, or invalid output falls back to the deterministic baseline with a warning. No recognition failure blocks an analysis.

## Canvas scene tools

`useQuickdrawAIBridge` now exposes two read-only scene tools backed by the derived scene graph:

- `get_canvas_scene` — builds the current revision-bound graph and returns at most 24 nodes and 48 incident edges.
- `search_canvas_evidence` — builds the graph, then runs a revision-scoped FTS5 search over node text and returns source-linked nodes plus incident edges. Pass the active `boardId` to search this board; omit it to search every board in the current course whose latest revision has a built scene, and pass `lessonId` to narrow that course search. Course results carry `boardId`, `revisionHash`, and `revision` per hit so stale revisions never surface.

The graph includes freehand strokes, stroke groups, native objects, scientific objects, baseline recognition candidates, validated OCR evidence, and model observations. Recognition and OCR/model nodes are `unconfirmed`; they never become verified labels or mutate the board. The bridge also publishes a bounded scene summary in the agent context.

Server endpoints:

- `POST /api/canvases/:boardId/scene` with `{ courseId, lessonId, expectedRevision }`.
- `POST /api/canvases/:boardId/scene/query` with `{ courseId, lessonId, revisionHash, query, limit }`.
- `POST /api/courses/:courseId/canvas-scene/query` with `{ courseId, query, limit, lessonId?, boardId? }` — current-revision resolution across boards; returns `hits[]`, each with its board, revision, node, and a bounded set of incident edges.
- `POST /api/canvases/:boardId/recognition/teach` with `{ courseId, lessonId, strokeIds, label }`.
- `POST /api/canvases/:boardId/recognition/feedback` with `{ courseId, lessonId, strokeIds, decision, label? }`.

The tutor now receives `get_canvas_scene`, `search_canvas_evidence`, and `propose_scientific_object` as declared frontend tools, and is instructed to cite at most three exact returned source refs. Scientific-object creation goes through the same review-and-apply gate as edits; nothing is added until the user applies the proposal.

The graph is a derived artifact: it is never written into `CanvasDocument`, never mutates the board, and is keyed by the persisted revision hash. `propose_canvas_action` remains the only mutation path and still requires approval.

## Verification

- `npx vitest run tests/canvas-ai-bridge.test.ts`: 6 tests passed.
- `npx tsc -b --pretty false`: passed.

The recorded focused test covers selected/visible context, typed text, arrow and rotated bounds, stroke summaries, nearby objects, size limits, create/update/move/delete/connect, invalid inputs, stale proposals, board isolation, and undo/redo. This is a historical focused result, not a fresh full-checkout verification; see [INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md).

## Limitations

- Handwriting interpretation is not implemented; freehand stroke coordinates are summarized only.
- Text bounds are approximate and do not account for browser-specific glyph metrics or line wrapping.
- Connectors are native arrows with endpoint IDs in metadata; endpoints do not auto-follow later shape moves.
- Image creation, arbitrary Quickdraw props, cross-board edits, and automatic AI edit execution are unsupported.

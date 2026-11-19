# ADR: Canvas recognition teaching, feedback, and object-creation proposals

Status: accepted and implemented (Phase 3 of the canvas intelligence handoff). Related: `ADR-2026-11-18-node-canvas-recognition.md`, `ADR-2026-11-18-spatial-canvas-scene.md`.

## Decision

Close the recognition learning loop without adding a second source of truth:

1. **Server-authoritative teaching.** `POST /api/canvases/:boardId/recognition/teach` accepts `{ courseId, lessonId, strokeIds, label }`. The server loads the persisted board, extracts the selected ink, renders it with `renderStrokeGroupPng` (the exact rasterizer used for recognition queries), embeds it with the existing CLIP adapter, and stores it through `teachCanvasRecognitionExample`. No client PNG upload, so taught examples cannot diverge from query preprocessing. Bounded to 32 strokes and the existing 80-character label limit.

2. **Feedback is explicit and revision-scoped.** `canvas_recognition_feedback` stores the latest decision per `(course_id, board_id, group_key)`, where `group_key` is the sorted unique Quickdraw stroke IDs. Decisions are `accept`, `reject`, and `correct`. Accept and correct teach a positive prototype for the chosen label; plain reject suppresses the group's candidates. Feedback never mutates `CanvasDocument` and never asserts that a rejected candidate was wrong globally.

3. **Confirmed labels are graph status, not new authority.** The scene contract adds `origin: "user"` and `verificationStatus: "confirmed"`. Accepted candidates keep their bounds/confidence but become confirmed; corrections add a confirmed `user-label` candidate tied to its stroke group by a `recognizes` edge. Rejected groups produce no candidate nodes. Unconfirmed candidates remain visible with their original uncertainty reasons.

4. **Taught prototypes feed scene builds.** `buildCanvasScene` now loads `listCanvasRecognitionPrototypes` and passes them to recognition, matching the deep-analysis producer. Previously prototypes were stored but only used by analysis, so scene candidates ignored teaching.

5. **Object creation reuses the existing validation authority.** `propose_scientific_object` builds a candidate with `createObject`, applies user fields, and validates the full object through `parseCanvasDocument`. It is approval-gated like `propose_canvas_edit`; applying it rechecks board scope, revision, and the serialized object list before appending.

6. **The tutor can actually call scene tools.** `server/agent.ts` declares `get_canvas_scene`, `search_canvas_evidence`, and `propose_scientific_object` as frontend tools when the bridge exposes them. Scene claims must cite at most three exact returned source refs; missing refs are not invented.

## Reuse and alternatives

- Reuse pinned `better-sqlite3`, `zod`, `sharp`, and the existing CLIP adapter/renderer. Add no dependency.
- Reuse `canvas_recognition_examples` for prototypes rather than a new vector store; course-scoped few-shot examples are the intended authority.
- Reject persisting candidate accept/reject inside the derived scene JSON: feedback is input to the next build, and the graph stays rebuildable.
- Reject a global course-wide suppression list: a shape can be valid in one context and wrong in another; feedback is scoped to the board and stroke group.
- Reject client-side render capture for teaching: it would let the UI and the recognizer disagree on rasterization.
- Reject partial object field schemas per kind: `createObject` + `parseCanvasDocument` already encode required fields and cross-references.

## Limits and safety

- Feedback labels are NFKC-normalized, lowercased, whitespace-collapsed, and capped at 80 characters.
- At most 32 source strokes per teach/feedback call; at most 64 source refs per scene node.
- Rejections suppress candidate nodes but do not delete strokes, objects, or analysis evidence.
- Confirmed labels are still not verified scientific claims; they are user-confirmed recognition labels tied to source strokes.
- Object proposals cannot change identity, may not be added without approval, and are rejected when stale or out of scope.
- No raw images are stored by feedback; only the CLIP embedding is stored, as before.

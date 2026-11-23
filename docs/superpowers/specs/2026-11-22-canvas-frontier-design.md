# Canvas Frontier Design — 2026-11-22

Status: direction approved by the human partner on 2026-11-22 (reliability + frontier split). The calls below are the implementer's defaults, correctable at plan review.

## Intent

StudyAI's five canvas goals are met for visualization, canvas Q&A, and tutor edits; the remaining frontier is a mind map that lives on the board and an end-to-end flow that turns course notes into practice questions on the board. Both must work through the same persisted document, scene graph, and approval gate as every other scientific object.

## Goals

1. A mind map is a first-class `ScientificObject`: placeable, inspectable, undoable, source-linkable in the scene graph, creatable by the tutor without a new mutation path.
2. The tutor can answer "make practice questions from this lesson" by drafting questions grounded in retrieved course excerpts, showing citations, then proposing `question` objects the user applies explicitly.
3. No new canvas write path, no new board-interpretation authority, no new dependency.

## Non-goals

- No embedding search, scanned-PDF OCR, multi-user auth, or provider/account changes.
- No `CanvasDocument.version` bump: the new kind is additive and version 1 stays valid.
- No change to the canvas OCR/recognition benchmark baseline.
- No edits to the in-flight canvas-first UI and learning-UI work (`App.tsx`, `src/learning/*`, `src/lab/*`) until those changes land.
- No use of `@xyflow/react` for this feature.

## Anti-goals

- AI-generated questions presented as course fact when no retrieved excerpt supports them.
- A second canvas write path that skips revision checks or the user approval gate.
- Two renderers or two persistence formats for the same board.

## Constraints

- All AGENTS.md invariants apply: one mutation authority, one scene authority, six parts for a new kind (model, registry, validation, evidence mapping, e2e interaction test, benchmark fixture), no OCR caps lowered, no baseline update without explicit request.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`; UI changes get a Playwright DOM assertion.
- Reuse: `ScientificObject` union (`src/canvas/model.ts:29`), `parseCanvasDocument`/`validateObject` (`model.ts:56,72`), `createObject` (`model.ts:209`), `scientificObjectKinds` (`src/canvas/tutor.ts:26`), generic scene mapping (`server/canvas-intelligence/scene/build.ts:157`), `propose_scientific_object` (`server/agent.ts:151`), design-guide tool (`agent.ts:155`), course document search (`GET /api/document-intelligence/search`).

## Approaches

**Mind map**
- A: New `mindmap` kind with internal nodes/edges, molecule-style: one data object, one rendering, one proposal. **Chosen.** Fits the existing composite precedent (`molecule` at `model.ts:32`), the existing generic scene mapping, and the existing approval gate.
- B: An `@xyflow/react` surface over the board. Rejected: a second renderer and persistence authority for the same board; the package is currently unused and would become a parallel path.
- C: Compose `concept` + `relationship` objects. Rejected: no stable grouping/undo unit; N proposals for one map; no guaranteed layout.

**Coursework-grounded practice generation**
- A: A read-only draft tool that retrieves excerpts, drafts questions with citations, and hands them to the model, which calls the existing `propose_scientific_object` once per question. **Chosen.** No new canvas write path or approval UI. Trade-off: one approval per question; acceptable for sets of at most 8.
- B: A batch write tool with new approval UI. Rejected: duplicates the proposal authority and needs a new review surface.
- C: An endpoint that writes objects directly to the board. Rejected: bypasses revision checks and the approval gate.

## Calls left to the builder

- Node layout uses the `teaching-scene.ts:40-43` cell constants as a starting point; exact wrap/spacing is the implementer's call.
- v1 supports whole-object selection, move, inspect, save, and tutor proposals; per-node drag/editing is not in scope.
- If the canonical text returned by `read_design_guide` enumerates object kinds, add the mind map guidance there while locating that text at implementation time.

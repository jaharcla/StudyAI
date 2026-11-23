# ADR: Mind map as a composite ScientificObject kind; practice-authoring deferred to author_board

Date: 2026-11-22
Status: accepted (mindmap part); the practice-generation part is superseded, see below
Related: `docs/superpowers/specs/2026-11-22-canvas-frontier-design.md`, `docs/superpowers/plans/2026-11-22-canvas-frontier.md`, `docs/superpowers/plans/2026-11-22-adaptive-canvas-authoring.md`

## Decision

**Built (this work):** `mindmap` is a new additive `ScientificObject` kind — one persisted data object with internal `nodes`/`edges` (molecule composite precedent), one SVG rendering in `SceneGlyph.tsx`, whole-object interaction in v1, palette placement, `propose_scientific_object` authoring through the unchanged approval-gated path, scene evidence via the existing `scientific-object` mapping with labels folded into `summaryOf`, and a committed benchmark fixture (`tests/fixtures/mindmap-board.json`). `CanvasDocument.version` stays 1; older documents parse untouched.

**Not built (ruling by the partner, 2026-11-22):** this plan's coursework practice-generation task (`draft_practice_from_course` read-only tool + `/api/courses/:courseId/practice/draft`) is superseded by the concurrent workstream's `adaptive-canvas-authoring` design, which compiles one semantic authoring intent into a single reviewable board transaction and additionally solves occupancy/collision, call budgets, and generated-content labelling. Its requirements — citations mandatory against retrieved chunks, count validation 1–8, no canvas write outside the existing approval gate, content marked generated-unverified — are recorded in the frontier plan's Task 3 header so the successor must satisfy them.

## Alternatives considered

- **`@xyflow/react` mind-map surface.** Rejected: a second renderer, second persistence, and second board interpretation for the same canvas; the package remains unused (see deferred minors in the ledger).
- **Composition of `concept` + `relationship` objects.** Rejected: no grouping or undo unit; one approval per object; no guaranteed layout; proposal count scales with map size.
- **New batch-write proposal path.** Rejected: duplicates the approval authority (AGENTS.md single-mutation-path rule).

## Reuse (no new dependency)

| Reused | Source | Version/license |
|---|---|---|
| Object model, validation, persistence | `src/canvas/model.ts`, `server/canvas-persistence` | in-repo |
| Proposal creation/validation | `proposeCanvasObject`/`applyCanvasObjectProposal` (`src/canvas/tutor.ts`) | in-repo |
| Scene graph + FTS evidence | `server/canvas-intelligence/scene/` | in-repo |
| Layout baseline constants | `CELL_WIDTH/GAP_X` values in `src/canvas/ai/teaching-scene.ts` | in-repo |
| Rendering/hit-test/history | `ScientificLayer.tsx` object layer | in-repo |
| Types | zod 4.2.0 (MIT), React 19.2.0 (MIT) | pinned |

## Limits

- No per-node editing, no node dragging, no auto-layout solver in v1 (the successor `author_board` design owns placement quality; the frontier ledger records the xyflow cleanup as a deferred minor).
- Inspector exposes size/position, not node/edge editing; content editing happens by re-proposing or replacing the object.
- Scene text for a mind map is labels joined into the existing ≤2000-char summary; no per-node scene nodes in v1.
- 12 nodes / 16 edges / 120-char labels / 200-char title caps are validation bounds, not guidance.

## Verification

See `docs/verification/2026-11-22-canvas-frontier.md`.

# ADR-2026-11-20 — Ambient board rollups reuse the existing scene context

- Status: Accepted
- Date: 2026-11-20

## Context

PR #10 proposed `server/canvas/cluster-summarizer.ts`, `server/canvas/quadtree.ts`,
`server/canvas/spatial-types.ts` and `src/canvas/layout-solver.ts`. The PR adds six new
files and modifies none, so none of its modules are reachable from the tutor path. The
real path is `buildCanvasSceneGraph` → `buildCanvasSceneAIContext` →
`projectCanvasSceneContext`.

The genuine gap is that `buildCanvasSceneAIContext` slices to `maxNodes: 24` and
`projectCanvasSceneContext` then tells the tutor only that the board is incomplete and
to ask the user to zoom. Nodes omitted by that budget are invisible, so board-wide
questions cannot be answered.

## Decision

Keep the *concept* of an off-viewport / omitted-node rollup, but implement it inside the
existing `CanvasSceneAIContext` rather than importing any PR #10 module. Concretely:

- Add a bounded `ambientClusters` field to `CanvasSceneAIContext`, built from nodes not
  kept in the focused `nodes` slice.
- Project it in `projectCanvasSceneContext` as counts and short labels, with no raw
  coordinates and no omitted node IDs.
- Do not add a new spatial index: `src/canvas/spatial/index.ts` already provides
  `CanvasGridSpatialIndex` with full-AABB queries and overflow handling, and is wired
  into the scene builder. PR #10's quadtree indexes node centers only and is a downgrade.

No new dependency, version, or license is introduced. No persisted Zod schema changes:
`CanvasSceneAIContext` is a plain in-memory type.

## Limits

- At most 6 clusters, 3 sample labels per cluster, 80 characters per label.
- Only `source`/`confirmed` node text becomes a sample label; unconfirmed OCR or
  recognition nodes are counted separately, never presented as facts.
- The whole context stays under the existing `maxChars` clamp (500–6000); ambient
  clusters are dropped before the budget can be exceeded.

## Alternatives considered

1. Merge PR #10 as-is — rejected: no call sites, parallel type system, duplicates the
   existing grid index, and introduces a third board-interpretation authority.
2. Add a viewport parameter to `buildCanvasSceneAIContext` — rejected for now: GitNexus
   upstream impact on `buildTutorCanvasContext` is HIGH (three processes), and grouping
   nodes omitted by the existing budget solves the actual tutor gap without that edit.

## Verification

- Vitest: `tests/canvas-scene-context.test.ts` (rollup totals, evidence discipline,
  character cap) and `tests/tutor-presentation.test.ts` (no coordinates or omitted IDs).
- `/canvas-verify` steps 1–4, including `benchmark:canvas` gate numbers compared with
  `docs/verification/canvas-benchmark-baseline.json`.

# ADR: First semantic concept graph slice reuses the mind-map renderer

Date: 2026-11-24
Status: accepted
Brief: `docs/research/2026-11-24-concept-graph-brief.md`

## Decision

Build a course-level concept graph that is a deterministic projection of the student's own learning records:

- **Nodes** come only from `learning_concepts` rows for the course. Mastery is the latest value in the existing `learning_mastery_evidence` view (BKT from `mastery_updates` and `learning_events`), default `0.1` for a concept with no evidence. The same default and signal are used by `server/recommendations.ts`.
- **Edges** come only from `relationship` objects on saved course canvases, resolved through `concept` objects on the same canvas by `conceptId` (or, when absent, by title within that lesson). A relationship whose endpoints cannot be resolved to real course concepts is omitted. No prerequisite is guessed, and no node or edge is generated.
- **Rendering** is the existing `src/studio/MindMapView.tsx` (React Flow). The view gains optional mastery badges and a practice action; generated Studio mind maps are unchanged because the new fields are optional.
- **Jump to practice** reuses the one Coach target path: a weak concept calls `prepareCoachTarget` with `destination: "study"` and its `conceptId`; `/api/study/ask` honours that concept so the prepared question is the one the student clicked. No new Coach, recommendation list, provider, or board-interpretation authority is added.

## Alternatives considered

- **New `ScientificObject` kind or second graph renderer.** Rejected: AGENTS.md requires all six parts of a kind and one authority per board interpretation; the brief forbids a second graph authority.
- **Generated prerequisites from lesson order or model output.** Rejected: the course-grounding rule forbids unlabelled invented claims, and the brief says omit relationships that are not backed by data.
- **New RAG/provider layer for concept state.** Rejected: `learning_concepts`, `mastery_updates`, and `server/progress.ts` already hold the state; a provider adds latency and a second source of truth.
- **Studio artifact kind `concept-graph`.** Rejected: artifacts are lesson-scoped and generated; the course graph is read-only and needs no generation or acceptance step.

## Reuse (no new dependency)

| Reused | Source | Version / license |
|---|---|---|
| Graph rendering, handles, controls | `@xyflow/react` | 12.10.0 / MIT |
| Icons | `lucide-react` | 0.563.0 / ISC |
| UI runtime | React, React DOM | 19.2.0 / MIT |
| Canvas object parsing (`concept`, `relationship`) | `src/canvas/model.ts` | in-repo |
| Mastery evidence and weak threshold | `server/learning/schema.ts`, `server/learning/bkt.ts`, `server/recommendations.ts` | in-repo |
| Practice preparation | `src/coach/contract.ts`, `src/coach/service.ts`, `server/learning/http.ts` | in-repo |
| Surface styling | `src/studio/studio.css` | in-repo |

No package was added. Versions are pinned in the root `package.json`.

## Limits

- Edges are read from saved `canvases.document` only; canvas documents inside `learning_events` are not merged in this slice.
- The existing mind-map depth layout is used; no new auto-layout solver.
- A concept without a reviewed question has no practice action. It still renders with its honest default mastery.
- The graph is read-only. Editing concepts or relationships stays on the canvas and in the learning flows that created them.

## Verification

- Unit tests in `tests/concept-graph.test.ts` assemble a graph from seeded learning records and canvas objects.
- Playwright DOM assertions in `tests/e2e/concept-graph.spec.ts` check rendered nodes, mastery text against the API, a canvas-backed edge, and the weak-concept practice jump.
- `npm run verify` output and screenshots are reported in the thread; provider-dependent failures are named separately.

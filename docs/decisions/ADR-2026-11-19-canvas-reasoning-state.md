# ADR-2026-11-19 — Sequential canvas reasoning state for large boards

- Status: Accepted; implementation landed (`f285ea6`…`0066475`, `7d59432`, `9896a57`)
- Verification: [2026-11-19-canvas-reasoning-state.md](../verification/2026-11-19-canvas-reasoning-state.md)
- Supersedes: the single-call large-board fallback in `server/agent.ts`

## Context

A single large prompt over the saved board failed on Board 1: the whole board was serialized
into one context, so question-relevant evidence competed with unrelated regions and the
model answered "no molecule" when a molecule was present elsewhere on the board. Smaller
boards did not have this problem, and inflating the prompt budget traded one failure for
higher cost and latency.

The project already owned the ingredients for a better path: a revision-bound saved board,
a compact shape context, arrow attachments, the scene graph under
`server/canvas-intelligence/scene/`, and OCR evidence. What was missing was a way to read
them incrementally and keep a coherent, revision-bound understanding.

## Decision

Replace the single oversized prompt with a sequential blackboard loop owned by
`server/canvas-reasoning/`:

1. `chunks.ts` builds deterministic, question-ranked chunks from the saved board's shapes,
   objects, and attachments. No model is involved in chunk construction.
2. `state.ts` merges strict JSON deltas into a bounded state. Identity is deterministic;
   evidence IDs outside a chunk are dropped; contradictions are recorded, never silently
   overwritten; caps are 100 entities, 200 claims, 32 contradictions, 32 unresolved items,
   40 KB serialized.
3. `service.ts` runs passes sequentially (default maximum 6), covering question-relevant
   chunks first and stopping early when all relevant chunks are covered and no critical
   item remains unresolved. The final answer context is a compact projection of the state,
   not the raw board.
4. `server/agent.ts` runs the pre-pass only for large boards (`CANVAS_REASONING_MODE=auto`:
   more than 40 shapes, or a truncated shape context). Small boards keep the single-call
   path. Failure, malformed JSON after repair, or exhausted budget falls back to the existing
   context with an explicit warning.

The saved board revision is authoritative: every pass is bound to `revisionHash`, and a
changed revision aborts the run. Observed, inferred, user-confirmed, and contradicted claims
remain distinct.

## Why not the alternatives

- **Map-reduce over chunks in parallel:** each pass needs the accumulated state; parallel
  calls would produce conflicting claims with no ordering rule, and local models queue the
  calls anyway.
- **Manual region selection:** hard-coded regions do not generalize and would duplicate the
  geometric clustering already present in the scene builder.
- **Persisting board understanding:** explicitly a non-goal. It would introduce a second
  authority that could drift from the revision-bound scene graph.

## Consequences

- Large-board answers are grounded in cited chunk source IDs, and a later chunk can revise
  an earlier claim while preserving both in the contradiction record.
- Calls, latency, and prompt tokens scale with the number of relevant chunks; the early-exit
  rule and the 6-pass cap bound them.
- The tutor depends on the model returning parseable JSON deltas. A repair retry handles one
  malformed response; `7d59432` also recovers JSON embedded in thinking blocks or prose.
- Cross-chunk relations remain limited, and small local models may under-report claims.
  There is no persisted understanding across revisions.

## Verification outcome

Real-board runs on the two reproducible questions, the full unit suite (390 passed), and
the canvas benchmark gate (exit 0; 4 exact, F1 0.951, PhysAlign 0.875, 0 hard failures) are
recorded in the verification document. The molecule question under-reported bonds (one
claim instead of four), and the Board 2 orbit question could not be reproduced because its
saved document was cleared. Both are open gaps, not passing claims.

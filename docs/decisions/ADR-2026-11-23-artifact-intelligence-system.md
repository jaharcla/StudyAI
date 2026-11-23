# ADR-2026-11-23 — Artifact Intelligence System boundary

Date: 2026-11-23
Status: accepted (owner approval recorded before Phase 2 opened; reaffirmed 2026-11-23 when the quality-gate thresholds were frozen in `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`)
Baseline: `main` at `d0b4398`; plan `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`; design `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`; response-quality acceptance criteria `docs/superpowers/specs/2026-11-23-response-quality-acceptance.md`.

## Decision

1. **One composition authority.** A single shared composition format (`ArtifactPackage`, in `src/artifacts/` for client and server) is the only place that decides what artifact components exist and how they relate. Canvas keeps `src/canvas/ai/teaching-scene.ts` as its authoring compiler; Studio keeps `server/studio/service.ts`; Learning keeps `server/learning/activities/capabilities.ts`. Each renderer compiles only the component kinds it owns. No component is rendered twice.
2. **Intelligence never reads or writes a board.** `server/artifact-intelligence/` owns composition, provenance records and validation dispatch. It receives occupancy, anchors and viewport as arguments from the existing Canvas authorities (`src/canvas/ai/layout.ts`), and emits component graphs. It makes zero calls to `server/canvas-persistence`, board reads, or `parseCanvasDocument`. No third board-interpretation path joins `server/canvas-intelligence/scene/` or `server/canvas-analysis/`.
3. **Claim-level provenance is additive and optional.** `provenance.claims?: ClaimProvenance[]` is an optional field on authored `ScientificObject`s and Studio content components. `CanvasDocument.version` stays `1`; `validateObject` already ignores unknown keys. A load-old-shape test is still mandatory whenever the field is introduced. `relationship: "direct"` requires `excerpt` to be substring-contained in the retrieved chunk for `sourceRef`; interpretation and extension are permitted but labelled; `unresolved-conflict` blocks "course fact" presentation.
4. **Bounded repair.** A validation failure produces a structured report (`componentId`, `validator`, `problems[]`, `requestedCorrection`, preserve-list) that the model can act on. Normally one generation call; at most one repair call, only on failure. `TUTOR_MAX_PROVIDER_CALLS ?? 3` stays in force (normal ≤2, worst case ≤3). Raising the cap requires its own ADR with measurement.
5. **No new `ScientificObject` kind.** The six-part rule (model type, registry entry, validation rule, evidence mapping, e2e test, benchmark fixture) is not triggered: the design extends existing kinds with optional provenance metadata only.
6. **Routing hints are advisory until measured.** `author_board` stays force-bound; retrieval relevance remains the model's call per `ADR-2026-11-22-tutor-retrieval-judgement.md`. A read-only capability/context discovery tool may be added. `recommendedToolsForQuery` is deleted only after a route-correctness measurement gate is fixed *before* seeing numbers and the local-model regression gate passes.
7. **Measurement gate for review reduction.** Auto-apply is permitted only for additive, planner-placed, deterministically validated, fully reversible packages; anything touching student-made content still requires approval. The gate is fixed in this ADR before any Phase 4 numbers are seen.

## Alternatives considered

| Option | Verdict |
|---|---|
| Extend `ArtifactBrief` with more `kind` values and per-kind payloads as the end state | Rejected: Canvas-only renderer cannot express Studio guides/summaries or Learning interactive exercises without inventing new object kinds. Retained as the Phase 1 step only. |
| Give Canvas, Studio and Learning their own composition formats | Rejected: three validation implementations, three provenance implementations, three LLM schemas — the duplication the owner called out. |
| Intelligence service that reads boards itself and writes compiled objects directly | Rejected: becomes a third interpretation authority and bypasses `server/canvas-persistence` mutation invariants. |
| Top-level-await or async compiler to make graph sampling use `compileExpression` | Deferred: `compileArtifactBrief`, `proposeArtifactBrief` and `applyArtifactBriefProposal` are synchronous contracts used by Canvas UI and e2e specs; changing them would break Task 1.2's unchanged-signature requirement. Use a synchronous, bounded mathjs evaluation for sampled points, matching `compileExpression`'s accepted grammar. |

## Exact versions and licenses

- TypeScript 5.9, Zod 4.6, React 19, LangGraph/LangChain 1.x, Vitest 3, Playwright 1.56 (all already pinned in `package.json`).
- `mathjs@15.2.0` (`mathjs/number`, MIT) — confirmed installed; `mathjs/number` exports `types: ./types/index.d.ts`, `import: ./lib/esm/number.js`, `require: ./lib/cjs/number.js` from `node_modules/mathjs/package.json`.
- No new runtime dependency is introduced by Phase 1.

## Limits and non-goals

- No new scientific-object kind; no version bump; no lowering of OCR region caps, provider budgets or recognition confidence thresholds.
- No cloud-provider spend for benchmarks or blind comparisons without explicit owner approval. This worktree's `.env` contains no cloud keys; the canvas benchmark therefore runs in a degraded, local-only mode and its numbers are reported as such, not used to move a baseline.
- Pedagogical correctness is never claimed from a citation, a geometry check or a second model's rating; it is measured by the Phase 3 quality benchmark with human blind review.

## Verification

- Phase 0 baseline: `docs/verification/2026-11-23-artifact-baseline.md` quotes `npm run verify`, the four underlying `/canvas-verify` commands, and `npm run benchmark:canvas` (local-only, no cloud keys).
- Every phase handoff quotes `npm run verify` and, for prompt/model/provider changes, the four `benchmark:canvas` gate numbers against `docs/verification/canvas-benchmark-baseline.json` — **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75** — without `--update-baseline`.
- Graph-first: `gitnexus impact` before editing existing functions; `detect_changes({scope:"all"})` before every commit, re-run until `{partial:false, truncated:false}`.

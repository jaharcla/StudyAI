# ADR: Triage of the external "Deep Architectural Audit v3.2.0"

Date: 2026-11-19

Status: review complete; all six proposals rejected. No source changes made.

## Decision

The external audit (`deep_architectural_audit.md`, `advanced_pipeline_module.ts`, `docker_compose_configuration.md`) is not implemented. Three of its six subsystems would duplicate working code, two are speculative, and the supplied module contains an untrusted-input execution defect that violates the engine reuse policy. The audit's own "Fully Wired" status matrix is inaccurate against this repository.

The salvageable ideas are recorded below so this is not re-litigated without new evidence.

## Context

The audit proposes replacing six subsystems. Each was checked against the current tree before any code was considered.

| Audit claim | Verified reality |
| --- | --- |
| Canvas grouping is "spatial overlap only" | Accurate in the narrow sense: `src/canvas/ocr-regions.ts:19-30` groups by `rectGap <= gapThreshold` (default 24). It is one input to a larger pipeline, not the whole interpretation path. |
| Symbolic/chemistry checks are "LLM string heuristics" | False. `server/science-tools.ts:22-58` already calls `compileExpression` (mathjs) and `validateWithOpenChemLib` (openchemlib). `package.json:38-40` pins `mathjs 15.2.0`, `openchemlib 9.25.2`, `mathlive 0.111.4`. |
| Covers "simple tail truncation" | False. `server/tutor-context.ts` implements `budgetTutorContext()` with per-model limits (`TUTOR_MODEL_CONTEXT_LIMITS`), a canvas sub-budget, a protected latest user turn, and typed `TutorContextBudgetError` diagnostics. |
| Canvas sync resends full snapshots | False. `server/canvas-analysis/producer.ts:52-56` rejects any analysis whose `expectedRevision` differs from the persisted board. |
| BKT is a static 4-parameter model | Accurate. `server/learning/bkt.ts` uses fixed `pGuess`/`pSlip`; wired at `server/learning/activities/service.ts:194`. |
| Docker/Ollama services | No `Dockerfile`, `docker-compose.yml`, or `compose.yaml` exists in the repository. |

## Alternatives considered

- **Incremental delta protocol (`CanvasDeltaProducer`)** — rejected. It introduces a second `Map<canvasId, CanvasState>` authority over board state, which conflicts with the one-authority rule; the revision guard already prevents stale-write and re-send classes of bug. Its `mergeOverlappingBounds` also unions every dirty box into one, defeating the optimization it is named for.
- **ST-DBSCAN stroke clustering** — rejected as supplied. `clusterStrokes` (`advanced_pipeline_module.ts:170-196`) is one-hop greedy neighbour expansion, not density clustering; it assigns `Math.random()` cluster IDs, which breaks stable region identity across revisions; and its Hausdorff metric is O(n²·p²), approximately 2.5×10⁹ distance computations for 200 strokes × 80 points.
- **Hybrid BKT+IRT** — deferred. Item difficulty (`beta`) and discrimination (`alpha`) must be calibrated against response data, which does not exist yet. Shipping fixed defaults of `0.5`/`1.2` would relabel the current model without adding information.
- **Prioritized context compressor** — rejected. Strictly less capable than `budgetTutorContext()`: no model limits, no protected latest turn, and its "system is never evicted" property is asserted but not enforced, since a weight of 10.0 still decays.
- **Symbolic equivalence tool** — rejected for now under YAGNI. Grading is deterministic multiple-choice: `learning.submit` compares `choiceId` to a stored `correctChoice` (`tests/learning.test.ts:51`). No free-form answer path exists, so an equivalence checker would have no consumer.
- **Docker/Ollama deployment** — rejected as out of scope; the project does not containerize.

## Consequences

- The audit's module is not adopted. Its `SymbolicMathASTEngine` must not be merged in any form: `evaluateSimple` (`advanced_pipeline_module.ts:427`) executes student input through `Function(...)`, and `checkSymbolicEquivalence` (404-421) returns `true` when every sample evaluation fails, so unparseable answers would grade as correct. `parseToAST` (383-399) returns a hardcoded `x + 1` for any multi-token input.
- Existing deterministic math and chemistry verification paths stay the single authority.
- If free-form algebraic answers are added later, extend `src/canvas/expressions.ts` with `simplify`/`symbolicEqual` and bounded parsing rather than introducing a new engine.
- If skill-difficulty adaptivity is added later, calibrate item parameters first, then extend `server/learning/bkt.ts` in place.

## Rollback

Not applicable; this decision changes no source file.

## Evidence

- File and line references above were checked directly against the working tree on 2026-11-19.
- No `npm run verify` run is associated with this ADR because no source, schema, or test file changed.
- Benchmark gates were not re-run for the same reason.

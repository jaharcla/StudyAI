# Design: StudyAI as an artifact-construction environment

Date: 2026-11-23
Status: design record for the plan at `../plans/2026-11-23-artifact-intelligence-system.md`
Source: workspace owner's vision (2026-11-23), grounded against `main` at `f1b53b4` / shipped `author_board` at `4961dbb`

## Intent

StudyAI should not be a prompt→content generator. It should understand what a student is trying to learn, choose the composition of artifacts that would help, build them from the student's actual course material, inspect the result, and present something genuinely useful. Artifacts are products of reasoning, not products of prompts.

## What is already true in this tree (evidence, not aspiration)

The owner's "PR #17 foundation" is shipped, not proposed. Evidence:

- `author_board` single verb, `ArtifactBrief`, one review transaction: commits `6049227`, `efd377e`, `c5eeb7c`, `a89ca15`, `4961dbb`; ADR `docs/decisions/ADR-2026-11-22-author-board-verb.md`; docs `STATUS.md:16`, `next.md:11`.
- Schema and compiler: `artifactBriefSchema` / `compileArtifactBrief` in `src/canvas/ai/teaching-scene.ts:125-274`; proposal/apply in `src/canvas/tutor.ts:159-207`.
- Server-side citation containment and forced `author_board` binding: `server/agent.ts:161-162`, `:278-292`, `:367-378`.
- Layout authority: `src/canvas/ai/layout.ts` (`planLayout`, `objectOccupancy`); no model coordinates in the brief.
- Composition corpus: `tests/fixtures/canvas-authoring-tasks.ts` (3 tasks), `tests/canvas-authoring-metrics.test.ts`.
- Three content systems that must not be replaced: `ScientificObject` (`src/canvas/model.ts:33-49`), `StudioArtifact` (`server/studio/contracts.ts:3-77`), Learning activities + deterministic checker registry (`server/learning/activities/capabilities.ts:57-121`).
- Deterministic scientific validation already present: FBD analysis (`src/canvas/physics.ts:77+`), expression/math-workspace evaluation (`src/canvas/expressions.ts`, `src/canvas/math-workspace.ts`), molecule validation (`src/canvas/model.ts:90-101`), activity checkers (`capabilities.ts:127+`), geometry (`planLayout`).
- Provenance today is object-level only: `ObjectProvenance = { status: "generated-unverified"; sourceRefs: string[] }` (`src/canvas/model.ts:29-31`). There is no claim-level record, excerpt, or support/extension/conflict classification.
- Call budget is enforced at `TUTOR_MAX_PROVIDER_CALLS ?? 3` (`server/tutor-provider.ts:34`, enforced `server/agent.ts:307`); normal path 1–2 calls.
- Canvas baseline to defend: `docs/verification/canvas-benchmark-baseline.json` — 0 hard failures, 4/6 math exact, 0.91 F1, 0.75 PhysAlign coverage.
- `/canvas-verify` is not present as a command in this worktree; the underlying commands are `tsc -b`, `vitest run`, Playwright, and `benchmark:canvas` (per `docs/decisions/ADR-2026-11-20-provider-operations.md:35`).

### Gaps found in the shipped foundation

1. `artifact.kind` does not determine the output. `compileArtifactBrief` (`teaching-scene.ts:203-264`) always emits `count` question objects plus an optional figure, for all five advertised kinds.
2. `problem-set` repeats one prompt N times (`tests/fixtures/canvas-authoring-tasks.ts:39-45` expects 8 identical questions).
3. Three advertised figure kinds are stubs: `graph` falls through to an `equation` object; `vector` is hardcoded `[1,0,0]`; `anatomy` uses the figure title as `structureId`; `equation` uses the title as the LaTeX expression (`teaching-scene.ts:244-263`).
4. No validator is called on generated content besides schema shape, id collision, and `parseCanvasDocument`. Physics, expression and geometry authorities exist but are not wired into authoring.
5. `sourceRefs` are filtered for *containment* (server/agent.ts:370-378), not for whether any generated claim is supported by the retrieved excerpt.
6. Routing is regex-selected (`recommendedToolsForQuery`); `author_board` is force-included but lower-level tools can still be hidden from a model that later needs them (`server/agent.ts:278-292`).
7. The existing corpus measures compilation, placement and persistence; it does not measure intent fidelity, factual correctness, course grounding, pedagogy, visual or interaction quality.

## Goals

1. A compositional `ArtifactPackage` whose components are strongly typed and individually validated, with the model choosing the composition.
2. Claim-level provenance that distinguishes source-supported statements from interpretations, extensions and unresolved conflicts.
3. A hard separation between intelligence (semantic structures) and rendering (Canvas, Studio, Learning), with **one** shared composition format and no new board-interpretation authority.
4. A bounded construct→inspect→revise loop: deterministic validators return structured errors the model can act on; normally one generation call, one repair call only when needed.
5. Deterministic validation that reuses the scientific authorities already in the repo, plus evidence/quality review for what determinism cannot establish.
6. An artifact-quality benchmark with the owner's six weighted dimensions and human-reviewed blind comparisons.
7. Advisory routing so the model can request more context or capability when its first pass is insufficient.

## Non-goals

- Replacing `ScientificObject`, `StudioArtifact` or the Learning activity system.
- A new scientific-object kind for "generated artifact" (would trigger the six-part rule unnecessarily; optional fields on the base are enough).
- An autonomous multi-agent workflow or an unbounded revision loop.
- Raising `TUTOR_MAX_PROVIDER_CALLS` without its own ADR.
- Treating a citation, a deterministic geometry check, or a second model's rating as proof of pedagogical correctness.
- Spending cloud provider credits on benchmark runs without explicit approval.

## Anti-goals

- Another task→tool table that excludes a capability the model discovers it needs.
- Another whole-board interpretation path competing with `server/canvas-intelligence/scene/` and `server/canvas-analysis/`.
- Advertised artifact kinds that silently compile into something else.
- Confidently presenting an unsupported generated claim as course fact.

## Constraints (binding)

- Every canvas mutation bumps `revision` and persists via `server/canvas-persistence`; no direct `canvases.document` writes. One package applies as one revision, fully or not at all.
- `CanvasDocument.version` may change only with a migration in `parseCanvasDocument` plus a test loading the previous shape. `validateObject` ignores unknown keys, so additive optional provenance fields need no version bump; a load-old-shape test is still required.
- A new `ScientificObject` kind requires all six: model type, registry entry, validation rule, evidence mapping, e2e interaction test, benchmark fixture. This design adds **no** new kind.
- No lowering of OCR caps, provider budgets or confidence thresholds without an ADR in `docs/decisions/`.
- Any prompt/model/provider change requires `npm run benchmark:canvas` against the tracked baseline with the four gate numbers quoted. `--update-baseline` only on explicit request.
- UI-visible behaviour needs Playwright DOM assertions. No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make code compile.
- `gitnexus impact` before editing existing functions; `detect_changes` before committing.
- One worktree per agent, unique port quad, isolated e2e data (docs/next.md:36). The shared checkout currently has uncommitted work in `hosted/src/pricing.ts` and `src/lab/MissionControl.tsx` — do not use it for this work.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| Extend `ArtifactBrief` with more `kind` values and per-kind payloads | Smallest diff; keeps Canvas as the only renderer; cannot express Studio guide/summary or Learning interactive exercise without new kinds | Rejected as the end state; fine as the Phase 1 step |
| Add a new `Artifact Intelligence System` service that owns composition and calls all three renderers | Clean separation; risk of becoming a third interpretation authority if it reads boards itself | Accepted **with the boundary below** |
| Give each subsystem its own composition format | No shared validation, three provenance implementations, three LLM tool schemas | Rejected (the duplication the owner called out) |

**Chosen boundary:** the intelligence system owns *composition, provenance records and validation dispatch*. It never reads or interprets a board, and never writes one. It consumes board occupancy/anchors from the existing Canvas authorities and emits component graphs that existing renderers compile. Canvas keeps `src/canvas/ai/teaching-scene.ts` as its authoring compiler; Studio keeps `server/studio/service.ts`; Learning keeps `server/learning/activities/capabilities.ts`.

## The design

### 1. `ArtifactPackage` (in `src/artifacts/contracts.ts`, importable by client and server)

`{ objective, components: ArtifactComponent[], relations: ComponentRelation[], provenance: PackageProvenance, acceptance: { accept | correct | decline } }`.

`ArtifactComponent` is a discriminated union of the ten kinds in the owner's table: `explanation`, `worked-example`, `diagram`, `equation`, `graph`, `question`, `flashcard`, `mind-map`, `interactive-exercise`, `summary`. Each has its own strict schema, its own validator id, and a `sourceRefs` field constrained to refs that were actually retrieved. `relations` connect components (e.g. "example demonstrates explanation", "question tests concept in diagram") and are validated for known endpoints and acyclicity.

This supersedes the five-value `artifact.kind` enum. `ArtifactBrief` remains the Canvas-facing projection so Phase 1 can ship without breaking the existing verb.

### 2. Claim-level provenance

`ClaimProvenance = { claim, sourceRef, excerpt, relationship: "direct" | "interpretation" | "extension" | "unresolved-conflict", confidence? }`.

Stored as an optional additive field on authored objects (`provenance.claims?: ClaimProvenance[]`) and on Studio content components. A claim with `relationship: "direct"` must contain an excerpt that is substring-contained in the retrieved chunk for its `sourceRef`; `interpretation`/`extension` are allowed but must be labelled; `unresolved-conflict` blocks presentation as course fact. The model may explain in its own words; it may not silently promote an inference to a course fact.

### 3. Compilation contract

`compilePackage(pkg, context) → { canvas?: CompiledArtifact[], studio?: StudioArtifact[], learning?: ActivitySpec[], report: ArtifactValidationReport }`.

Each renderer compiles only the component kinds it owns. One package produces one acceptance decision and, on Canvas, one revision / one undo step / one review dialog.

### 4. Bounded construction loop

1. Model emits one `ArtifactPackage` from intent + retrieved evidence.
2. Deterministic validators run; failures become `ArtifactValidationReport` entries of the shape `{ componentId, validator, problems[], requestedCorrection }` with an explicit preserve-list (unaffected components and citations).
3. On failure only, one repair call returns a corrected package. Worst case 3 provider calls including retrieval. No cap raise without ADR.
4. Evidence review compares claim excerpts to retrieved chunks; pedagogy is *not* claimed as proven by this pass — it is measured by the benchmark with human blind review.

### 5. Validation registry (delegation, not new evaluators)

| Component | Authority reused |
|---|---|
| Equation / expression | `src/canvas/expressions.ts`, mathjs, MathLive notation |
| Graph | expression evaluator + sampled points + range consistency |
| Vector / force | `src/canvas/physics.ts` (`analyzePhysicsFreeBodyDiagram`) + magnitude/unit checks |
| Molecule / chemistry | `src/canvas/model.ts` molecule validation + formal-charge logic (openchemlib where already used) |
| Mind map | nodes/edges schema + connectivity + source grounding |
| Question / flashcard | prompt-answer consistency, ambiguity flags, source support |
| Diagram / placement | `planLayout` overlap/separation/conflict, labels, relationship consistency |

### 6. Advisory routing

Keep capability hints but make them advisory: retrieval relevance stays the model's call (already done in `ADR-2026-11-22-tutor-retrieval-judgement.md`), add a read-only capability/context discovery tool, keep `author_board` bound, and measure route correctness before deleting `recommendedToolsForQuery`. A model that says "my evidence is insufficient" must be able to request another retrieval without a new verb.

## Verification strategy

- Existing gates: `npm run verify`, the underlying `/canvas-verify` commands, `npm run benchmark:canvas` with four quoted numbers.
- New gate: `npm run benchmark:artifacts` with four scenarios (documented request / ambiguous request / multi-component torque package / insufficient source) across supported providers, scored intent fidelity 20%, factual correctness 25%, course grounding 20%, pedagogy 20%, visual quality 10%, interaction quality 5%. Human-reviewed examples and blind comparisons, not model-on-model ratings.
- Telemetry: accept / correct / decline rates, most-corrected component, post-use performance. Learning impact outranks visual impressiveness.

## What is left to the builder

Exact files, interfaces, test names and commands are in the plan. Decisions left open there: whether raising the 3-call cap is needed after measurement (ADR required), and whether Phase 4's per-provider routing deletion passes the local-model regression gate.

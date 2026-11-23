# StudyAI Artifact Intelligence System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped `author_board` verb into an artifact-construction environment: compositional packages, claim-level provenance, deterministic validation with a bounded repair loop, a quality benchmark, and advisory routing.

**Architecture:** A shared composition format in `src/artifacts/` is consumed by three existing renderers (Canvas compiler, Studio contracts, Learning capability registry). A server-side orchestrator in `server/artifact-intelligence/` emits packages from LLM output, runs deterministic validators that reuse existing scientific authorities, and returns structured repair reports on failure. No new board-interpretation authority and no new `ScientificObject` kind.

**Tech Stack:** TypeScript 5.9, Zod 4.6, React 19, LangGraph/LangChain 1.x, Vitest 3, Playwright 1.56, mathjs 15 / MathLive, openchemlib, existing `planLayout` and FBD analyser.

**Spec:** `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`

## Global Constraints

- Work from a fresh worktree (one per agent, unique port quad, isolated e2e data — `docs/next.md:36`). The shared checkout has uncommitted work in `hosted/src/pricing.ts` and `src/lab/MissionControl.tsx`; never use it for this plan.
- Every canvas mutation bumps `revision` and persists via `server/canvas-persistence`. No direct `canvases.document` writes. One package = one revision, one undo step, one review dialog.
- `CanvasDocument.version` stays `1`. `validateObject` in `src/canvas/model.ts:77+` ignores unknown keys, so additive optional provenance fields need no migration; a test loading a pre-change shape is still mandatory.
- New `ScientificObject` kind requires all six (model type, registry entry, validation rule, evidence mapping, e2e test, benchmark fixture). This plan adds no new kind.
- Do not lower OCR region caps, provider budgets, or recognition confidence thresholds without an ADR in `docs/decisions/`.
- `TUTOR_MAX_PROVIDER_CALLS ?? 3` (`server/tutor-provider.ts:34`) stays in force. Normal path ≤2 calls, worst case ≤3. Raising it needs its own ADR.
- Any prompt/model/provider change requires `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json`, quoting the four gate numbers verbatim: **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75**. `--update-baseline` only on explicit request.
- `npm run verify` (`tsc -b && vitest run && playwright test`) output must be quoted in each phase handoff. If `.bin` shims churn, use the direct entrypoints in `docs/next.md:40`.
- `/canvas-verify` is not installed in this worktree; report it as "not run — command absent" and run its four underlying commands instead (`tsc -b`, `vitest run`, Playwright canvas specs, `benchmark:canvas`).
- UI-visible behaviour needs Playwright DOM assertions. No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make code compile.
- Graph-first: `gitnexus impact({target, direction:"upstream"})` before editing existing functions; `detect_changes({scope:"all"})` before every commit. Treat `risk: UNKNOWN` as unresolved and confirm with text search.
- No cloud-provider spend for benchmarks or blind comparisons without explicit user approval. Local Ollama runs are the default.

## Review Focus

These are the inputs most likely to break a person using this software that a compilation-only corpus will not catch. Each line gets its test in the owning task.

1. A brief advertises `kind: "graph"` or a `vector` figure and gets an equation object or a hardcoded `[1,0,0]` arrow — Task 1.4 asserts the concrete object kind and computed fields for every advertised kind.
2. A `problem-set` of 8 returns the same prompt eight times — Task 1.3 asserts per-item prompts are distinct and each item carries its own citation.
3. A cited claim whose excerpt is not in the retrieved chunk is presented as course fact — Task 2.3 asserts `relationship: "direct"` requires substring containment and that a failed claim is downgraded to `needs-review`, never `verified`.
4. A repair call changes a component the error report told it to preserve (question text or citation) — Task 3.3 asserts the preserve-list survives the repair and a violation is rejected, not silently accepted.
5. A request with insufficient course material produces a confident artifact instead of an acknowledgement — Task 4.2's scenario 4 asserts a `needs-review`/`insufficient-evidence` outcome, and the benchmark scores it under course grounding.

---

## Phase 0 — Establish the real baseline (no product code)

**Files:** Create `docs/verification/2026-11-23-artifact-baseline.md`. No product files.

- [ ] **Step 1: Create the worktree and record its identity.** Use the harness worktree facility; do not reuse `work/adaptive-canvas-authoring` or `work/canvas-pen-ux` (`docs/next.md:3`). Record branch, HEAD, port quad, and `LANGGRAPH_DEPLOYMENT_URL` in the baseline doc.
- [ ] **Step 2: Run the current gates before touching anything.** Run `npm run verify`; run the four `/canvas-verify` underlying commands; run `npm run benchmark:canvas`. Quote the actual output in the baseline doc, including the two known pre-existing Playwright flakes (`document-intelligence.spec.ts:5`, `integration.spec.ts:4`) rather than hiding them.
- [ ] **Step 3: Record the foundation inventory.** Copy the "gaps found" list from the spec's current-state section into the baseline doc with the file:line evidence, and mark each gap with the task that will close it. This is the acceptance ledger for Phase 1.
- [ ] **Step 4: ADR for the intelligence boundary.** Create `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`: composition authority vs rendering authorities, claim-level provenance as an additive optional field, no version bump, one repair call, no new kind, and the measurement gate for removing routing hints. Committee: owner approves the boundary before Phase 2 opens.
- [ ] **Step 5: Commit the baseline and ADR.** `git add docs/verification/... docs/decisions/... && git commit -m "docs: baseline artifact-construction work against current main"`.

**Phase exit:** baseline doc quoted, ADR accepted, clean worktree.

---

## Phase 1 — Fix the foundation (fully specified; ship independently)

This phase makes the shipped `author_board` honest. It changes no tool name and no schema surface visible to the student.

### Task 1.1 — Make `artifact.kind` determine the compiled output

**Files:**
- Modify: `src/canvas/ai/teaching-scene.ts:172-274`
- Test: `tests/artifact-brief.test.ts`

**Interfaces:**
- Consumes: `ArtifactBrief`, `CompiledArtifact`, `planLayout`, `ScientificObject` (existing).
- Produces: `compileArtifactBrief(input, options): CompiledArtifact` with the same signature; a per-kind dispatch table `compileByKind` internal to the module.

- [ ] **Step 1: Write the failing tests.** In `tests/artifact-brief.test.ts`, add a describe block `describe("artifact.kind dispatch", ...)` with one test per enum value using `artifactBriefSchema.parse({...frictionBrief, artifact: {...frictionBrief.artifact, kind: K}})` and asserting the compiled `objects.map(o => o.kind)` sequence: `question` → `["question"]`; `figure` → figure objects only, no question; `worked-example` → a question object carrying worked steps plus the figure; `deck` → `flashcard` objects (one per count) rather than `question` objects; `problem-set` → `count` question objects (handled fully in Task 1.3).
- [ ] **Step 2: Run them and confirm they fail.** Run `node node_modules/vitest/vitest.mjs run tests/artifact-brief.test.ts -t "artifact.kind dispatch"`. Expected: FAIL — every case currently returns `["question", ...]`.
- [ ] **Step 3: Implement the dispatch.** Keep `compileArtifactBrief` as the single entry point; replace the unconditional question loop and optional figure block in `teaching-scene.ts:203-264` with a `Record<ArtifactBrief["artifact"]["kind"], (ctx) => ScientificObject[]>` built from the existing object constructors. Preserve planner requests, anchor resolution, id-collision checks, generated-unverified branding, and the description string. No new kind, no new tool.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS, including the five existing tests in the file.
- [ ] **Step 5: Commit.** `git add src/canvas/ai/teaching-scene.ts tests/artifact-brief.test.ts && git commit -m "feat(canvas): make artifact.kind determine compiled objects"`.

### Task 1.2 — Inputs, impact and stale-state guard for the changed compiler

**Files:**
- Modify: `src/canvas/tutor.ts:179-207` only if impact requires it; Test: `tests/artifact-brief.test.ts`.

**Interfaces:**
- Consumes: Task 1.1's `compileArtifactBrief`.
- Produces: unchanged `proposeArtifactBrief` / `applyArtifactBriefProposal` signatures.

- [ ] **Step 1: Run impact before editing.** `gitnexus impact({target:"compileArtifactBrief", direction:"upstream"})` (CLI fallback `node .gitnexus/run.cjs impact "compileArtifactBrief" --direction upstream --repo .`). Report callers, processes and risk; a HIGH/CRITICAL risk stops the edit until the owner is told. Confirm any `UNKNOWN` by text search before treating it as safe.
- [ ] **Step 2: Add a regression test for the apply path.** In `tests/artifact-brief.test.ts`, assert that for each of the five kinds `applyArtifactBriefProposal(context, proposeArtifactBrief(context, brief))` returns exactly the compiled objects and that `parseCanvasDocument` accepts the result. Keep the existing stale-revision and stale-board assertions.
- [ ] **Step 3: Apply only the changes impact requires.** Expected: none in `tutor.ts` if the compiler signature is unchanged; any change must be justified in the commit message.
- [ ] **Step 4: Run unit + DOM test.** `node node_modules/vitest/vitest.mjs run tests/artifact-brief.test.ts tests/tutor-author-board.test.ts`; then `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-author-board.spec.ts`. Expected: PASS.
- [ ] **Step 5: Run `detect_changes` and commit.** Expected `{partial:false, truncated:false}`; re-run if not clean.

### Task 1.3 — Distinct problem-set questions

**Files:**
- Modify: `src/canvas/ai/teaching-scene.ts` (schema at `:128-143`), `tests/fixtures/canvas-authoring-tasks.ts:39-45`, `tests/artifact-brief.test.ts`.

**Interfaces:**
- Consumes: Zod 4 `artifactBriefSchema`.
- Produces: optional `artifact.items: Array<{ prompt, answer?, citationLabel?, sourceRef? }>` with max length 8; when absent, `count` keeps working as today for non-`problem-set` kinds.

- [ ] **Step 1: Write the failing test.** Assert: (a) a `problem-set` brief with `items` of length 3 compiles to 3 question objects whose `prompt` values equal those items in order; (b) two items cannot share the same `prompt`; (c) `count` and `items.length` disagree → schema rejects with a clear message, never clamp; (d) a `problem-set` brief without `items` is rejected, so silent duplication becomes impossible.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Extend the schema and compiler.** Add `items` with `.strict()` elements, a `superRefine` enforcing `items.length === count` for `problem-set`, unique prompts, and source refs drawn from the brief's `sourceRefs`. In the compiler, read prompts/answers from `items` when present.
- [ ] **Step 4: Update the fixture.** In `tests/fixtures/canvas-authoring-tasks.ts`, give `problem-set-eight` eight distinct prompts and update `tests/canvas-authoring-metrics.test.ts` to assert `new Set(prompts).size === 8`. Expected: PASS for the corpus.
- [ ] **Step 5: Run the full unit suite and commit.** `npm test`. Expected: all pass; note any pre-existing failure explicitly.

### Task 1.4 — Real graph and vector generation; retire silent stubs

**Files:**
- Modify: `src/canvas/ai/teaching-scene.ts:244-263`; Test: `tests/artifact-brief.test.ts`, `tests/fixtures/canvas-authoring-tasks.ts`.

**Interfaces:**
- Consumes: `ScientificObject` graph/vector variants (`src/canvas/model.ts:38,41`), `compileExpression` / expression evaluator from `src/canvas/expressions.ts`.
- Produces: optional `figure.expression`, `figure.xRange`, `figure.vector: { components: [number,number,number], units?, label? }` on the figure schema; concrete `graph` and `vector` objects.

- [ ] **Step 1: Confirm the third-party API.** Read `src/canvas/expressions.ts` and the installed `mathjs@15.2.0` type/source to cite the exact evaluation entry point used for sampling. Do not write the call from memory.
- [ ] **Step 2: Write failing tests.** Assert a `graph` figure compiles to `kind: "graph"` with `points.length > 1`, `xRange` preserved, and every sampled point matching the evaluator for its x; assert a `vector` figure compiles to `kind: "vector"` with the supplied components and units, not `[1,0,0]`. Add both to `canvasAuthoringTasks` as new expected-kind fixtures.
- [ ] **Step 3: Run them; confirm FAIL** (graph currently emits `equation`, vector emits `[1,0,0]`).
- [ ] **Step 4: Implement the two branches.** Sample the expression deterministically over `xRange`; reject a non-finite sample with a structured error (no partial object). For the vector, validate components are finite and magnitude > 0. Remove the `else` that silently substitutes an equation — an unsupported figure kind must now throw.
- [ ] **Step 5: Run unit + corpus + commit.** Quote the corpus `author_board_composition` console output.

### Task 1.5 — Validation registry for every advertised component

**Files:**
- Create: `src/artifacts/validate.ts`, `src/artifacts/contracts.ts` (minimal first cut: `ArtifactValidationError`, `ValidationReport`, `Validator`).
- Test: `tests/artifact-validation.test.ts` (new).

**Interfaces:**
- Consumes: `src/canvas/physics.ts` (`analyzePhysicsFreeBodyDiagram`), expression evaluator, `planLayout`, `parseCanvasDocument`, Learning `capabilities.ts` checker registry.
- Produces: optional `figure.context: { surfaceAngleDeg?: number; motionDirectionDeg?: number }` on the brief, and `validateCompiled(input: { objects: ScientificObject[]; brief: ArtifactBrief; occupancy; viewport }): ValidationReport` where `ValidationReport = { ok: boolean; problems: Array<{ componentId: string; validator: string; message: string; requestedCorrection: string }> }`.

- [ ] **Step 1: Write failing tests for five validators.** Force diagrams (normal not perpendicular / friction not parallel using a supplied surface angle), equations (non-finite evaluation), graph points vs expression, mind-map connectivity (orphan node), and geometry (overlap or off-board). Each asserts the exact report shape and that `ok:false` carries a `requestedCorrection` string, not a boolean rejection.
- [ ] **Step 2: Run them; confirm FAIL** (module does not exist).
- [ ] **Step 3: Implement `validateCompiled` as a delegating registry.** Each validator is `{ id, appliesTo(object), check(object, ctx): string[] }`. No validator reimplements physics or algebra; all call the existing authorities. Wire it into `proposeArtifactBrief` so a failing report throws with the JSON report attached, and ensure `applyArtifactBriefProposal` remains a no-op on failure.
- [ ] **Step 4: Run unit + e2e.** `npm test`; Playwright `canvas-author-board.spec.ts` with a new assertion that a deliberately invalid brief leaves the board byte-identical and shows the structured problem text in the review panel.
- [ ] **Step 5: Run `detect_changes`, commit, then run `benchmark:canvas`** (no prompt/provider change, so quote the same four numbers and state "unchanged — baseline not updated").

**Phase 1 exit criteria:** all five `artifact.kind` values compile to distinct, correct objects; problem sets are distinct; graph and vector are real; every advertised component has a deterministic validator; the composition corpus still passes; `npm run verify` output quoted; `/canvas-verify` reported as absent with underlying commands run.

---

## Phase 2 — Unified artifact intelligence (charter; expand to TDD steps when Phase 1 lands)

**Files:** Create `src/artifacts/contracts.ts` (extend), `src/artifacts/package.ts`, `src/artifacts/project.ts`, `src/artifacts/provenance.ts`; create `server/artifact-intelligence/service.ts`; modify `server/agent.ts`, `server/studio/contracts.ts` (additive), `server/learning/activities/capabilities.ts` (additive capability exposure only).

**Interfaces:** Consumes Phase 1's `ArtifactBrief`, `CompiledArtifact`, `ValidationReport`. Produces `ArtifactPackage`, `ClaimProvenance`, `compilePackage(pkg, ctx) → { canvas?, studio?, learning?, report }`, `reviewProvenance(pkg, retrievedChunks) → ClaimReview[]`.

- [ ] **Task 2.1 — `ArtifactPackage` typed component registry.** Ten component schemas from the spec; relation endpoints and acyclicity validation. Test: round-trip every component kind, reject an unknown endpoint, reject a cycle.
- [ ] **Task 2.2 — Shared composition projection.** Compile one package into Canvas objects (reuse `compileArtifactBrief`), Studio `StudioArtifact` content (reuse `server/studio/service.ts` generation contracts), and Learning `ActivitySpec` via the capability registry. Test: the torque learning package in the spec yields a Canvas diagram + worked example + question + Studio summary + one interactive exercise, with no component rendered twice.
- [ ] **Task 2.3 — Claim-level provenance.** Implement `ClaimProvenance` as an additive optional field on authored objects and Studio components. `relationship: "direct"` requires substring containment of `excerpt` in the retrieved chunk for `sourceRef`; other relationships are labelled; `unresolved-conflict` blocks "course fact" presentation. Test: direct match passes; inference is labelled; invented ref is downgraded; a pre-change document without `claims` still loads (`CanvasDocument.version` unchanged).
- [ ] **Task 2.4 — One authority boundary test.** Assert the intelligence service makes zero calls to canvas persistence, board reads, or `parseCanvasDocument`; it receives occupancy/anchors as arguments. A violation is a failed test, not a review comment.

**Phase 2 exit:** ADR accepted, Canvas/Studio/Learning each render only their own components, provenance survives a save/reload, and no new board-interpretation path was added.

---

## Phase 3 — Construction and quality loop (charter; expand to TDD steps when Phase 2 lands)

**Files:** Modify `server/agent.ts`, `server/artifact-intelligence/service.ts`; create `tests/tutor-artifact-repair.test.ts`, `scripts/benchmark-artifacts.ts`, `docs/verification/artifact-quality-baseline.json`, `package.json` (`benchmark:artifacts` script).

**Interfaces:** Consumes Phase 2's package and report types. Produces `repairArtifactPackage(pkg, report): ArtifactPackage`, `get_artifact_capabilities` read-only tool, evaluation report.

- [ ] **Task 3.1 — Structured errors to the model.** Convert `ValidationReport` into a tool-result message with `componentId`, `validator`, `problems`, `requestedCorrection`, and the preserve-list. Test: the message names the failing diagram, the three problems in the owner's friction example, and preserves the question and citation.
- [ ] **Task 3.2 — Bounded repair.** One repair call on failure only; enforce ≤2 normal / ≤3 worst-case against `TUTOR_MAX_PROVIDER_CALLS`. Test: a repair that still fails returns `provider_call_limit` honestly instead of silently dropping components; no cap raise without ADR.
- [ ] **Task 3.3 — Preserve-list enforcement.** Diff repaired vs original package; any change to a preserved component or citation is rejected before apply. Test pins this (Review Focus #4).
- [ ] **Task 3.4 — Advisory routing.** Add read-only `get_artifact_capabilities`; keep `author_board` force-bound; measure route correctness before deleting `recommendedToolsForQuery`. Test: a model-facing "I need more course context" path retrieves again without a new verb.
- [ ] **Task 3.5 — Quality benchmark.** Four scenarios from the spec with the six weights (20/25/20/20/10/5), human-reviewed examples and blind comparisons; no model-on-model-only scoring. Test: deterministic scoring harness runs offline on recorded generations; cloud runs require explicit approval.

**Phase 3 exit:** repair loop bounded and measured, benchmark harness green against a committed baseline, prompt/provider changes accompanied by quoted `benchmark:canvas` numbers.

---

## Phase 4 — Adaptive artifact generation (charter; expand to TDD steps when Phase 3 lands)

**Files:** Modify `server/learning/service.ts`, `server/artifact-intelligence/service.ts`, review/telemetry UI.

- [ ] **Task 4.1 — Learning history and knowledge gaps feed composition.** Consume existing BKT state and activity attempts; expose weak objectives to the package composer as context, never as a hardcoded branch. Test: two students with different mastery get different component emphasis for the same request.
- [ ] **Task 4.2 — Insufficient-evidence scenario in the benchmark.** Assert the composer acknowledges missing course material instead of inventing it (Review Focus #5).
- [ ] **Task 4.3 — Feedback loop.** Persist accept / correct / decline and most-corrected component; generate follow-up activities from recorded performance. Test: a corrected diagram lowers that component's auto-accept eligibility; a declined package is not silently regenerated.
- [ ] **Task 4.4 — Risk-tiered review reduction.** Only additive, planner-placed, validated, fully reversible packages may auto-apply; anything touching student-made content still requires approval. Gate: Phase 3's legality is deterministic-clean across repeats and the pedagogy rubric threshold was fixed in the Phase 0 ADR *before* seeing numbers.

**Phase 4 exit:** measured adaptation, no removal of approval without its measurement gate, learning-impact telemetry reported before visual-quality claims.

---

## Sequence and dependencies

- Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4. Each phase ships a working, testable tree and is committed separately.
- Phase 1 is independently valuable: it makes the already-shipped verb tell the truth. If the project stops after Phase 1, nothing advertised is a stub.
- Phases 2–4 are charters by design: their TDD steps depend on Phase 1's final interfaces and must be expanded before execution, not guessed now.
- Parallel-safe tracks while Phase 1 runs: none in product code (the changed compiler is called from `tutor.ts`, `CanvasStudio.tsx`, and the corpus). Baseline docs and the ADR are safe to write concurrently.

## Self-review checklist (run after each phase, not just at the end)

1. Spec coverage: every goal in the design doc points to a task; list gaps in the phase handoff.
2. Step scan: each step lets the implementer write exactly one reasonable thing; no "TBD", no transcript code.
3. Type consistency: `ValidationReport` is the single report name in every phase; `ClaimProvenance` fields identical in Canvas and Studio projections.
4. Review Focus: all five lines pinned by a named task test.
5. Proportion: Phase 1 is implementation-ready; later phases stay charters until opened.

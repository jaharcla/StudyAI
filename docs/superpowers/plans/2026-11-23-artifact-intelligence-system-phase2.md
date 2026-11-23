# Artifact Intelligence System Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed, validated artifact package that compiles once into Canvas, Studio and Learning outputs, with claim-level provenance and a strict intelligence/rendering boundary.

**Architecture:** `src/artifacts/` is the client-and-server-shared composition format and pure projection logic. `server/artifact-intelligence/service.ts` is the only orchestrator: it receives occupancy, anchors, viewport and retrieved evidence as arguments, compiles one Canvas `ArtifactBrief`, one `StudioArtifact` and one `ActivitySpec`, and never reads or writes a board. Existing renderers keep their own compilers.

**Tech Stack:** TypeScript 5.9, Zod 4.6, Vitest 3, existing Canvas/Studio/Learning contracts. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`
**Parent plan / ADR:** `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`, `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`
**Phase 1 interfaces:** `src/artifacts/contracts.ts` (`ValidationReport`, `ValidationProblem`, `ArtifactValidationError`), `src/canvas/ai/teaching-scene.ts` (`ArtifactBrief`, `CompiledArtifact`, `compileArtifactBrief`, `DEFAULT_VIEWPORT`), `src/artifacts/validate.ts` (`validateCompiled`), `src/canvas/tutor.ts` (`proposeArtifactBrief`).

## Global Constraints

- Owner's "continue" (2026-11-23) is the Phase 2 gate approval; the Phase 0 ADR boundary is unchanged. No version bump, no new `ScientificObject` kind, no lowering of OCR caps/provider budgets, `TUTOR_MAX_PROVIDER_CALLS ?? 3` unchanged.
- One package = one Canvas revision, one undo step, one review dialog. `compilePackage` emits exactly one Canvas `ArtifactBrief`.
- The intelligence service makes zero calls to `server/canvas-persistence`, board reads, or `parseCanvasDocument`; it receives occupancy/anchors/viewport as arguments.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, `as never`. UI-visible behavior needs Playwright DOM assertions (none is added in Phase 2; Phase 1's review panel remains the UI).
- Graph-first: `gitnexus impact` before editing existing functions; `detect_changes({scope:"all", worktree})` before every commit, re-run until no `partial`/`truncated` flag. Risk `UNKNOWN` must be confirmed by text search.
- No cloud-provider spend. `npm run benchmark:canvas` cannot produce a meaningful gate in this worktree (Ollama down, no cloud keys); quote the tracked baseline as unchanged.
- Every phase handoff quotes `npm run verify` output; `/canvas-verify` is absent and its underlying commands are run instead.

## Review Focus

1. A package claims two renderers own the same component, or drops one — `projectPackage` must assign every component to exactly one owner; Task 2.2 pins it.
2. A `direct` provenance claim whose excerpt is not in the retrieved chunk is presented as course fact — Task 2.3 pins that it is downgraded to `needs-review`, never `verified`.
3. A relation points at a missing component or creates a cycle — Task 2.1 rejects both at parse time.
4. A package built without retrieved refs still compiles — Task 2.1 rejects unknown `sourceRef`s against the supplied retrieved set, with a clear message.
5. The intelligence service starts reading a board to get occupancy — Task 2.4 fails on a forbidden import.

---

### Task 2.1: `ArtifactPackage` schema and relation validation

**Files:**
- Create: `src/artifacts/package.ts`
- Modify: `src/artifacts/contracts.ts` (extend)
- Test: `tests/artifact-package.test.ts` (new)

**Interfaces:**
- Consumes: Zod 4.6; `src/artifacts/contracts.ts` types.
- Produces: `artifactPackageSchema`, `ArtifactPackage`, `ArtifactComponent`, `ComponentRelation`, `parseArtifactPackage(value: unknown, retrievedRefs: readonly string[]): ArtifactPackage`. Ten component kinds: `explanation`, `worked-example`, `diagram`, `equation`, `graph`, `question`, `flashcard`, `mind-map`, `interactive-exercise`, `summary`. Relation `relation` enum: `tests | demonstrates | explains | summarizes | extends`.

- [ ] **Step 1: Write failing tests.** Assert: (a) a package with one component of each of the ten kinds round-trips through `parseArtifactPackage`; (b) a relation with an endpoint not in `components` is rejected with message matching `unknown endpoint`; (c) a cycle `a→b→a` is rejected matching `cycle`; (d) a component `sourceRef` absent from `retrievedRefs` is rejected matching `not retrieved`; (e) `acceptance` defaults to `pending` and `schemaVersion` is literally `1`.
- [ ] **Step 2:** `node node_modules/vitest/vitest.mjs run tests/artifact-package.test.ts`. Expected: FAIL — module absent.
- [ ] **Step 3: Implement.** Discriminated union on `kind` with `.strict()` component schemas; every component carries `id`, `sourceRefs: string[]`, optional `claims`. Package carries `schemaVersion: 1`, `id`, `objective`, `courseId`, `lessonId`, `components`, `relations`, `provenance`, `acceptance`. `parseArtifactPackage` runs the schema, then checks endpoints and acyclicity (DFS with visiting/visited sets) and `sourceRefs ⊆ retrievedRefs`.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** `gitnexus detect_changes`, commit `feat(artifacts): typed artifact package with validated relations`.

### Task 2.2: One package, three projections, one Canvas revision

**Files:**
- Create: `src/artifacts/project.ts`, `server/artifact-intelligence/service.ts`
- Test: `tests/artifact-projection.test.ts` (new)

**Interfaces:**
- Consumes: Task 2.1's `ArtifactPackage`; Phase 1's `compileArtifactBrief`, `validateCompiled`, `DEFAULT_VIEWPORT`; `server/studio/contracts.ts` `StudioArtifact`; `src/learning/activities/contracts.ts` `ActivitySpecSchema`; `server/learning/activities/capabilities.ts` `defaultActivityCapabilities`, `validateCapabilities`.
- Produces: `projectPackage(pkg): { canvas: string[]; studio: string[]; learning: string[] }`; `compilePackage(pkg, ctx): { canvas?: CompiledArtifact; studio?: StudioArtifact; learning?: ActivitySpec; report: ValidationReport }` where ctx is `{ courseId, lessonId, boardId, occupancy, viewport, anchors, retrievedRefs, retrievedChunks }`. Ownership: Canvas owns `question, worked-example, flashcard, diagram, graph, equation, mind-map`; Studio owns `summary`; Learning owns `interactive-exercise`. `explanation` is Canvas-owned as the prose of the primary brief (it never becomes a second object).

- [ ] **Step 1: Write failing tests.** Fixture `forcePackage`: one `explanation`, one `diagram` (freebody forces), one `worked-example`, one `question`, one `summary`, one `interactive-exercise` (graph-interpretation mode with slope 2, intercept 0, xRange [-1,1], answer at x=1). Assert: (a) `projectPackage` returns every component id in exactly one target list; (b) `compilePackage(...).canvas?.objects.map(o=>o.kind)` equals the Phase 1 kinds for the derived brief, and the report is `ok:true`; (c) `.studio?.content` is a `StudyGuideContent` whose section body comes from the `summary` component; (d) `.learning` passes `ActivitySpecSchema.parse` and `validateCapabilities(spec, defaultActivityCapabilities)`; (e) the same component id never appears in two projections.
- [ ] **Step 2:** Run and confirm FAIL (modules absent).
- [ ] **Step 3: Implement `projectPackage`** as a pure ownership map. `explanation` is folded into the Canvas brief reason only when no question/worked-example exists; otherwise its id is still Canvas-owned and counted once.
- [ ] **Step 4: Implement `compilePackage`.** Canvas: derive one `ArtifactBrief` — questions>1 → `problem-set` with `items`; one question → `question`; else `worked-example`/`deck`/`figure` from the first owned figure component; set `figure` from `diagram`/`graph`/`equation`/`mind-map` (map `diagram`→`freebody`, include `context.surfaceAngleDeg`). Run `validateCompiled` with the supplied occupancy/viewport and attach its report. Studio: build one `StudioArtifact` with `kind:"study-guide"` from `summary` sections. Learning: build one `ActivitySpec` with `schemaVersion:1`, `version:1`, one objective sourced from the first retrieved ref + excerpt (from ctx), a `canvas.linear-graph` artifact, a `math.graph-interpretation` checker, and one task with `assessment.mastery:"none"`. Never call a board API.
- [ ] **Step 5:** Run both unit files plus `tests/artifact-validation.test.ts`. Expected: PASS.
- [ ] **Step 6:** `detect_changes`, commit `feat(artifacts): compile one package into Canvas, Studio and Learning`.

### Task 2.3: Claim-level provenance

**Files:**
- Create: `src/artifacts/provenance.ts`
- Modify: `src/artifacts/contracts.ts` (`ClaimProvenance`, `ClaimReview`)
- Test: `tests/artifact-provenance.test.ts` (new)

**Interfaces:**
- Consumes: Task 2.1's package; retrieved chunks shaped `{ ref: string; text: string }`.
- Produces: `reviewProvenance(pkg, retrievedChunks): ClaimReview[]` where `ClaimReview = { componentId, claim, outcome: "verified" | "needs-review", relationship, reason }`. `ClaimProvenance = { claim, sourceRef, excerpt, relationship: "direct" | "interpretation" | "extension" | "unresolved-conflict", confidence?: number }`. Additive optional `claims?: ClaimProvenance[]` on components; `CanvasDocument.version` stays `1`.

- [ ] **Step 1: Write failing tests.** Assert: (a) `direct` whose `excerpt` is substring-contained in the chunk for `sourceRef` → outcome `verified`; (b) `direct` whose excerpt is absent → `needs-review` (never `verified`) with reason matching `containment`; (c) `interpretation`/`extension` → labelled in `relationship` and `needs-review`; (d) `unresolved-conflict` → `needs-review` and reason matching `conflict`; (e) a pre-change `ScientificObject` with no `claims` still passes `parseCanvasDocument` (`version` unchanged).
- [ ] **Step 2:** Run and confirm FAIL.
- [ ] **Step 3: Implement `reviewProvenance`** as pure string containment against the chunk with matching `ref`; no network, no model calls.
- [ ] **Step 4:** Run unit + `tests/artifact-brief.test.ts`. Expected: PASS.
- [ ] **Step 5:** `detect_changes`, commit `feat(artifacts): claim-level provenance review`.

### Task 2.4: One authority boundary test

**Files:**
- Create: `tests/artifact-boundary.test.ts` (new)
- Modify: `server/artifact-intelligence/service.ts` only if the test finds a violation.

**Interfaces:**
- Consumes: Task 2.2's `compilePackage`.

- [ ] **Step 1: Write failing tests.** Assert: (a) reading the source of `server/artifact-intelligence/service.ts` contains no import of `canvas-persistence`, `server/agent`, `parseCanvasDocument`, or `../canvas/tutor`; (b) `compilePackage` succeeds when ctx supplies occupancy/anchors/viewport and a stubbed retrieved set, with no database or HTTP handle available; (c) the returned report is the same object shape as Phase 1's `ValidationReport`.
- [ ] **Step 2:** Run and confirm FAIL if the import assertion trips.
- [ ] **Step 3:** Adjust `service.ts` to remove any forbidden import (expected: none); do not add a fallback that reads board state.
- [ ] **Step 4:** Run unit suite + `detect_changes`, commit `test(artifacts): pin intelligence/rendering boundary`.

**Phase 2 exit:** ADR boundary holds; Canvas/Studio/Learning each render only their own components; provenance survives save/reload (no version bump); no new board-interpretation path; `npm run verify` output quoted and `benchmark:canvas` baseline reported unchanged.

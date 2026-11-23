# Artifact Intelligence System Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make validation failures model-actionable with a bounded, preserve-safe repair loop, add advisory capability routing, and provide an offline artifact-quality scoring harness whose baseline is honestly gated on human blind review.

**Architecture:** Pure modules in `src/artifacts/` build the repair message and enforce the preserve list; `server/artifact-intelligence/repair.ts` orchestrates at most one repair call under the existing provider cap. `get_artifact_capabilities` is a read-only advisory frontend tool; `author_board` stays the only apply verb. The benchmark harness is deterministic and offline; human pedagogy/visual/interaction labels are required before any overall score is produced.

**Tech Stack:** TypeScript 5.9, Zod 4.6, Vitest 3, existing Canvas/Studio/Learning contracts. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`
**Response bar:** `docs/superpowers/specs/2026-11-23-response-quality-acceptance.md`
**Parent plan / ADR:** `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`, `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`
**Phase 2 interfaces:** `src/artifacts/contracts.ts` (`ValidationReport`, `ValidationProblem`), `src/artifacts/package.ts` (`ArtifactPackage`, `parseArtifactPackage`), `server/artifact-intelligence/service.ts` (`compilePackage`).

## Global Constraints

- No cloud-provider calls and no spend. Ollama is unavailable in this worktree and there are no cloud keys; every test uses injected pure fakes. A human blind-review pass is required before the benchmark produces an overall score — no model-on-model-only scoring, no fabricated ratings.
- `TUTOR_MAX_PROVIDER_CALLS ?? 3` (`server/tutor-provider.ts:34`) stays in force. Normal path ≤2 calls (retrieval + generation), worst case ≤3 (+ one repair). No cap raise without an ADR.
- Keep the Phase 0 ADR boundary: intelligence composes and validates; it never reads or writes a board. No new `ScientificObject` kind, no `CanvasDocument.version` bump, no lowering of OCR caps or recognition thresholds.
- `author_board` stays force-bound and is the only apply path. `recommendedToolsForQuery` is retained; capability hints are advisory. Route correctness must be measured before that hint function is deleted — this phase does not delete it.
- One package = one Canvas revision, one undo step, one review dialog. A repair is rejected before apply if it changes a preserved component or citation.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, `as never`. UI-visible behavior needs a Playwright DOM assertion (none is added here; the existing authoring spec remains the UI gate).
- Graph-first: `gitnexus impact` before editing existing functions; `detect_changes({scope:"all", worktree})` before every commit, re-run until no `partial`/`truncated` flag. Treat `risk: UNKNOWN` as unresolved and confirm with text search.
- `/canvas-verify` is absent; run its underlying commands. `npm run verify` output is quoted in the handoff. `benchmark:canvas` is not a valid gate here (no Ollama/cloud); the tracked baseline is unchanged and its four numbers are quoted verbatim: **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75**.

## Review Focus

1. A repair call changes a preserved question or citation — Task 3.3 asserts the preserve list survives the repair and the change is rejected before apply.
2. A repair that still fails is silently accepted and components are dropped — Task 3.2 asserts an honest `provider_call_limit` outcome, never a partial apply.
3. A structured error leaks internal document/session IDs to the student — Task 3.1 asserts the model-facing result is a report of validators and problems only; the existing student panel stays prose-only.
4. Advisory routing quietly becomes a second apply path — Task 3.4 asserts `get_artifact_capabilities` is read-only and `author_board` remains the sole apply verb.
5. A benchmark reports an overall quality score from model ratings alone — Task 3.5 asserts missing human labels yield `pending-human-review` with no overall score.

---

### Task 3.1: Model-actionable repair message and preserve list

**Files:**
- Create: `src/artifacts/repair-message.ts`
- Test: `tests/artifact-repair-message.test.ts` (new)

**Interfaces:**
- Consumes: `ValidationReport`, `ValidationProblem`, `ArtifactPackage` from `src/artifacts/contracts.ts` / `src/artifacts/package.ts`.
- Produces:
  - `export type PreserveList = { componentIds: string[]; sourceRefs: string[] }`
  - `export function computePreserveList(pkg: ArtifactPackage, report: ValidationReport): PreserveList` — every component id with no problem, plus every distinct `sourceRef` across all components.
  - `export type RepairMessage = { componentId: string; validator: string; problems: string[]; requestedCorrection: string }`
  - `export type RepairResult = { status: "ok" } | { status: "needs_repair"; messages: RepairMessage[]; preserve: PreserveList; text: string }`
  - `export function buildRepairResult(pkg: ArtifactPackage, report: ValidationReport): RepairResult`

Owner's friction example (fixture built directly in the test as a `ValidationReport`, not a compiled board): a package with components `q1` (question, prompt "Which way does friction act?", `sourceRefs: [REF]`) and `d1` (diagram, `sourceRefs: [REF]`). `REF = "studyai://document/module-1/text/4?chunk=0"`. Report has exactly three problems: `{componentId:"d1", validator:"force-diagram", message:"Friction is not parallel to the incline surface."}`, `{componentId:"d1", validator:"force-diagram", message:"Normal force is not perpendicular to the incline surface."}`, `{componentId:"d1", validator:"geometry", message:"Object overlaps existing board content."}`. Each `requestedCorrection` is `Fix the diagram component: <message>`.

- [ ] **Step 1: Write failing tests.** Assert: (a) `buildRepairResult` on an `ok` report returns `{status:"ok"}`; (b) on the friction example returns `status:"needs_repair"`, `messages` has one entry for `d1` under `force-diagram` with two problems and one under `geometry` with one problem; (c) `preserve.componentIds` contains `q1` and not `d1`, `preserve.sourceRefs` equals `[REF]`; (d) `text` names `d1` and all three problem messages, names `q1` and `REF` as preserved, and contains no `doc_`/`sess_`/`chunk_` tokens.
- [ ] **Step 2:** `node node_modules/vitest/vitest.mjs run tests/artifact-repair-message.test.ts`. Expected: FAIL — module absent.
- [ ] **Step 3: Implement.** Group problems by `(componentId, validator)` preserving first-seen order; `text` is a bounded prose summary (no object ids beyond the component id, no JSON serialization). `computePreserveList` excludes any component id that appears in `report.problems`.
- [ ] **Step 4:** Same command. Expected: PASS. Run `node node_modules/typescript/bin/tsc -b` → exit 0.
- [ ] **Step 5:** `detect_changes`, commit `feat(artifacts): structured repair message and preserve list`.

### Task 3.2: Bounded repair orchestrator

**Files:**
- Create: `server/artifact-intelligence/repair.ts`
- Test: `tests/artifact-repair.test.ts` (new)

**Interfaces:**
- Consumes: Task 3.1's `RepairResult`, `PreserveList`, `buildRepairResult`; `ArtifactPackage`, `ValidationReport`; `getTutorProviderSettings` from `server/tutor-provider.ts` for the cap default.
- Produces:
  - `export type RepairOutcome = { status: "accepted"; pkg: ArtifactPackage; calls: number } | { status: "rejected"; report: ValidationReport; calls: number } | { status: "provider_call_limit"; calls: number; maxCalls: number; reason: string }`
  - `export async function runBoundedRepair(input: { pkg: ArtifactPackage; report: ValidationReport; callsAlreadyUsed: number; maxProviderCalls?: number; repair: (result: Extract<RepairResult, {status:"needs_repair"}>) => Promise<ArtifactPackage>; validate: (pkg: ArtifactPackage) => ValidationReport }): Promise<RepairOutcome>`
  - Rules: `ok` report → `accepted` with unchanged `calls` and no repair invocation. Failing report → invoke `repair` at most once, then `validate` once. Second failure or no budget → `provider_call_limit` with an honest reason, never a partial package. `maxProviderCalls` defaults to `getTutorProviderSettings().maxProviderCalls` (3). If `callsAlreadyUsed >= maxProviderCalls`, return `provider_call_limit` without invoking `repair`.

- [ ] **Step 1: Write failing tests** using a valid `ArtifactPackage` fixture (one `question` component, `sourceRefs:[REF]`) and counting fake `repair`/`validate` functions. Assert: (a) `ok` report → `accepted`, repair called 0 times; (b) one failure then clean validation → `accepted`, repair called once, `calls = callsAlreadyUsed + 1`; (c) repair still produces a failing report → `provider_call_limit`, repair called once, `validate` called once, no `pkg` on the outcome; (d) `callsAlreadyUsed = 3` → `provider_call_limit`, repair called 0 times; (e) `maxProviderCalls = 2` and `callsAlreadyUsed = 2` → `provider_call_limit`.
- [ ] **Step 2:** Run and confirm FAIL (module absent).
- [ ] **Step 3: Implement** the orchestrator exactly to the rules above. No board access, no provider import beyond the cap settings, no side effects other than the injected functions.
- [ ] **Step 4:** Run `node node_modules/vitest/vitest.mjs run tests/artifact-repair.test.ts tests/artifact-repair-message.test.ts` → PASS; `tsc -b` exit 0.
- [ ] **Step 5:** `detect_changes`, commit `feat(artifacts): bounded one-call repair orchestrator`.

### Task 3.3: Preserve-list enforcement before apply

**Files:**
- Create: `src/artifacts/preserve.ts`
- Modify: `server/artifact-intelligence/repair.ts` (add the apply wrapper only)
- Test: `tests/artifact-preserve.test.ts` (new)

**Interfaces:**
- Consumes: Task 3.1's `PreserveList`; `stableJson` from `src/canvas/stable-json.ts`; Task 3.2's `runBoundedRepair`.
- Produces:
  - `export type PreserveCheck = { ok: true } | { ok: false; reason: "preserve-list-violation"; changed: string[] }`
  - `export function enforcePreserveList(original: ArtifactPackage, candidate: ArtifactPackage, preserve: PreserveList): PreserveCheck` — for each preserved component id, `stableJson` of the original component must equal the candidate's; the multiset of every component's `sourceRefs` must be unchanged.
  - `export function applyBoundedRepair(input: Parameters<typeof runBoundedRepair>[0]): Promise<RepairOutcome>` — runs `runBoundedRepair`; for `accepted`, computes `computePreserveList(original, input.report)` and calls `enforcePreserveList`; on violation returns `{status:"rejected", report, calls}` with a `preserve-list-violation` problem added, so no package escapes.

- [ ] **Step 1: Write failing tests.** Fixture: original package with `q1` (question, prompt "Which way does friction act?", `sourceRefs:[REF]`) and `d1` (diagram). Assert: (a) a candidate that only changes `d1` passes; (b) a candidate that changes `q1.prompt` fails with `changed` containing `q1`; (c) a candidate that replaces `REF` with another ref fails with `changed` containing the citation; (d) `applyBoundedRepair` on a repaired package that changes `q1.prompt` returns `status:"rejected"` and its report contains `componentId:"q1"` and `validator:"preserve-list"`.
- [ ] **Step 2:** Run and confirm FAIL (module absent).
- [ ] **Step 3:** Implement `preserve.ts`, then add the `applyBoundedRepair` wrapper to `repair.ts`. Do not change `runBoundedRepair`'s signature.
- [ ] **Step 4:** Run `node node_modules/vitest/vitest.mjs run tests/artifact-preserve.test.ts tests/artifact-repair.test.ts` → PASS; `tsc -b` exit 0.
- [ ] **Step 5:** `detect_changes`, commit `fix(artifacts): reject repairs that alter preserved content`.

### Task 3.4: Read-only advisory capability tool

**Files:**
- Create: `server/artifact-intelligence/capabilities.ts`
- Modify: `src/canvas/ai/canvas-bridge.ts` (register the frontend tool), `server/agent.ts` (advertise it, keep `author_board` bound)
- Test: `tests/artifact-capabilities.test.ts` (new)

**Interfaces:**
- Consumes: component kinds from `src/artifacts/package.ts`; ownership map from `src/artifacts/project.ts`.
- Produces:
  - `export type ArtifactCapabilities = { readOnly: true; applyVerb: "author_board"; componentKinds: Array<{ kind: string; owner: "canvas"|"studio"|"learning" }>; validators: string[]; maxItems: number }`
  - `export function getArtifactCapabilities(): ArtifactCapabilities` — pure, no board access, derived from the ownership map and the validator ids in `src/artifacts/validate.ts`.
  - `export const artifactCapabilitiesSchema = z.object({}).strict()`.
  - Registration: a `useFrontendTool` named `get_artifact_capabilities` in `canvas-bridge.ts` with handler `async () => ({ capabilities: getArtifactCapabilities() })`; its name added to `availableToolNames` in `agent.ts` and one instruction sentence saying it is advisory, that `author_board` remains the only apply path, and that insufficient course evidence should trigger `search_course_documents`, not a new verb.

- [ ] **Step 1: Run `gitnexus impact`** on `recommendedToolsForQuery` and the `availableToolNames` block before editing `agent.ts`. Record callers/risk in the SDD ledger; confirm any `UNKNOWN` with text search.
- [ ] **Step 2: Write failing tests.** Assert: (a) `getArtifactCapabilities()` is `readOnly:true`, `applyVerb:"author_board"`, lists all ten component kinds each with exactly one owner, and includes the `maxItems` value 8; (b) calling it twice on a fake store with no board handle returns identical values (no mutation); (c) source of `agent.ts` still contains `authorBoard`/`"author_board"` and `recommendedToolsForQuery`, and source of `capabilities.ts` contains no `canvas-persistence`, `postDocument`, or `proposeArtifactBrief`.
- [ ] **Step 3:** Implement `capabilities.ts`, register the tool, add the advisory instruction. Do not remove `recommendedToolsForQuery` or any existing tool.
- [ ] **Step 4:** Run `node node_modules/vitest/vitest.mjs run tests/artifact-capabilities.test.ts tests/tutor-author-board.test.ts` → PASS; `tsc -b` exit 0. Run the Playwright authoring spec `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-author-board.spec.ts` → PASS (the tool registration must not break the existing verb).
- [ ] **Step 5:** `detect_changes`, commit `feat(artifacts): read-only capability advisory tool`.

### Task 3.5: Offline quality benchmark harness (human-review gated)

**Files:**
- Create: `scripts/benchmark-artifacts.ts`, `docs/verification/artifact-quality-baseline.json`, `tests/artifact-benchmark.test.ts`
- Modify: `package.json` (`benchmark:artifacts` script)

**Interfaces:**
- Consumes: four scenarios from the spec — documented request, ambiguous request, multi-component torque package, insufficient source; six dimensions with weights intent 20, accuracy 25, grounding 20, pedagogy 20, visual 10, interaction 5 (sum 100).
- Produces:
  - `export type Dimension = "intent"|"accuracy"|"grounding"|"pedagogy"|"visual"|"interaction"`
  - `export type HumanLabels = Partial<Record<Dimension, number>>` (0–5)
  - `export function scoreGeneration(labels: HumanLabels): { scores: Partial<Record<Dimension, number>>; completeness: "complete"|"pending-human-review"; overall?: number }` — normalize each supplied label to 0–1, compute the weighted mean using only supplied dimensions; `overall` appears only when all six labels are present, otherwise `completeness:"pending-human-review"` and `overall` omitted.
  - `export const SCENARIOS` with the four names; `export const WEIGHTS` with the six values.
  - CLI: `tsx scripts/benchmark-artifacts.ts` loads `docs/verification/artifact-quality-baseline.json`, prints a per-scenario table and `reviewStatus`, exits 0 with `INCOMPLETE — human blind review required` when any scenario lacks labels, and never prints an overall score in that state.

- [ ] **Step 1: Write failing tests.** Assert: (a) `WEIGHTS` values and sum 100; (b) `SCENARIOS` exactly the four names; (c) all six labels → `completeness:"complete"` and `overall` equals the weighted mean to 3 decimals; (d) missing `pedagogy`/`visual`/`interaction` → `completeness:"pending-human-review"` and `"overall" in result === false`; (e) the committed baseline JSON has `reviewStatus:"pending-human-review"` and contains no `scores` or `overall` field (weights are allowed).
- [ ] **Step 2:** Run and confirm FAIL (modules absent).
- [ ] **Step 3:** Implement `scripts/benchmark-artifacts.ts` with the pure exports, write the baseline JSON skeleton (four scenarios, weights, `reviewStatus:"pending-human-review"`, `labels:{}`), and add `"benchmark:artifacts": "tsx scripts/benchmark-artifacts.ts"` to `package.json`. No provider call, no model rating, no HTTP.
- [ ] **Step 4:** Run `node node_modules/vitest/vitest.mjs run tests/artifact-benchmark.test.ts` → PASS; `npm run benchmark:artifacts` prints the incomplete notice with no overall score; `tsc -b` exit 0.
- [ ] **Step 5:** `detect_changes`, commit `feat(artifacts): offline quality benchmark harness`.

**Phase 3 exit:** repair loop bounded to one call and provably preserve-safe; `get_artifact_capabilities` advisory with `author_board` still force-bound; harness green on deterministic checks; **human blind-review baseline explicitly pending** — no overall quality score is claimed, no cloud credits spent, `benchmark:canvas` baseline unchanged.

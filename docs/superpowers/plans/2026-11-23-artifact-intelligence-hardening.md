# Artifact Intelligence Integration Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the integration gaps left by Phases 1–3 so their deterministic machinery is reachable from the live `author_board` path, and pin the missing routing test — without starting Phase 4.

**Architecture:** `src/canvas/ai/author-repair.ts` adapts an `ArtifactBrief` and its `ValidationReport` to the Phase 3 repair primitives (`buildRepairResult`, `enforcePreserveList`) already in `src/artifacts/`. `CanvasStudio.handleAuthorBoard` uses that adapter to return a structured, preserve-aware tool result, enforces one repair attempt per authoring signature, and keeps the student-facing panel prose-only. Routing coverage is pinned by a deterministic fixture test.

**Tech Stack:** TypeScript 5.9, Zod 4.6, Vitest 3, Playwright 1.56. No new dependency.

**Authority:** `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md` (Phase 3 tasks 3.1–3.5), `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md` §4 and §6.

## Global Constraints

- No Phase 4 work, no new `ScientificObject` kind, no `CanvasDocument.version` bump, no provider cap raise, no cloud spend.
- `author_board` stays force-bound and the only apply verb. One review, one revision, one undo step.
- Student-facing errors remain prose with no internal object IDs; the structured repair result is model-facing.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, `as never`. UI-visible behavior needs a Playwright DOM assertion.
- Graph tools are unavailable this session (MCP namespace removed, no `.gitnexus/run.cjs`); text search is the documented fallback and this limitation is recorded in the gate doc.
- `npm run verify` output is quoted at handoff; `benchmark:canvas` baseline stays unchanged.

## Review Focus

1. A repair changes the question text or a citation — the live apply path rejects it before compile.
2. A second failed repair loops the model — the handler returns `provider_call_limit` after one repair.
3. A structured tool result leaks generated object IDs into the student panel — the panel still shows validator prose only.
4. "I need more course context" invents a new verb — routing stays inside existing tool names and retrieval is already bound.

---

### Task H1: Brief repair adapter (pure)

**Files:** Create `src/canvas/ai/author-repair.ts`; Test `tests/author-repair.test.ts`.

**Interfaces:**
- Consumes: `ArtifactBrief` (`src/canvas/ai/teaching-scene.ts`), `ValidationReport` / `RepairResult` / `PreserveList` (`src/artifacts/`), `enforcePreserveList`, `stableJson`.
- Produces:
  - `export function briefComponents(brief: ArtifactBrief): Array<{ id: string; sourceRefs: string[]; content: unknown }>` — stable ids `question`, `item-<n>`, `card-<n>`, `example`, `figure`; each carries its prompt/answer/figure fragment as `content`.
  - `export function briefRepairSignature(brief: ArtifactBrief): string` — `stableJson` of `{topic, kind, prompt, itemPrompts, sourceRefs}`; deliberately excludes `figure` so a repair keeps the same signature.
  - `export function buildBriefRepairResult(brief: ArtifactBrief, report: ValidationReport): RepairResult` — maps each problem's `componentId` to a brief component by validator (`force-diagram|graph|equation|mind-map|geometry` → `figure`, `canvas-document` → `bundle`, otherwise `question`), then delegates to `buildRepairResult`.
  - `export function checkBriefPreserve(original: ArtifactBrief, candidate: ArtifactBrief, preserve: PreserveList): { ok: true } | { ok: false; changed: string[] }` — builds components for both and delegates to `enforcePreserveList`.

- [ ] **Step 1: Write failing tests.** Assert: (a) `briefComponents` returns `["figure","question"]` for the friction brief and a distinct `item-1`/`item-2` for a problem-set; (b) a report with a `force-diagram` problem gets its `componentId` mapped to `figure` and the `question` plus the citation are preserved; (c) `briefRepairSignature` is identical when only `figure.forces` changes and different when `prompt` or a `sourceRef` changes; (d) `checkBriefPreserve` rejects a changed `question.prompt` and a changed citation but accepts a changed figure; (e) `buildBriefRepairResult` text contains `requestedCorrection` and no `doc_`/`sess_`/`chunk_` token.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/author-repair.test.ts`, confirm FAIL.
- [ ] **Step 3:** Implement the adapter using the listed primitives only; no board access, no model call.
- [ ] **Step 4:** Run the test and `tsc -b`, both GREEN.
- [ ] **Step 5:** Commit `feat(artifacts): adapt brief validation to structured repair primitives`.

### Task H2: Wire structured repair into the live authoring verb

**Files:** Modify `src/canvas/CanvasStudio.tsx`; Test `tests/e2e/canvas-author-board.spec.ts`.

**Interfaces:**
- Consumes: Task H1 adapter; `ArtifactValidationError` from `src/canvas/tutor.ts`; `artifactBriefSchema` for safe parsing.
- Produces: a `useRef` attempt state `{ signature, attempts, preserve, brief }`; failure results shaped
  `{ status: "rejected"|"provider_call_limit", error: string, repair?: { messages, preserve, attempt, maxAttempts } }`.

- [ ] **Step 1: Write failing e2e test.** Extend `tests/e2e/canvas-author-board.spec.ts` with a third test using the dev seam: first invalid turn → `status:"rejected"`, `repair.attempt === 1`, `repair.preserve.componentIds` contains `question`, and the student panel shows `"force-diagram:"` with no generated object id; second turn with the same signature but a changed question prompt → `status:"rejected"` and error mentions `preserve-list`; third turn with the original question text but different still-invalid forces → `status:"provider_call_limit"`; saved board document and revision unchanged throughout.
- [ ] **Step 2:** Run `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-author-board.spec.ts`, confirm the new test FAILS.
- [ ] **Step 3:** Modify `handleAuthorBoard`: parse the input safely; on a repeat signature check `checkBriefPreserve` before compiling and reject violations; after `proposeArtifactBrief` failure, if the signature was already attempted return `provider_call_limit`, otherwise build the repair result, store state, and return it with `error: result.text`; clear state on success. Keep the existing student-facing prose assignment and the existing `status:"rejected"`/`error` substrings for the first failure.
- [ ] **Step 4:** Run the e2e spec (all three tests) → PASS; `tsc -b` exit 0.
- [ ] **Step 5:** Commit `feat(artifacts): structured repair result in live authoring path`.

### Task H3: Pin routing and the re-retrieval path

**Files:** Create `tests/tutor-route-correctness.test.ts`, `docs/verification/tutor-route-correctness-baseline.json`.

**Interfaces:**
- Consumes: `shouldRetrieveCourseDocuments`, `recommendedToolsForQuery` from `server/tutor-retrieval-policy.ts`; `server/agent.ts` source as a literal assertion.

- [ ] **Step 1: Write failing tests.** Assert: (a) a query "I need more course context before I answer" returns `shouldRetrieveCourseDocuments === true` and `recommendedToolsForQuery` returns only names from the supplied available list (no invented verb); (b) the fixture baseline has at least six query→expected-route pairs and all route correctly with the deterministic policy; (c) `server/agent.ts` contains `"search_course_documents"` and no tool named `get_more_context` or `retrieve_again`; (d) `get_artifact_capabilities` remains read-only and `author_board` remains the apply verb.
- [ ] **Step 2:** Run and confirm FAIL.
- [ ] **Step 3:** Write the fixture JSON with deterministic expected routes from the existing policy (no provider calls) and any minimal code change if a fixture exposes a real routing defect — do not add a new verb.
- [ ] **Step 4:** Run the new test plus `tests/tutor-author-board.test.ts` → PASS; `tsc -b` exit 0.
- [ ] **Step 5:** Commit `test(artifacts): pin course re-retrieval and route correctness`.

**Hardening exit:** live authoring emits structured, preserve-aware repair results with one bounded repair; routing re-retrieval is pinned; no Phase 4 work; full `npm run verify` and browser-level assertions quoted.

# MCP Checkpoint Experiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible experiment harness in the isolated worktree and run Phases 0–6 of the checkpoint campaign, producing evidence-backed reports with the scorecard dimensions kept separate.

**Architecture:** A single TypeScript harness under `experiments/mcp-checkpoints/harness/` provides shared types, an evidence writer (inputs/configs/outputs/logs/screenshots with SHA-256 manifest) and per-phase runners. Each phase owns its fixtures, runner, tests and report; upstream repos are pinned clones under `checkpoints/upstream/`. Nothing writes to StudyAI's `CanvasDocument` outside the existing bridge mutation path.

**Tech Stack:** Node 24 / npm 11 (repo requires Node ≥22), TypeScript via root `tsx`/`vitest`, Playwright for browser/DOM evidence, Python 3.10 + `uv` (uv can supply 3.13 where dim0 requires it), git for pinning upstream checkpoints.

**Spec:** `experiments/mcp-checkpoints/SPEC.md`

## Global Constraints

- Run every experiment in this worktree only: `C:\Users\Owner\.local\share\opencode\worktree\e35993\mcp-checkpoint-experiments-2026-11-23`.
- Branch: `spike/mcp-checkpoint-experiments-2026-11-23`. Do not commit to `main`.
- Keep the ten scorecard dimensions as separate measurements; never combine into one score.
- Distinguish "test actually run here" from "metric claimed by upstream" in every report.
- Never write `canvases.document` directly; agent mutations must use the bridge's single mutation path.
- Do not lower OCR region caps, provider budgets or recognition confidence thresholds without an ADR.
- Do not send `.env`, tokens or student data to open-world services; Handwriting OCR accuracy runs are out of scope without explicit approval.
- Clone upstream repos are disposable; commit fixtures, configs, scripts, reports and textual evidence. Gitignore clones and large binary outputs; record SHA-256 of all retained evidence in manifests.
- Pinned checkpoint commits must be recorded before any experiment runs.
- Pass criteria (Phase 2): zero cross-board mutations, zero lost acknowledged writes, zero accepted stale writes.
- Pass criteria (Phase 4): no consequential operation bypasses approval; one operation's approval cannot authorize another.
- Playwright DOM assertions are required for any UI-visible behavior claim; unit tests alone do not prove rendering.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make code compile.

## Review Focus

- **Stale approval reuse after canvas revision change** — must be rejected; pinned by Task 4 approval-matrix test.
- **Agent mutation taking a second path around the board authority** — must be impossible; pinned by Task 2 single-path assertion.
- **Label-to-element association confused with text OCR accuracy** — measured separately; pinned by Task 3 association test.
- **Screenshot feedback appearing helpful without a cost-controlled A/B comparison** — Task 1 keeps conditions A and B separate with tokens/calls/time recorded.
- **Byte-identical PNG demanded across different canvas engines** — Task 6 defines renderer-appropriate reproducibility instead of copying upstream's claim.

---

### Task 0: Reproducible baseline and evidence harness

**Files:**
- Create: `experiments/mcp-checkpoints/README.md`
- Create: `experiments/mcp-checkpoints/.gitignore`
- Create: `experiments/mcp-checkpoints/checkpoints/pins.json`
- Create: `experiments/mcp-checkpoints/harness/src/types.ts`
- Create: `experiments/mcp-checkpoints/harness/src/evidence.ts`
- Test: `experiments/mcp-checkpoints/harness/src/evidence.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-0-baseline.md`

**Interfaces:**
- Consumes: nothing (root project toolchain).
- Produces: `Scorecard` (ten named dimensions), `EvidenceRecord { experiment, phase, kind, payload, createdAt }`, `writeEvidence(record): Promise<{ path: string; sha256: string }>`, and `pins.json` entries `{ name, url, commit, version?, license, verifiedBy }`.

- [ ] **Step 1: Write the failing evidence-writer test**

Assert that `writeEvidence` creates the phase directory, writes JSON, and returns a path plus a 64-hex SHA-256 matching the file bytes.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run experiments/mcp-checkpoints/harness/src/evidence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts` and `evidence.ts`**

Minimal implementation using `node:fs/promises` and `node:crypto`; no new dependencies.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run experiments/mcp-checkpoints/harness/src/evidence.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Pin all five checkpoints**

Run `git ls-remote` for `yctimlin/mcp_excalidraw`, `excalidraw/excalidraw-mcp`, `Handwriting-OCR/handwriting-ocr-mcp-server`, `PaddlePaddle/PaddleOCR` and `vcmf/dim0`; write HEAD commits, versions/licenses from research into `pins.json`.

- [ ] **Step 6: Clone pinned upstreams into the gitignored directory**

`git clone` each repo into `checkpoints/upstream/<name>` and `git checkout` the pinned commit; record any clone that fails in the baseline report.

- [ ] **Step 7: Write the baseline report**

Include toolchain versions, pins, which upstream claims are unverified here, and the exact commands to reproduce.

- [ ] **Step 8: Commit**

`git add experiments/mcp-checkpoints docs/superpowers/plans/2026-11-23-mcp-checkpoint-experiments.md && git commit -m "exp: establish MCP checkpoint baseline harness"`

---

### Task 1: Visual correctness and screenshot feedback (Priority 1)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/artifacts/tasks.json`
- Create: `experiments/mcp-checkpoints/fixtures/artifacts/rubric.json`
- Create: `experiments/mcp-checkpoints/harness/src/visual.ts`
- Test: `experiments/mcp-checkpoints/harness/src/visual.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-1-visual.md`

**Interfaces:**
- Consumes: `writeEvidence`, `Scorecard` from Task 0.
- Produces: `ArtifactTask { id, kind, prompt, expectedObjects, expectedRelationships }`, `scoreArtifact(result, rubric): DefectCounts`, `runCondition(input, 'A'|'B'): ConditionResult`.

- [ ] **Step 1: Write failing tests for the seven-point rubric plus two STEM checks**

Feed a synthetic artifact with a known overlap, a clipped label and a missing arrow label; assert defect counts and that STEM-only checks (chemistry bond order annotation, vector arrow direction) are also reported.

- [ ] **Step 2: Run tests, confirm failure**

Run: `npx vitest run experiments/mcp-checkpoints/harness/src/visual.test.ts`

- [ ] **Step 3: Implement the rubric scorer and condition runner**

Rubric starts from upstream's seven checks; extend with label-to-element association and STEM symbol correctness.

- [ ] **Step 4: Run tests, confirm pass**

- [ ] **Step 5: Generate the artifact fixture set**

Six kinds: force diagram, vector diagram, labelled anatomy, flowchart, molecular structure, deliberately overlapping/mispositioned diagram. Save prompts, expected objects and expected relationships in `tasks.json`.

- [ ] **Step 6: Execute conditions A and B for both systems**

Capture screenshots, logs, tool traces, inputs/outputs. Condition B must inspect, list defects, correct, and re-inspect.

- [ ] **Step 7: Write the comparison report**

Separate columns for structural correctness, visual correctness, defects/artifact, correction rate, iterations, tokens, calls, time. Answer the cost-justification question explicitly.

- [ ] **Step 8: Commit**

---

### Task 2: Canvas integrity and mutation authority (Priority 2)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/concurrency/scenarios.json`
- Create: `experiments/mcp-checkpoints/harness/src/integrity.ts`
- Test: `experiments/mcp-checkpoints/harness/src/integrity.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-2-integrity.md`

**Interfaces:**
- Consumes: evidence writer.
- Produces: `IntegrityScenario { id, setup, actions, expectation }`, `evaluateIntegrity(trace): IntegrityResult`.

- [ ] **Step 1: Write failing tests for stale-write, cross-board, replay and single-path assertions**

For each, assert rejected/accepted flags and revision/sequence consistency; assert every agent mutation has the same authority marker as a human mutation.

- [ ] **Step 2: Run tests, confirm failure**
- [ ] **Step 3: Implement scenario evaluator**
- [ ] **Step 4: Run tests, confirm pass**
- [ ] **Step 5: Encode the seven requested scenarios in `scenarios.json`**
- [ ] **Step 6: Run scenarios against the bridge and record traces**
- [ ] **Step 7: Write report against the three pass criteria**
- [ ] **Step 8: Commit**

---

### Task 3: Recognition accuracy and uncertainty (Priority 3)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/corpus/manifest.json`
- Create: `experiments/mcp-checkpoints/harness/src/recognition.ts`
- Test: `experiments/mcp-checkpoints/harness/src/recognition.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-3-recognition.md`

**Interfaces:**
- Consumes: evidence writer; pinned PaddleOCR checkout.
- Produces: `CorpusItem`, `recognitionMetrics(predictions, gold): RecognitionMetrics` with CER, WER, STEM symbol accuracy, bbox IoU, association accuracy, calibration and abstention rate as separate fields.

- [ ] **Step 1: Write failing tests for CER/WER, association and abstention separation**

Assert a case where OCR text is correct but label-to-element association is wrong, and that low-confidence abstention is counted as correct rather than an error.

- [ ] **Step 2: Run tests, confirm failure**
- [ ] **Step 3: Implement metric functions**
- [ ] **Step 4: Run tests, confirm pass**
- [ ] **Step 5: Build the labelled corpus manifest and assets**

Six categories from the spec; mark which are locally generated vs user-provided (do not fabricate student data).

- [ ] **Step 6: Run the bridge pipeline and PaddleOCR models available locally**

Use `uv` for Python deps; if a provider needs credentials or heavy native models, record the blocker rather than claiming a metric.

- [ ] **Step 7: Exercise Handwriting OCR only for job lifecycle/status/retention if reachable without credentials; never send study data**

- [ ] **Step 8: Write report separated by text accuracy vs association vs calibration**
- [ ] **Step 9: Commit**

---

### Task 4: Approval and side-effect conformance (Priority 4)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/approval/operations.json`
- Create: `experiments/mcp-checkpoints/harness/src/approval.ts`
- Test: `experiments/mcp-checkpoints/harness/src/approval.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-4-approval.md`

**Interfaces:**
- Consumes: evidence writer; Task 2 revision authority.
- Produces: `OperationClass`, `evaluateApproval(trace): ApprovalResult`.

- [ ] **Step 1: Write failing tests for classification, stale approval, reuse and metadata honesty**

Include negative tests reproducing upstream issues #111/#112/#115: a tool that persists state must not advertise read-only; a plain read must not demand approval; documented input format must actually work.

- [ ] **Step 2: Run tests, confirm failure**
- [ ] **Step 3: Implement conformance evaluator**
- [ ] **Step 4: Run tests, confirm pass**
- [ ] **Step 5: Encode read-only / reversible / consequential operations**
- [ ] **Step 6: Execute bypass, reuse, revision-change and alternate-path probes**
- [ ] **Step 7: Write report against both pass criteria**
- [ ] **Step 8: Commit**

---

### Task 5: Tool surface efficiency (Priority 5)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/tools/tasks.json`
- Create: `experiments/mcp-checkpoints/harness/src/tools.ts`
- Test: `experiments/mcp-checkpoints/harness/src/tools.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-5-tools.md`

**Interfaces:**
- Consumes: artifact tasks from Task 1.
- Produces: `ToolSurface`, `toolEfficiency(trace): ToolEfficiencyMetrics`.

- [ ] **Step 1: Write failing tests that separate calls, tokens, invalid calls and retries**
- [ ] **Step 2: Run tests, confirm failure**
- [ ] **Step 3: Implement metrics**
- [ ] **Step 4: Run tests, confirm pass**
- [ ] **Step 5: Define current, granular and batched surfaces**
- [ ] **Step 6: Run identical tasks on all three**
- [ ] **Step 7: Write report answering which design minimizes unnecessary interaction without hurting quality**
- [ ] **Step 8: Commit**

---

### Task 6: Render determinism and persistence (Priority 6)

**Files:**
- Create: `experiments/mcp-checkpoints/fixtures/render/states.json`
- Create: `experiments/mcp-checkpoints/harness/src/render.ts`
- Test: `experiments/mcp-checkpoints/harness/src/render.test.ts`
- Create: `experiments/mcp-checkpoints/reports/phase-6-render.md`

**Interfaces:**
- Consumes: evidence writer; fixed artifact states from Task 1.
- Produces: `RenderFidelityMetrics` with drift, missing/duplicated objects, export delta and recovery status as separate fields.

- [ ] **Step 1: Write failing tests for drift, duplicate detection and restore correctness**

Define StudyAI-appropriate tolerance explicitly; do not assert byte-identical PNGs.

- [ ] **Step 2: Run tests, confirm failure**
- [ ] **Step 3: Implement comparison logic**
- [ ] **Step 4: Run tests, confirm pass**
- [ ] **Step 5: Run render/export/reload/restore/reconnect loops on fixed states**
- [ ] **Step 6: Write fidelity report**
- [ ] **Step 7: Commit**

---

## Self-review (completed at authoring time)

- Spec coverage: all six priorities, all listed measures, pass criteria, scorecard and phases mapped to Tasks 0–6.
- Review Focus: each of the five risks has a pinned test in its owning task.
- Dependencies: Task 0 gates all others; Task 1 fixtures feed Task 5; Task 1 states feed Task 6.
- Proportion: plan contains decisions, file names, signatures and test names, not implementation transcripts.

## Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Heavy native deps (better-sqlite3, sharp, PaddleOCR) fail to install | Medium | High | Phase 0 records blockers; use provider/API mode or report "not run" rather than claiming metrics |
| dim0 requires Python ≥3.13, host has 3.10 | High | Medium | Use `uv python install 3.13` or skip dim0 execution and rely on static architecture checkpoint |
| Playwright browser unavailable | Medium | High | Phase 0 probes browser; DOM claims are withheld if screenshots cannot be produced |
| External service credentials/rate limits | Medium | Medium | Never send study data; record blockers; no paid calls without ask |
| Screenshot feedback cost dominates | Medium | Medium | Task 1 records tokens/calls/time in both conditions and reports separately |
| Upstream claims mistaken for local results | Low | High | Every report labels each number as run-here or claimed-upstream |

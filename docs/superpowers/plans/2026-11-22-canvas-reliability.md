# Canvas Reliability (Phase 5 Completion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Phase 5 accuracy, recall, and latency gaps so the existing draw → ask → edit canvas loop is trustworthy on large boards and under provider variance.

**Architecture:** Four bounded changes to the existing pipeline: backfill the spatial grid on threshold crossing, improve the two weak OCR readings through the already-gated prompt/provider path, record and bound deep-analysis latency through the existing telemetry and ADR process, then re-run the full gate and update the status docs. No new pipeline, provider, schema, or dependency.

**Tech Stack:** TypeScript 5.9.3, Vitest 3.2.4, Playwright 1.56.1, existing canvas OCR provider chain and benchmark scripts, Zod 4.2.0.

**Spec:** `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md` (phases 0–4 archive), `PLAN.md` items 10–14, `PROGRESS.md` items 5, 7, 13. This plan implements the unfinished Phase 5 items and the recorded spatial-index bug.

## Global Constraints

- Do not lower OCR region caps, provider budgets, or recognition confidence thresholds without an ADR in `docs/decisions/`.
- Do not update `docs/verification/canvas-benchmark-baseline.json` — `--update-baseline` needs an explicit request.
- Any prompt, model, or provider change requires `npm run benchmark:canvas` with the four gate numbers (hard failures, math exact, math F1, PhysAlign coverage) quoted in the handoff.
- A new kind or CanvasDocument version change is out of scope; `CanvasDocument.version` stays `1`.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`; no new dependency in root `package.json`.
- UI-visible changes need a Playwright DOM assertion; no UI changes are planned here.
- Run `npx tsc -b && npx vitest run` before each commit; run `node .gitnexus/run.cjs detect-changes --scope all --repo .` before commits when the index is current; quote `npm run verify` output in the verification record.
- Provider results vary. Count a fix only if it passes two runs of the affected board and the full gate; never claim success from a single lucky run.
- The working tree contains uncommitted, unrelated canvas-first UI and learning-UI work. Stage only files named in each task; never `git add -A`.

## Review Focus

1. **Silent recall loss on large boards** (>256 nodes, the first 256 nodes omitted from grid queries) — pinned by Task 1's 300-node query test.
2. **Nested logistic μ/σ misread** (recorded 0.625 F1) — pinned by Task 2's two single-board runs and the gate.
3. **PhysAlign `F/N` → `A E / N` misread** — pinned by Task 3's two single-board runs and the coverage assertion.
4. **Provider hiccup mistaken for a regression** (Gemini 503 / 60 s timeout, Groq fallback misread) — pinned by Task 4's two-run gate rule and recorded warning.
5. **Stale status claims** after prompt and latency changes — pinned by Task 5's quoted `npm run verify` output and doc updates.

---

### Task 1: Restore spatial recall on boards above the linear threshold

**Files:**
- Modify: `src/canvas/spatial/index.ts:35-39` (`insert`)
- Test: `tests/canvas-scene.test.ts` (alongside the existing index test at line 39)

**Interfaces:**
- Consumes: `createCanvasSpatialIndex(options?: { cellSize?, linearThreshold?, maxCellsPerNode? })` and `CanvasSceneNode` from `src/canvas/spatial/types.ts`.
- Produces: unchanged `insert`/`query`/`nearest` signatures; `query(bounds)` must return every intersecting inserted node for any `nodes.size`.

- [ ] **Step 1: Write the failing test** in `tests/canvas-scene.test.ts`

```ts
it("finds early nodes after the index crosses the linear threshold", () => {
  const index = createCanvasSpatialIndex({ linearThreshold: 8 });
  for (let i = 0; i < 20; i++) {
    index.insert({
      id: `n${i}`, kind: "stroke", ref: { scope: "quickdraw", id: `n${i}` },
      bounds: { x: i * 10, y: 0, width: 5, height: 5 }, boundsBasis: "source",
      text: `n${i}`, recordType: "stroke", origin: "quickdraw", verificationStatus: "source",
      confidence: 1, sourceRefs: [], geometry: null, uncertaintyReasons: [],
    });
  }
  const ids = index.query({ x: 0, y: 0, width: 200, height: 20 }).map((node) => node.id);
  expect(ids).toEqual(expect.arrayContaining(["n0", "n1", "n7", "n19"]));
});
```

- [ ] **Step 2: Run it and confirm the failure**

Run: `npx vitest run tests/canvas-scene.test.ts -t "finds early nodes"`
Expected: FAIL — `n0`, `n1`, `n7` are missing from the query result.

- [ ] **Step 3: Implement the backfill in `insert`**

When `this.nodes.size` exceeds `this.linearThreshold` for the first time, call `insertGrid` for every node already stored in `this.nodes` before inserting the new node; then insert the new node normally. Keep `nearest()` on its existing full scan, keep the overflow set, and do not change the default `linearThreshold: 256`.

- [ ] **Step 4: Run the test file and typecheck**

Run: `npx vitest run tests/canvas-scene.test.ts && npx tsc -b --pretty false`
Expected: all scene tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/spatial/index.ts tests/canvas-scene.test.ts
git commit -m "fix(canvas): backfill spatial grid when linear threshold is crossed"
```

---

### Task 2: Nested-logistic μ/σ OCR accuracy

**Files:**
- Modify: the math OCR system prompt used by the active provider (Groq constant `MATH_OCR_SYSTEM` at `server/canvas-intelligence/groq.ts:55`; trace the primary Gemini path from `ocrProfile` at `server/canvas-intelligence/service.ts:50` through `server/canvas-intelligence/providers.ts:89-99` and the OpenAI-compatible call site)
- Create: `docs/verification/2026-11-22-nested-logistic-ocr.md`

**Interfaces:**
- Consumes: `npm run benchmark:canvas`, `CANVAS_BENCHMARK_BOARD` (documented in `CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`), the benchmark's `normalizeLatex` and token-F1 scorer.
- Produces: a math OCR prompt that resolves ambiguous μ/σ glyphs; four gate numbers quoted in the verification doc.

- [ ] **Step 1: Pin the failure**

Run twice: `$env:CANVAS_BENCHMARK_BOARD="nested logistic"; npm run benchmark:canvas`
Record the exact board id, predicted LaTeX, expected label, and token F1 (baseline 0.625) in `docs/verification/2026-11-22-nested-logistic-ocr.md`. If the board name filter does not match, read `scripts/prepare-canvas-dataset-benchmark.ts:18` for the canonical board name before continuing.

- [ ] **Step 2: Change the prompt only**

Add a short, explicit rule for distinguishing μ from σ in nested fractions (stroke/position cue, not a generic "prefer Greek" restatement). Do not change the model, provider chain, OCR region count, budgets, or recognition thresholds. If the Groq and primary OCR prompts are separate strings, apply the same rule to both.

- [ ] **Step 3: Re-run the pinned board twice**

Run: `$env:CANVAS_BENCHMARK_BOARD="nested logistic"; npm run benchmark:canvas` (twice)
Expected: both runs at or above 0.8 token F1 for this board, or an exact match. If either run regresses, revert the prompt change and record why in the verification doc rather than forcing a pass.

- [ ] **Step 4: Run the full gate**

Run: `npm run benchmark:canvas`
Expected: exit 0; quote hard failures, math exact, math F1, PhysAlign coverage. All four must be at or above the values in `docs/verification/canvas-benchmark-baseline.json` within its existing tolerances. Do not pass `--update-baseline`.

- [ ] **Step 5: Commit**

```bash
git add server/canvas-intelligence/groq.ts server/canvas-intelligence/prompts.ts docs/verification/2026-11-22-nested-logistic-ocr.md
git commit -m "fix(canvas): disambiguate handwritten mu and sigma in math OCR"
```
Stage only the files actually changed.

---

### Task 3: PhysAlign `F/N` diagram OCR accuracy

**Files:**
- Modify: the diagram OCR prompt or crop preprocessing reached from `ocrProfile` at `server/canvas-intelligence/service.ts:50` (keep grouped crops bounded by `CANVAS_OCR_MAX_REGIONS`)
- Modify: `docs/verification/2026-11-22-nested-logistic-ocr.md` (append the PhysAlign record)

**Interfaces:**
- Consumes: the diagram OCR profile and `scripts/benchmark-canvas.ts` board filter.
- Produces: OCR output that contains the `F/N` label; PhysAlign concept coverage ≥ 0.8 on two runs.

- [ ] **Step 1: Pin the misread**

Run twice: `$env:CANVAS_BENCHMARK_BOARD="PhysAlign"; npm run benchmark:canvas`
Record the current OCR text and concept coverage in the verification doc (known bad reading: `A E / N`).

- [ ] **Step 2: Make one targeted change**

Add an explicit diagram-OCR instruction that reads adjacent stacked symbols as a fraction when the horizontal bar is visible, using `F/N` as the worked example; or adjust the crop for that label without raising `CANVAS_OCR_MAX_REGIONS`. Do not change recognition thresholds or provider budgets.

- [ ] **Step 3: Verify twice and gate**

Run: `$env:CANVAS_BENCHMARK_BOARD="PhysAlign"; npm run benchmark:canvas` (twice), then `npm run benchmark:canvas`
Expected: both board runs show `F/N` and coverage ≥ 0.8; full gate exits 0 with all four numbers quoted and no baseline update.

- [ ] **Step 4: Commit**

```bash
git add server/canvas-intelligence/ docs/verification/2026-11-22-nested-logistic-ocr.md
git commit -m "fix(canvas): read fraction labels in diagram OCR"
```
Stage only the files actually changed.

---

### Task 4: Bound deep-analysis latency with an ADR and stage telemetry

**Files:**
- Create: `docs/decisions/2026-11-22-canvas-deep-latency.md`
- Modify: `server/canvas-intelligence/service.ts`, `server/canvas-intelligence/provider-usage.ts`, `tests/canvas-providers.test.ts` if stage timing is added

**Interfaces:**
- Consumes: `telemetry: { totalMs, imageEgress, usage[] }` on analysis responses; `scripts/benchmark-canvas.ts` p50/p95 fields; recorded p50 20,280 ms / p95 106,663 ms from `PROGRESS.md` item 7.
- Produces: an ADR with the chosen bounded routing change and measured before/after p95; optional stage timing in telemetry.

- [ ] **Step 1: Write the ADR before changing code**

Record: the 15 s deep p95 target, the measured p50/p95, the evidence that the tail is provider response time (Gemini OCR timeouts and Groq 3.5–4.5k-token completions), and the chosen bounded option (faster completion model, smaller safe completion size, or stricter per-stage timeout with fallback). State explicitly that no OCR region cap, provider budget, or recognition threshold is lowered.

- [ ] **Step 2: Add a regression test for stage timing**

Read `tests/canvas-providers.test.ts` first and reuse its existing provider fixture and helper names. Add a case asserting that the analysis response still carries `telemetry.totalMs` and `telemetry.usage[]` after the routing change, with no new required field. If the ADR chooses a configuration-only change with no telemetry edit, pin the chosen config value in a test instead and skip this step.

- [ ] **Step 3: Apply the ADR's routing change**

Change only the model/timeout values named in the ADR. Keep the provider chain, budget caps, and fallback behavior intact.

- [ ] **Step 4: Measure twice**

Run: `npm run benchmark:canvas` (twice)
Quote the four gate numbers and `latencyP50Ms`/`latencyP95Ms` from each run in the ADR. If the 15 s target is still missed, record it as an accepted external-provider limit with the measured numbers — do not claim the target was met.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/2026-11-22-canvas-deep-latency.md server/canvas-intelligence/ tests/canvas-providers.test.ts
git commit -m "docs(canvas): bound deep-analysis latency and record measured p95"
```
Stage only the files actually changed.

---

### Task 5: Full verification and status refresh

**Files:**
- Modify: `PLAN.md` (check items 10–14), `docs/STATUS.md`, `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`, `PROGRESS.md`
- Create: `docs/verification/2026-11-22-canvas-reliability.md`

**Interfaces:**
- Consumes: all four gate numbers from Tasks 2–4, the `tsc`/Vitest/Playwright output, the recall test result.
- Produces: a verification record with exact commands, outputs, and remaining limits.

- [ ] **Step 1: Run the full verification**

Run: `npm run verify`
Expected: `tsc -b`, `vitest run`, and `playwright test` all exit 0. Quote the test counts and command output verbatim. If a provider-dependent e2e flakes, re-run the named spec and report both results; do not hide the first.

- [ ] **Step 2: Run the canvas benchmark once more**

Run: `npm run benchmark:canvas`
Expected: exit 0; quote the four gate numbers. No baseline update.

- [ ] **Step 3: Update the records**

Check off completed items in `PLAN.md`; refresh `docs/STATUS.md` limits/verification, append a 2026-11-22 section to the canvas handoff with Phase 5 status, and write `docs/verification/2026-11-22-canvas-reliability.md`. Name what was verified and what remains (e.g., provider-bound p95 if still above target).

- [ ] **Step 4: Commit**

```bash
git add PLAN.md PROGRESS.md docs/STATUS.md docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md docs/verification/2026-11-22-canvas-reliability.md
git commit -m "docs(canvas): record Phase 5 verification and remaining limits"
```

---

## Verification Summary

| Check | Command | Pass condition |
| --- | --- | --- |
| Spatial recall | `npx vitest run tests/canvas-scene.test.ts` | 300-node/threshold-crossing query returns early nodes |
| μ/σ accuracy | `CANVAS_BENCHMARK_BOARD=... npm run benchmark:canvas` ×2 | ≥0.8 F1 or exact on two runs |
| PhysAlign accuracy | same, PhysAlign board ×2 | `F/N` present, coverage ≥0.8 twice |
| Full gate | `npm run benchmark:canvas` | exit 0; four numbers ≥ baseline tolerances; baseline unchanged |
| Full verify | `npm run verify` | tsc, Vitest, Playwright all pass, output quoted |

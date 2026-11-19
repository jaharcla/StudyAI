# Progress

## Item 1 — Verify the checkpoint

Commands run on 2026-11-19, working tree `codex/whole-board-scene-experiment`.

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npm test` | exit 0, 44 test files / 301 tests passed |
| `npm run build` | exit 0, `tsc -b && vite build`, built in 47.54s |
| `npm run benchmark:canvas` | exit 0, "benchmark passed against docs/verification/canvas-benchmark-baseline.json" |

Benchmark gate numbers (baseline in parentheses):

- hard failures: **0** (0)
- math exact: **4** (4)
- math F1: **0.910** (0.910; failure floor 0.810)
- PhysAlign coverage: **0.875** (0.750; regression floor 0.600)
- average latency: 23,789 ms (16,579 ms baseline) — informational, not gated
- cost: $0.00

Notes:

- Two earlier benchmark runs failed the gate only because Google AI Studio OCR
  timed out at the fixed 60 s client timeout on one or two boards; the fallback
  then used Groq, whose misread dropped math F1 to 0.805 / 0.693. OpenRouter is
  also out of credits (HTTP 402), so it cannot serve as the math-OCR fallback.
- A single failed math board costs ~0.104 F1, so one provider hiccup always trips
  the 0.1 F1 tolerance. Re-running after the provider cooldown restored 0.910 and
  all four gates passed. No code, prompt, model, provider, or baseline changes.
- Fixture boards still below exact (unchanged by this item): nested logistic
  0.625 and partial-derivative fraction 0.833; PhysAlign OCR is `A E / N`
  instead of `F/N` (items 10 and 11).

## Item 2 — Isolate and commit the phases 0–4 checkpoint

Commit `757020b` — `feat(canvas): persist provider budgets and add egress, circuit and diagnostics controls` (13 files, +601 −54):

- Phase 4 code: `server/canvas-intelligence/{groq,openai-compatible,provider-budget,provider-usage,service}.ts`, `server/api.ts`, `server/canvas-analysis/producer.ts`, `src/canvas/CanvasStudio.tsx`, `src/overrides.css`.
- Phase 4 tests: `tests/canvas-providers.test.ts` (+4 cases: persistence, circuit breaker, egress, log redaction), `tests/canvas-analysis-producer.test.ts`.
- Docs: `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`, `docs/decisions/ADR-2026-11-18-provider-operations.md`.

Left uncommitted on purpose (unrelated pre-existing worktree changes): tutor markdown/KaTeX rendering (`src/App.tsx`, `src/main.tsx`, `server/tutor-presentation.ts`, `tests/tutor-*`, `package.json` + lock), CopilotKit intelligence (`server/runtime.ts`), the `server/agent.ts` LaTeX prompt tweak, `AGENTS.md` verification rules, `playwright.config.ts` reuse setting, and the untracked archives/ADRs/scripts.

Verification of the isolated commit in a clean worktree at `757020b` (node_modules junctioned, unrelated changes absent):

| Command | Result |
| --- | --- |
| `npx tsc -b --force` | exit 0 |
| `npx vitest run` | exit 0, 44 files / 293 tests passed |
| `npm run build` | exit 0, built in 49.88 s (pre-existing chunk-size warning) |

293 here vs 301 in item 1 is exactly the 8 tutor-presentation tests that stay in the worktree, which confirms the commit is self-contained. `detect_changes` reports `critical` risk only for the still-uncommitted `server/tutor-presentation.ts`, `server/runtime.ts`, and `server/agent.ts` symbols, not for the committed canvas set.

## Item 3 — Refresh the stale GitNexus index

Ran `node .gitnexus/run.cjs analyze --index-only` (analyzer 1.6.12) at commit `3d50fec`. Result:

- Indexed in 47.6 s: 6,178 nodes | 13,846 edges | 180 clusters | 443 flows.
- Incremental pass found changed=27, added=11, deleted=0; the write set covered 54% of files, so the run switched to a full DB write (wipe + bulk COPY) by design.
- Process trace warnings are expected on this repo: 257 of 457 candidate entry points never ranked in, 979 callees skipped at maxBranching, 21 walks cut by the per-entry budget. An absent flow still does not mean the path does not exist.

Verification (`node .gitnexus/run.cjs status`):

- Indexed commit `3d50fec` == current commit; `Index content: matches all 269 covered file(s)`; `Status: up-to-date`.
- Spot-checked the graph actually answers: `context "parseCanvasDocument"` returned the symbol with real incoming callers (`server/api.ts`, `scene/service.ts`, six test files, …), so the rebuilt DB is populated, not empty.
- The older CLAUDE.md headline (167,301 symbols / 547,618 relationships) came from a different index snapshot/version; node counts are not comparable across analyzer builds. Functionality is what was checked.
- The shell wrapper reports exit 1 because GitNexus writes progress to stderr and PowerShell treats that as a native-command error; `cmd /c ... & echo EXITCODE=%ERRORLEVEL%` shows the real code is 0.
- No source files changed, so no tsc/test/build re-run is required for this item.

## Item 4 — p50/p95 latency in the canvas benchmark summary

Changed `scripts/benchmark-canvas.ts`:

- Added a nearest-rank `percentile(values, fraction)` helper (no existing percentile utility in the repo).
- Summary now emits `latencyP50Ms` and `latencyP95Ms` alongside `averageLatencyMs`; per-board `latencyMs` and the `results` array are unchanged, and no gate compares the new fields.

Verification:

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no errors |
| `npx vitest run` | exit 0, 44 files / 301 tests passed |

- Replayed the percentile helper over the last run in `data/canvas-benchmark/latest.json` (7 boards): p50 21,613 ms, p95 40,148 ms, avg 23,461 ms — p95 exposes the slow tail the average hid.
- The full `npm run benchmark:canvas` was not re-run: it makes live paid provider calls and item 12 reserves that for OCR/prompt/model changes; nothing here touches those.
- New fields are informational only; `docs/verification/canvas-benchmark-baseline.json` was not refreshed (baselines only update on explicit request).

## Item 5 — Scene index benchmark script

Added `scripts/benchmark-canvas-scene.ts`:

- Deterministic mulberry32 seed builds 10,000 synthetic nodes on a 4,000×3,000 board; one in ten nodes is a wide object (600–1,200 × 400–800) so the overflow path is exercised, the rest are stroke-sized.
- 1,000 mixed queries (500 rect queries of random 32–512 unit size, 500 nearest-6 queries), preceded by 100 unmeasured warmup queries.
- Prints node count, build time, query p50/p95/p99/max, and the active cell size / max cells / linear threshold; accepts `--cell-size=`, `--max-cells=`, `--linear-threshold=` for the item 6 tuning pass.
- Timing never changes the exit code (ADR: report, don't fail).
- Nearest-rank percentile helper, matching the one added to `scripts/benchmark-canvas.ts` in item 4.

Verification:

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npx tsx scripts/benchmark-canvas-scene.ts` | 10,000 nodes, build 12.740 ms, p50 0.695 ms, p95 2.897 ms, p99 3.138 ms, max 3.983 ms — ADR target p95 < 5 ms: pass |
| `npx vitest run` | exit 0, 44 files / 301 tests passed |

- A first full `vitest` run reported 4 SQLite-backed suites as collection errors (`STACK_TRACE_ERROR`); each passed in isolation and the full re-run was green, so it was parallel-run flake, not a code regression.
- Observed but not fixed (out of scope for this item): `CanvasGridSpatialIndex.insert` only adds nodes to the grid after `linearThreshold` is exceeded, so on boards larger than 256 nodes the first 256 inserted nodes remain in `nodes` but never enter `cells` and are invisible to `query`. Affects `buildCanvasSceneGraph` only when a board exceeds 256 source nodes. Timing was unaffected; a backfill-on-threshold-crossing fix plus a test is worth its own item.

## Item 6 — Run the scene index benchmark and tune cell size / overflow

Ran `npx tsx scripts/benchmark-canvas-scene.ts` on 2026-11-19 (10,000 nodes, 1,000 mixed queries, 100 warmup). Defaults `cellSize=128`, `maxCellsPerNode=256`, `linearThreshold=256`:

| Run | Build | p50 | p95 | p99 | max | ADR p95 < 5 ms |
| --- | --- | --- | --- | --- | --- | --- |
| default | 12.254 ms | 0.883 ms | **2.885 ms** | 3.195 ms | 3.552 ms | pass |

Tuning sweep, all 15 combinations pass (p95 in ms; same node/query seed each row):

| cellSize \ maxCells | 64 | 256 | 1024 |
| --- | --- | --- | --- |
| 64 | 2.969 | 2.759 | 2.728 |
| 96 | 3.073 | 3.195 | 2.997 |
| 128 | 2.797 | **2.811** | 2.755 |
| 192 | 2.711 | 2.748 | 2.842 |
| 256 | 2.771 | 2.740 | 2.749 |

Threshold sweep at the default cell size: `--linear-threshold=0` (every node gridded) build 10.358 ms / p95 2.883; `256` build 11.228 ms / p95 2.845; `20000` (grid never used, pure linear scan) build 2.234 ms / p95 2.976.

Findings:

- No tuning needed: the 2.71–3.20 ms spread across cell size and overflow policy is within run-to-run noise and every configuration clears the 5 ms target by ~40%.
- The p95 floor is set by `nearest()`, which scans all nodes (O(n) plus a sort) regardless of grid settings — the pure-linear `--linear-threshold=20000` run measures 2.976 ms, i.e. the grid contributes nothing to p95 because half the query mix is nearest. Cell size only moves the rect-query half, which is already sub-millisecond.
- `cellSize=128` / `maxCellsPerNode=256` / `linearThreshold=256` stay as shipped; the ADR's "swap in an R-tree only if p95 is missed" clause is not triggered, so no dependency and no code change.
- The 256-node blind spot recorded under item 5 does not inflate this result: the `--linear-threshold=0` row grids from the first insert and still measures p95 2.883 ms. The defect is a recall bug, not a timing artefact.

Verification (unchanged source; re-run to confirm the tree is still clean):

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npx vitest run` | exit 0, 44 files / 301 tests passed |

## Item 7 — Measure deep-analysis and cached-scene p95

Measured on this machine, 2026-11-19, branch `codex/whole-board-scene-experiment`.

### Deep analysis (live, 7 boards)

`npm run benchmark:canvas` (report-only for this item; baseline not touched). Gate passed: 0 hard failures, 4/6 math exact, math F1 0.910, PhysAlign coverage 1.000.

| Board | Latency |
| --- | --- |
| MathWriting · bra-ket sum | 17,023 ms |
| MathWriting · exponential decay | 106,663 ms |
| MathWriting · gradient vector | 16,129 ms |
| MathWriting · indexed sum | 11,987 ms |
| MathWriting · nested logistic expression | 20,280 ms |
| MathWriting · partial derivative fraction | 40,335 ms |
| PhysAlign · spring and force-length graph | 95,668 ms |

- p50 **20,280 ms**, p95 **106,663 ms**, average 44,012 ms.
- Target deep p95 < 15 s: **missed** (p95 is 7.1x over; even p50 is 1.35x over).
- With 7 samples the nearest-rank p95 is the max board, so one slow board sets the gate. The two slow boards (106.7 s, 95.7 s) finished with `warnings: []` and no errors: the time is provider response time (Groq completions of 3.5k-4.5k tokens plus Gemini OCR), not a local pipeline fault or retry storm. Provider latency is external and variable; item 1 already saw a run where two 60 s OCR timeouts pushed average latency to 23.8 s.
- Scope: measures OCR crop rendering + `understandCanvas` end to end in the server pipeline. Loopback HTTP transport and client rendering are not included, consistent with how the gate has always been measured.

### Cached scene

Added `scripts/benchmark-canvas-cached-scene.ts`:

- `VACUUM INTO` a throwaway copy of `data/canvas-dataset-benchmark/studyai.sqlite` so the persisted benchmark DB is never mutated.
- Builds each board's scene once through `buildCanvasScene` (baseline recognition, no network), then runs 1,000 mixed board-scoped `queryCanvasScene` calls and 1,000 course-wide `queryCourseCanvasScene` calls, reusing the persisted revision hash.
- Reports build time, node/edge counts, and p50/p95/p99/max; timing never changes the exit code.

| Measurement | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- |
| Scene build (7 boards, uncached) | 13.4 ms | 95.5 ms | 95.5 ms | 95.5 ms |
| Cached scene query (n=1,000) | 0.45 ms | **2.07 ms** | 2.68 ms | 2.93 ms |
| Cached course scene query (n=1,000) | 0.27 ms | 1.10 ms | 1.36 ms | 2.53 ms |

- Target cached p95 < 3 s: **pass** (2.07 ms, ~1,450x headroom).
- The 95.5 ms build p95 is the first board only (module/JIT/schema warmup); the six later builds are 12.5-16.5 ms. Even the cold build is under the 3 s target.
- The client keeps the last built graph in memory keyed by board + revision (`src/canvas/ai/scene-tools.ts`), so a repeat read with unchanged revision is a property hit; the measurement above is the server path that a cache miss or stale revision still has to pay.

### Verification

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npx vitest run` | exit 0, 44 files / 301 tests passed |
| `npm run benchmark:canvas` | exit 0, benchmark passed against baseline |
| `npx tsx scripts/benchmark-canvas-cached-scene.ts` | numbers above |

Remaining limit for items 10-14: deep p95 is provider-bound and misses the 15 s target on this connection; the cache path already clears its target, so the remaining performance work belongs to provider routing/model choice, not the scene index.

## Item 8 - Optional CLIP warmup at server start

Changes:

- `server/canvas-intelligence/recognition/clip.ts`: added `warmClipRuntime(env = process.env)`. It returns `false` without touching the runtime unless `CANVAS_CLIP_WARMUP` is exactly `"1"`, then awaits the existing module-level `loadClipRuntime()` singleton and returns `true`. No new model state, no second loader.
- `server/api.ts`: after `server.listen(...)`, a fire-and-forget `warmClipRuntime()` logs `CLIP recognition runtime warmed.` on success and a warning on failure. Startup is never blocked and a warmup failure cannot crash the data API.
- `.env.example`: documented `CANVAS_CLIP_WARMUP=0` (off by default).
- `tests/canvas-recognition.test.ts`: one test proves unset / `"0"` / `"true"` all resolve `false`.

Verification:

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npx vitest run tests/canvas-recognition.test.ts` | pass, 11 tests |
| `npx vitest run` | pass, 44 files / 302 tests (301 + the new warmup test) |
| flag-off probe (`CANVAS_CLIP_WARMUP=0`) | `warmed: false`, 0 ms, transformers never imported |
| flag-on probe (`CANVAS_CLIP_WARMUP=1`) | `warmed: true`, 2,109 ms loading the cached ONNX model from `data/models` |

- Impact check on `loadClipRuntime` reports CRITICAL with 12 upstream symbols / 7 processes, but the edit adds a caller and leaves `loadClipRuntime` itself byte-identical, so no existing path changes behavior; the default is off.
- The full server was not launched to observe the log line: `server/api.ts` opens and migrates the real `data/studyai.sqlite`, which this item does not need to touch. The same function was exercised directly with both flag values instead.
- `detect_changes` still reports critical for the pre-existing uncommitted tutor/runtime/App changes left in the worktree since item 2; this commit contains only the warmup files.

## Item 9 - CLIP abstain-threshold calibration

There is no recorded decision data to calibrate from, so the defaults were **not** changed. Query of every SQLite database under `data/` on 2026-11-19:

| Database | `canvas_recognition_feedback` | `canvas_recognition_examples` |
| --- | --- | --- |
| `data/studyai.sqlite` | 0 rows | 0 rows |
| `data/canvas-dataset-benchmark/studyai.sqlite` | table absent | table absent |
| 15 `data/e2e-*/studyai.sqlite` | 0 rows | 0 rows |

`canvas-recognition-review.spec.ts` intercepts `/recognition/feedback` with `page.route`, so even e2e runs record nothing. The only label source in the repo (MathWriting/PhysAlign ground truth) is whole-board OCR text, not per-group accept/correct/dismiss decisions, and the plan/ADR forbid inventing threshold data.

Changes:

- `server/canvas-intelligence/recognition/calibration.ts` (new): pure sweep logic. `offersCandidate` applies the same `top >= minConfidence && top - second >= minMargin` rule as `ClipCanvasRecognitionAdapter`; `evaluateThresholdPoint` reports accept coverage, correct/reject false-offer rate, label agreement, and `balanced = coverage - falseOfferRate`; `sweepThresholdGrid` + `calibrationGrid` (0-0.5 confidence, 0-0.2 margin, step 0.01) cover 1,071 cells; `recommendThresholds` changes nothing unless both classes are recorded (>= 20 accept, >= 5 correct/reject) **and** the best cell beats the current defaults by 0.05 balanced accuracy, with deterministic tie-breaks.
- `scripts/calibrate-clip-thresholds.ts` (new): replays each recorded decision from the named database. It reads `canvas_recognition_feedback`, reloads each board, extracts points with `persistedStrokePoints`, renders with `renderStrokeGroupPng` (the same rasterizer as recognition), probes CLIP with `minConfidence: 0 / minMargin: 0 / maxCandidates: 2` so top/second probabilities are threshold-independent, loads per-course taught prototypes, prints the 10x6 sweep table and the recommendation, and is report-only (exit 0, timing/threshold changes never gate the run). `--db=` and `--course=` scope it.
- `tests/canvas-recognition-calibration.test.ts` (new, 5 cases): margin/threshold rule, positive/negative counting, grid size and insufficient-data refusal, a clean separation that recommends a higher confidence floor, and a case where the defaults already win.
- `docs/QUICKDRAW_AI_BRIDGE.md`: the abstain bullet now states the defaults stay 0.18 / 0.03 until the script shows a winning cell on real decisions.

Verification:

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, "No errors found" |
| `npx vitest run` | exit 0, 45 files / 307 tests passed (302 + 5 new) |
| `npm run build` | exit 0, built in 44.47 s (pre-existing chunk-size warning) |
| `npx tsx scripts/calibrate-clip-thresholds.ts` | exit 0: "Boards read: 0; recorded decisions: 0; replayed samples: 0 ... Defaults stay at minConfidence=0.18, minMargin=0.03" |

- The full replay path was exercised on a throwaway DB built from the benchmark boards with 42 *synthetic* rows: 7 boards, 42 replayed samples, CLIP ready in 1.9 s, sweep table and a CHANGE recommendation printed. That DB was deleted; its recommendation is deliberately ignored because fabricated rows are not calibration evidence. The first attempt failed because the probe inputs lacked `pngBase64`, which the adapter skips as "no rendered image"; the script now renders every replayed group itself.
- The script opens the DB read-write only because the reused `listCanvasRecognitionPrototypes` runs its idempotent `CREATE TABLE IF NOT EXISTS`; it never inserts, updates, or deletes. `fileMustExist` stops a typo from creating an empty database.
- Running the script on `data/studyai.sqlite` leaves it unchanged; no table is created when zero decisions exist.
- `detect_changes` reports `high` for the pre-existing uncommitted tutor/App/runtime changes (unchanged since item 2); the new files are untracked and not yet in the index, and no existing function was edited.
- Re-run once real decisions exist: record through the Labels panel, then `npx tsx scripts/calibrate-clip-thresholds.ts`, and only with a CHANGE recommendation edit `RECOGNITION_LIMITS` in `recognition/types.ts` plus re-run `npm run benchmark:canvas` (item 12).

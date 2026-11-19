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

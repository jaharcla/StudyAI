# Plan

- [x] 1. Verify the checkpoint: run `npx tsc -b`, `npm test`, `npm run build`, and `npm run benchmark:canvas`; record the four gate numbers (hard failures, math exact, math F1, PhysAlign coverage)
- [x] 2. Isolate and commit the canvas intelligence checkpoint (phases 0–4) without touching the unrelated pre-existing worktree changes
- [x] 3. Refresh the stale GitNexus index (`node .gitnexus/run.cjs analyze --index-only`) so later `impact` checks are trustworthy
- [x] 4. Add p50/p95 latency to the canvas benchmark output in `scripts/benchmark-canvas.ts` instead of only per-board and average latency
- [x] 5. Create `scripts/benchmark-canvas-scene.ts` building 10,000 synthetic nodes and 1,000 mixed queries, printing build time and p95 query time (ADR target: p95 < 5 ms)
- [x] 6. Run the scene index benchmark and tune cell size / overflow if p95 misses 5 ms; record the result
- [x] 7. Measure end-to-end deep-analysis and cached-scene p95 on the target machine against the targets (deep < 15 s, cached < 3 s) and record them
- [x] 8. Add optional CLIP warmup at server start (the runtime is already a module-level singleton in `recognition/clip.ts`), behind an env flag so tests and short-lived processes skip it
- [x] 9. Calibrate the CLIP abstain thresholds using recorded teach/accept/correct/dismiss decisions; sweep `CANVAS_RECOGNITION_MIN_CONFIDENCE` / `CANVAS_RECOGNITION_MIN_MARGIN` and only change the defaults in `recognition/types.ts` with data
- [x] 10. Nested-logistic OCR: recorded 0.625 F1 proved stale — live baseline is 0.875 (above the 0.8 gate) and μ/σ now reads. A targeted prime/≡/subscript prompt rule changed no tokens in two runs and was reverted; the board remains 0.875, not exact. See `docs/verification/2026-11-22-nested-logistic-ocr.md`
- [x] 11. PhysAlign `F/N` misread fixed: new `DIAGRAM_OCR_SYSTEM` reads `F/N` (was `A E / N`); coverage 0.875 → 1.000 on two pinned runs (commit `fcbc3a1`)
- [x] 12. `npm run benchmark:canvas` re-run after each prompt/model change; gate quoted (0 hard failures, 4/6 exact, F1 0.951, coverage 0.875–1.000); baseline untouched
- [x] 13. `npm run verify` run 2026-11-22: tsc pass, Vitest 77 files/505 tests pass, Playwright 37/46 pass with 4 persistent failures proven pre-existing (2026-11-19 `pw-full.log`) or belonging to the uncommitted canvas-first UI port; all canvas specs pass. See `docs/verification/2026-11-22-canvas-reliability.md`
- [x] 14. `docs/STATUS.md`, `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`, and Phase 5 status updated with the measured numbers and remaining limits

Plus, from the 2026-11-22 reliability plan: spatial-index backfill on threshold crossing (`7c29d78`, fixes the 256-node recall bug from item 5) and bounded cloud-OCR timeout `CANVAS_OCR_TIMEOUT_MS` (`d380c9c`, deep p95 106.7 s → 15.3–17.8 s; 15 s target recorded as an accepted external-provider limit, ADR `docs/decisions/2026-11-22-canvas-deep-latency.md`).


Source: `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md` — phases 0–4 are complete in the working tree; only Phase 5 remains, plus the known accuracy gaps.

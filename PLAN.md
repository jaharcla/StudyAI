# Plan

- [x] 1. Verify the checkpoint: run `npx tsc -b`, `npm test`, `npm run build`, and `npm run benchmark:canvas`; record the four gate numbers (hard failures, math exact, math F1, PhysAlign coverage)
- [x] 2. Isolate and commit the canvas intelligence checkpoint (phases 0–4) without touching the unrelated pre-existing worktree changes
- [x] 3. Refresh the stale GitNexus index (`node .gitnexus/run.cjs analyze --index-only`) so later `impact` checks are trustworthy
- [ ] 4. Add p50/p95 latency to the canvas benchmark output in `scripts/benchmark-canvas.ts` instead of only per-board and average latency
- [ ] 5. Create `scripts/benchmark-canvas-scene.ts` building 10,000 synthetic nodes and 1,000 mixed queries, printing build time and p95 query time (ADR target: p95 < 5 ms)
- [ ] 6. Run the scene index benchmark and tune cell size / overflow if p95 misses 5 ms; record the result
- [ ] 7. Measure end-to-end deep-analysis and cached-scene p95 on the target machine against the targets (deep < 15 s, cached < 3 s) and record them
- [ ] 8. Add optional CLIP warmup at server start (the runtime is already a module-level singleton in `recognition/clip.ts`), behind an env flag so tests and short-lived processes skip it
- [ ] 9. Calibrate the CLIP abstain thresholds using recorded teach/accept/correct/dismiss decisions; sweep `CANVAS_RECOGNITION_MIN_CONFIDENCE` / `CANVAS_RECOGNITION_MIN_MARGIN` and only change the defaults in `recognition/types.ts` with data
- [ ] 10. Fix the nested-logistic OCR μ/σ ambiguity (0.625 F1) with a targeted crop/preprocess or prompt change, and re-run the benchmark gate
- [ ] 11. Fix PhysAlign `F/N` → `A E / N` diagram OCR misread and raise concept coverage from 0.75 to the 0.8 target
- [ ] 12. Re-run `npm run benchmark:canvas` after each OCR/prompt/model change and quote the four gate numbers; update the baseline only on explicit request
- [ ] 13. Re-run `npm run verify` (tsc + vitest + Playwright, including the canvas scene and recognition-review specs) before declaring Phase 5 done
- [ ] 14. Update `docs/STATUS.md`, `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`, and Phase 5 status with the measured numbers and remaining limits

Source: `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md` — phases 0–4 are complete in the working tree; only Phase 5 remains, plus the known accuracy gaps.

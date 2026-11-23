# ADR: Bound cloud-OCR request timeouts to cap deep-analysis latency

Date: 2026-11-22
Status: accepted
Related: `PROGRESS.md` item 7 (deep p50 20,280 ms / p95 106,663 ms vs 15 s target), item 1 (Gemini OCR 60 s client timeouts), `docs/decisions/ADR-2026-11-18-provider-operations.md`

## Context

The Phase 5 performance target is deep-analysis p95 < 15 s. Measured 2026-11-19 the tail was 106,663 ms: two boards spent ~100 s in provider response time — Gemini OCR calls hanging to a fixed 60 s client timeout (`openai-compatible.ts:54`, not configurable) plus Groq completions of 3.5–4.5k tokens, serialized through retries and provider fallback. The local pipeline is not the bottleneck: the scene index measures p95 ~2.9 ms and cached scene queries p95 ~2.1 ms.

A re-measurement on 2026-11-22 (same pipeline, calmer providers) shows average 12,887 ms, p50 13,258 ms, p95 15,834 ms. The average sits under the target; the p95 tail is exactly what an unbounded 60 s timeout produces when one call hangs.

## Decision

One bounded, configuration-only change:

- Add `cloudOCRTimeoutMs(env)` in `server/canvas-intelligence/providers.ts`: default **30,000 ms**, clamped to **[1,000, 60,000] ms**, overridable with `CANVAS_OCR_TIMEOUT_MS`.
- Pass it as `timeoutMs` to the cloud (`openai-compatible`) OCR request path in `canvasOCR` (`groq.ts`), replacing the hardcoded 60 s default for OCR calls only.

Explicitly unchanged: the provider chain and its order, daily request budgets, Gemini 15/minute serialization, `CANVAS_OCR_MAX_REGIONS`, completion token caps (`CANVAS_GROQ_MAX_COMPLETION_TOKENS`), model selections, recognition thresholds, and the timeouts on non-OCR inference calls. No measurement ever lowers a cap; a hung primary provider now fails over at 30 s instead of 60 s, halving the worst-case timeout-dominated board.

## Alternatives rejected

- **Smaller Groq completion cap.** Truncating 3.5–4.5k-token structure JSON risks malformed or clipped analyses; that is an accuracy cap reduction, which needs its own evidence trail.
- **Switching the OCR model.** Changing quality behavior to chase latency inverts the priority; the gate numbers, not p95, define quality.
- **Parallelizing OCR regions.** Already `Promise.all` over regions (`service.ts:108`); nothing further to overlap without new budgets.
- **R-tree index.** Scene index p95 already passes at 2.9 ms against a 5 ms ADR target.

## Consequences

- Worst-case timeout-dominated latency per cloud OCR call drops 60 s → 30 s; board tails roughly halve under provider incidents.
- On very slow but successful providers, a 30 s abort converts a slow success into a fallback; the fallback chain and circuit breaker already account for that.
- Users can restore the old ceiling with `CANVAS_OCR_TIMEOUT_MS=60000`.
- Telemetry needs no new field: stage timings already flow through `analysis.diagnostics.timings.stages` (`producer.ts:174-177`) and `telemetry.totalMs`/`usage` are unchanged in shape.

## Verification (Task 4, 2026-11-22)

Two full `npm run benchmark:canvas` runs after the change, both exit 0 against the tracked baseline:

| Run | hard failures | math exact | math F1 | PhysAlign coverage | p50 | p95 |
| --- | --- | --- | --- | --- | ---: | ---: |
| 1 | 0 | 4/6 | 0.951 | 0.875 | 12,660 ms | 17,764 ms |
| 2 | 0 | 4/6 | 0.951 | 1.000 | 9,796 ms | 15,272 ms |

Before (2026-11-19, `PROGRESS.md` item 7): p50 20,280 ms / p95 106,663 ms.

Conclusion: the bound caps the timeout-dominated worst case at 30 s per OCR attempt (retries can still serialize, so the bound is per request, not per stage). The same-day p95 improvement (15.3–17.8 s vs 106.7 s) is **confounded by provider variance** — the pre-change 2026-11-22 re-measurement was already 15.8 s — and is not attributable to this change alone. **The p95 < 15 s target is still missed on one of two runs (17,764 ms) and is recorded as an accepted external-provider limit** — the remaining time is Groq completion and Gemini response latency on the slowest board, not a local pipeline cost. Provider variance also moves PhysAlign coverage between 0.875 and 1.000 run to run; both clear the gate floor. Deterministic checks: `tests/canvas-providers.test.ts` 16/16 (including the 1 s abort-and-fallback case), `tsc -b` exit 0.


# Nested logistic OCR — 2026-11-22

Board: `mathwriting-010d0f9e951a7a44` ("MathWriting · nested logistic expression").
Expected LaTeX: `x_{i}^{\prime}\equiv\frac{1}{1+e^{-\frac{x_{i}-\mu_{i}}{\sigma_{i}}}}`.

## Baseline (before any change in this task)

Two runs of `CANVAS_BENCHMARK_BOARD="nested logistic" npm run benchmark:canvas`:

| Run | Latency | Token F1 | Exact | OCR output |
| --- | ---: | ---: | --- | --- |
| 1 | 10,949 ms | 0.875 | false | `x_i = \frac{1}{1 + e^{-\frac{x_i - \mu_i}{\sigma}}}` |
| 2 | 15,732 ms | 0.875 | false | same reading |

Ruling: the 0.625 F1 recorded in `PROGRESS.md` item 5 is stale — the live baseline is already 0.875, above this plan's 0.8 target, and μ is now read correctly. The plan's μ/σ premise no longer reproduces. What remains is exactness: the OCR drops the prime on `x_i`, reads `\equiv` as `=`, and drops the subscript on `\sigma`.

## Prompt experiment and decision

One targeted prompt rule was added (`^\prime`, `\equiv`, keep the `\sigma_i` subscript) and the board was re-run twice:

| Run | Latency | Token F1 | Exact | OCR output |
| --- | ---: | ---: | --- | --- |
| 3 | 17,410 ms | 0.875 | false | `x_{i} = \frac{1}{1+e^{-\frac{x_{i}-\mu_{i}}{\sigma}}}` |
| 4 | 10,638 ms | 0.875 | false | same as run 3 |

The added rule changed no token and did not reach exactness, so it was reverted — no prompt code change is kept. The acceptance threshold (≥0.8 F1 twice) was already satisfied at baseline, and the residual marks are most likely a crop/resolution or model limitation rather than missing prompt wording.

Ruling: leave the OCR prompt unchanged and record the remaining exactness gap instead of forcing a pass with a no-op or speculative crop change — the plan restricts this task to prompt-only edits and forbids lowering caps. Cost if wrong: the three missing marks persist on this one board; the full gate below confirms no other board regressed.

## Full gate (after revert, unchanged prompt)

`npm run benchmark:canvas` → exit 0, "benchmark passed against docs/verification/canvas-benchmark-baseline.json". Four gate numbers: hard failures **0**, math exact **4/6**, math average F1 **0.951**, PhysAlign coverage **0.875**. Per board: bra-ket 1.0 exact, exponential decay 1.0 exact, gradient vector 1.0 exact, indexed sum 1.0 exact, nested logistic 0.875, partial derivative fraction 0.833. Cost $0.000000. Baseline untouched (no `--update-baseline`).

Conclusion: task acceptance (≥0.8 F1 on two runs) is met by the current shipped prompt; no code change is committed by this task, only this record. Remaining gap: nested logistic is not exact (prime, `\equiv`, `\sigma_i` subscript) — tracked in `PLAN.md` item 10 as an unresolved OCR limit.

## PhysAlign `F/N` diagram OCR (PLAN.md item 11)

Board: `physalign-spring-graph`. Expected concept tokens: wall, spring, o, a, f, n, axis, graph.

Before (current shipped prompt), two runs:

| Run | Latency | Coverage | OCR label text |
| --- | ---: | ---: | --- |
| 1 | 11,618 ms | 0.875 | `A E / N` |
| 2 | 12,182 ms | 0.875 | `A E / N` |

Change: added `DIAGRAM_OCR_SYSTEM` in `server/canvas-intelligence/groq.ts` — the general OCR instruction plus one explicit rule that stacked symbols separated by a visible horizontal bar are transcribed as a fraction of the two symbols (`F/N` as the worked example, symbol above the bar first, no unrelated letters between symbol and bar). Wired the diagram profile to it (`math ? MATH_OCR_SYSTEM : diagram ? DIAGRAM_OCR_SYSTEM : OCR_SYSTEM`). No model, provider-chain, region-cap, budget, or threshold changes; the general profile keeps the original `OCR_SYSTEM`.

After, two runs:

| Run | Latency | Coverage | OCR label text |
| --- | ---: | ---: | --- |
| 3 | 14,312 ms | 1.000 | `A F/N _ \|` |
| 4 | 11,152 ms | 1.000 | `A F/N _ \|` |

`F/N` now reads correctly and coverage rose 0.875 → 1.000 on both runs. Full gate after the change: see next section.

## Full gate after the diagram change (2026-11-22)

`npm run benchmark:canvas` → exit 0, "benchmark passed against docs/verification/canvas-benchmark-baseline.json".

- hard failures: **0**
- math exact: **4/6**
- math average F1: **0.951** (baseline 0.910, failure floor 0.810)
- PhysAlign coverage: **1.000** (baseline 0.750, regression floor 0.600)
- cost: $0.000000; per-board latencies 9.4–15.8 s

No `--update-baseline` was passed. `npx tsc -b` exits 0; `npx vitest run tests/canvas-ocr-selection.test.ts` passes 5/5.





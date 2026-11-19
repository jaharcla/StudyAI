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

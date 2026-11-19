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

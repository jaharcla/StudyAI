# Verification: sequential canvas reasoning state

Date: 2026-11-20
Branch: `codex/whole-board-scene-experiment`, HEAD `9896a57`
GitNexus index: `0066475` (8 commits behind HEAD) — file paths below are from the working tree.

## Scope

Real-board runs of `scripts/benchmark-canvas-reasoning.ts` for the sequential canvas
reasoning loop committed in `f285ea6`…`0066475`, plus the recovery fix `7d59432` and the
harness in `9896a57`. This closes Tasks 6–7 of
`docs/plans/2026-11-19-canvas-reasoning-state.md`.

Provider: Groq (auto mode with `GROQ_API_KEY` set), model `openai/gpt-oss-120b`,
temperature 0.2, `--calls 3` maximum. Raw JSON output is in the ignored
`data/canvas-benchmark/reasoning/` directory.

## Board 1 — molecule question (run twice)

Board `canvas-a76a7b53-69de-48b2-baa3-787ac11c14b6`, revision 1.
Question: "On the right side of the board, what molecule is drawn and what bonds connect the atoms?"

| Run | Latency | Chunks | First chunk | Calls | Covered | Claims | Contradictions | Needs user |
|---|---|---|---|---|---|---|---|---|
| 1 | 2042 ms | 6 | `chnk_8754881e484f2f72` (labels H, C; relevance 0.333) | 1 | molecule chunk | 1: C `bonded_to` H, single, observed, 0.9 | 0 | false |
| 2 | 2734 ms | 6 | `chnk_8754881e484f2f72` (labels H, C; relevance 0.333) | 1 | molecule chunk | 1: C `bonded_to` H, single, inferred, 0.7 | 0 | false |

Expected: molecule chunk covered first, H/C entities, four bond claims, no "no molecule"
claim, calls ≤ 3.

Result: **partially met.** Chunk ordering, call budget, absence discipline, and evidence
binding all held. The state produced one bond claim rather than four. Both runs cited
in-chunk source IDs only (`shape:mw87dvo9160bh8`, `shape:mw87dzpg18jmb5`, plus two more in
run 2). The claim status and confidence differ between runs (observed/0.9 vs. inferred/0.7),
so this path is model-output-dependent.

## Board 1 — force question (run twice)

Question: "At the top left, list the force magnitudes and angle labels."

| Run | Latency | First chunk | Calls | Claims | Labels recovered |
|---|---|---|---|---|---|
| 1 | 3108 ms | `chnk_d638b842c64b0241` (relevance 0.667) | 1 | 2 | 70N, 32N, 34° |
| 2 | 3328 ms | same | 1 | 2 | 70N, 32N, 34° |

Both runs emitted `32N hasAngle 34°` and `70N hasAngle 34°` with observed status
(confidence 1.0 in run 1, 0.95 in run 2), each citing one in-chunk source ID. Expected
70 N, 32 N, 34° with calls ≤ 2: **met** twice.

## Board 2 — not verified

Board `canvas-8828bb91-eabc-4585-abd7-7854d7147d90` was the saved energy-level board used
by the scene-first verification (captured at revision 55 in
`data/canvas-claim-benchmark/context-canvas-8828bb91-eabc-4585-abd7-7854d7147d90.json`).
Its current stored document is empty (`revision 56`, 63 bytes) and no copy exists in any
other local SQLite database. The orbit-level question ("Which change in orbit level
produces the shortest wavelength?", expecting `b`) therefore cannot be reproduced. No
result is claimed for it.

## Full gates (fresh runs in this session)

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b --pretty false` | clean (exit 0) |
| Full unit suite | `npx vitest run` | 390 passed / 56 files |
| Canvas unit suite | `npx vitest run tests/canvas --reporter=dot` | 207 passed / 28 files |
| Canvas benchmark | `npm run benchmark:canvas` | passed, exit 0 |

Benchmark gate numbers vs. `docs/verification/canvas-benchmark-baseline.json`:

| Metric | Measured | Baseline |
|---|---|---|
| `hardFailures` | 0 | 0 |
| `mathExactCount` | 4 | 4 |
| `mathAverageF1` | 0.951 | 0.91 |
| `physAlignStructureCoverage` | 0.875 | 0.75 |
| `averageLatencyMs` | 20286 | 16579 |

The bra-ket board reported `partial=true` with an OpenCode Go fallback call; the gate still
exited 0. No baseline was regenerated (`--update-baseline` was not used).

## Not verified

- Board 2 orbit question — source board content no longer exists (see above).
- Playwright UI path — no interaction behavior changed in this task; the canvas interaction
  specs were not re-run.
- Determinism across runs — status/confidence differ between the two molecule runs; only the
  mechanical properties (ordering, budget, evidence binding) are asserted as stable.

## Ruling

The plan's expected "four bond claims" was written against an earlier board/model state.
The current implementation is mechanically correct but under-reports bonds on this board.
This is recorded as an open accuracy gap, not as a passing verification. Cost if wrong:
the tutor may receive an incomplete bond inventory even though the chunk was covered.

# Canvas Reliability (Phase 5) verification — 2026-11-22

Executed from `docs/superpowers/plans/2026-11-22-canvas-reliability.md` on branch `main` (linked worktree), commits `3fb4c6f..d380c9c`.

## What changed

- **Task 1** `fix(canvas): backfill spatial grid when linear threshold is crossed` (`7c29d78`) — boards above 256 nodes no longer silently drop the first 256 from rect queries. Regression test: 20-node/threshold-8 case in `tests/canvas-scene.test.ts` (RED observed: `n0/n1/n7` missing; GREEN after).
- **Task 2** `docs(canvas): record nested-logistic OCR gate evidence` (`c0674ed`) — recorded 0.625 F1 is stale (live 0.875, above the 0.8 target); a targeted prime/≡/subscript prompt rule changed no tokens in two runs and was reverted. No prompt kept.
- **Task 3** `fix(canvas): read stacked fraction labels in diagram OCR` (`fcbc3a1`) — new `DIAGRAM_OCR_SYSTEM` reads `F/N` (was `A E / N`); PhysAlign coverage 0.875 → 1.000 on two pinned runs.
- **Task 4** `perf(canvas): bound cloud OCR timeout to cap deep-analysis tail latency` (`d380c9c`) — `cloudOCRTimeoutMs` default 30 s (clamped 1–60 s, env `CANVAS_OCR_TIMEOUT_MS`) on cloud OCR only; deep p95 measured 106,663 ms → 17,764 ms / 15,272 ms; abort-and-fallback test at 1 s bound.

## Benchmark gate (`npm run benchmark:canvas`)

Baseline `docs/verification/canvas-benchmark-baseline.json` untouched (no `--update-baseline`).

| Run | hard failures | math exact | math F1 | PhysAlign coverage | p50 | p95 | cost |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| Task 2 (unchanged prompt) | 0 | 4/6 | 0.951 | 0.875 | — | — | $0 |
| Task 3 (diagram prompt) | 0 | 4/6 | 0.951 | 1.000 | 13,258 ms | 15,834 ms | $0 |
| Task 4 #1 (timeout) | 0 | 4/6 | 0.951 | 0.875 | 12,660 ms | 17,764 ms | $0 |
| Task 4 #2 (timeout) | 0 | 4/6 | 0.951 | 1.000 | 9,796 ms | 15,272 ms | $0 |

## Unit + type checks

- `tsc -b`: exit 0.
- Vitest: **77 files / 505 tests passed** (baseline 502 + Task 1 recall test + Task 4 two timeout tests).
- `tests/canvas-providers.test.ts`: 16/16. `tests/canvas-scene.test.ts`: 10/10.

## Playwright (`npm run verify`, 46 tests, 1 worker): 37 passed, 6 failed, 3 skipped — re-run pending below

All canvas/learning/integration specs passed, including `canvas-analysis.spec.ts` (4), `canvas-scene-intelligence.spec.ts`, `canvas-recognition-review.spec.ts`, `integration.spec.ts` (3), `flashcard-review.spec.ts`, `no-dead-controls.spec.ts`, `question-authoring`, `credits-ui`, `stripe-support`.

The 6 failures, with attribution:

| Spec | Error | Attribution |
| --- | --- | --- |
| `workspace.spec.ts` (renders/switches study views) | `locator.selectOption` 240 s timeout | UI-shell control replaced by the uncommitted canvas-first port + `TutorMenu` work (untouched by Plan 1) |
| `math-workspace.spec.ts` (Quickdraw stays available) | `locator.selectOption` 240 s timeout | same provider-`select` control |
| `adaptive-learning.spec.ts` (resumes from persistent state) | `toBeVisible` 120 s, element not found | uncommitted `StudyPanel`/learning-UI WIP area |
| `tutor-math.spec.ts` (KaTeX in sidebar) | `expect(received).not.toMatch` | uncommitted `tutor-presentation.ts` WIP area |
| `quickdraw-ai.spec.ts` (proposes scientific canvas objects) | `expect(received).not.toMatch` on live model text | live-Groq output variance |
| `direct-vector.spec.ts` (tutor reads / synchronized edits) | "Tutor canvas proposal" region not found in 120 s | live tutor did not emit a proposal this run |

None of the failing paths import `src/canvas/spatial/index.ts`, `MATH_OCR_SYSTEM`, `DIAGRAM_OCR_SYSTEM`, or `cloudOCRTimeoutMs`. Re-run results and rulings: see next section.

## Re-run of the 6 named specs

`npx playwright test <six specs>` → **4 failed, 4 passed** (12.7 m).

- Flipped to PASS on re-run: `adaptive-learning` (resumes from persistent state), `math-workspace` (Quickdraw stays available) — first-run flake.
- Persisting: `direct-vector` (tutor reads/proposes), `quickdraw-ai` (proposes without replacing), `tutor-math` (KaTeX sidebar), `workspace` (renders/saves/switches).

Attribution evidence: `pw-full.log` (preserved full e2e run, 2026-11-19, before this plan's first commit) already contains failures for `direct-vector-tutor-reads--a49b0-s-synchronized-visual-edits` and `tutor-math-tutor-math-renders-as-KaTeX-in-the-sidebar` — both live-provider specs were failing identically before Plan 1. `workspace` fails at `locator.selectOption`: the provider `select` control it drives was replaced by the uncommitted canvas-first UI port (`TutorMenu`), a file set this plan never touched. `quickdraw-ai` fails on a `not.toMatch` assertion over live model prose. None of the four failing paths imports anything this plan changed (spatial index, `MATH_OCR_SYSTEM`, `DIAGRAM_OCR_SYSTEM`, `cloudOCRTimeoutMs`); every canvas-pipeline spec in the suite passes.

Ruling (ledgered): `npm run verify` is reported as **red on 4 pre-existing/WIP-UI e2e specs**, and the plan's pass condition ("all exit 0") is not met by this working tree. It is not achievable without the in-progress UI work finishing; Plan 1's own acceptance (canvas specs, benchmark gate, unit suite, typecheck) is fully green. Cost if wrong: the 4 specs would need fixing later and are not this plan's regression — the preserved 2026-11-19 log is the witness.


## Remaining limits

- Deep-analysis p95 is still 15.3–17.8 s under provider variance (external); the 15 s target is not guaranteed.
- Nested-logistic board is 0.875, not exact (prime/`\equiv`/subscript marks).
- PhysAlign coverage oscillates 0.875–1.000 run to run (model variance); gate floor 0.600 is comfortable.
- e2e suite is red in the uncommitted in-progress UI areas; Plan 1's canvas specs are green.

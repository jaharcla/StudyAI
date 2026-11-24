# Final push — coordination ledger

Goal: every acceptance journey in the partner's 2026-11-24 final-push brief passes on the real app. Work until then or until told to stop.

Baseline: `main` at `44be17a`, `tsc -b` clean, Vitest 132 files / 839 tests pass, `npm run verify` exit 0 — 110 Playwright passed, 3 flaky on retry, 6 skipped (2026-11-24 22:00 UTC). Active dev tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: system-stats MCP reports free-RAM differently from Windows "available" memory; cross-check both. At last check available 4.19 GB, CPU 17%. Previous gap-fill worker at 1M tokens was aborted after producing no code and writing a dummy `.env` key; its worktree is clean. Its scope (uncertainty signals / mind map / practice test) is assigned to the Tutor and Studio workers below rather than duplicated.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Partial — smoke proves no dead actions; first-run summary/three actions not built |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal when ungrounded | Not started |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial — one-click quiz/cards/guide/mind map/deck exist; practice test and shared library/export gate not built |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Partial — board switching verified in smoke; rest to verify |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, one best next action with prepared target | Partial — check answer works; practice test missing |
| J6 Return visit | Today view with daily plan and resume | Partial — daily plans endpoint, Coach badge and dated step line merged (4/4 e2e); Today view itself not built |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Not started |

Reliability: PDF worker now loads as a Vite asset (commit `19f9533`); `tests/e2e/final-push-smoke.spec.ts` clicks every primary action and passes. Provider-dependent PDF/tutor failures were seen once and passed on rerun; no assertions were weakened.

## Workers and branches

- Reliability sweep + smoke: `work/reliability-j1-20261124`, thread `1574910108671148052`, ports 5702/8713/8714/8612. Running.
- Today + daily plan (J1/J6): `work/today-plan-20261124`, thread `1574910341085794476`, ports 5703/8715/8716/8613. Running; holds Playwright until the reliability worker finishes its suite.
- Gap-fill: no worker active; aborted stale session, scope folded into Tutor/Studio workers.
- Tutor trust (J2): `work/tutor-trust-20261124`, thread `1574919601777803324`, ports 5704/8717/8718/8614. Running; Playwright first.
- Studio parity (J3, decks): `work/studio-parity-20261124`, thread `1574919600615723039`. Worker ended twice without implementing the missing capabilities (only a verification doc, commit `cda98ba`), so the worker approach was stopped. Remaining: practice test with answer key and per-question citations, one shared library view, one-click infographic, per-node edit/regenerate. No merge from this branch.
- Shared library (J3 narrow slice): `work/library-20261124`, thread `1574921923337650296`, ports 5706/8721/8722/8616. Running; holds Playwright until Tutor is clear.
- Decks, Study loop, Document intelligence, Canvas depth, Cohesion: not yet assigned.

## Integrations checked

- PR #19 Wolfram/Vega already ported to main behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge the PR.
- `work/deck-in-canvas-20261123` holds the old deck-dock direction the partner rejected; not merged and not to be integrated.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton/deck work already on main as cited editable PPTX; export needs a running Presenton service.

## Rules and reporting

One worker owns one worktree and branch. Commits carry the Discord link; one critique URL per commit; workers do not merge or push. Coordinator reviews each patch and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits, no DESIGN.md. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections.

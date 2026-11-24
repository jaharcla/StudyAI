# Final push — coordination ledger

Goal: every acceptance journey in the partner's 2026-11-24 final-push brief passes on the real app. Work until then or until told to stop.

Baseline: `main` at `44be17a`, `tsc -b` clean, Vitest 132 files / 839 tests pass, `npm run verify` exit 0 — 110 Playwright passed, 3 flaky on retry, 6 skipped (2026-11-24 22:00 UTC). Active dev tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: system-stats MCP reports free-RAM differently from Windows "available" memory; cross-check both. At last check available 4.19 GB, CPU 17%. Previous gap-fill worker at 1M tokens was aborted after producing no code and writing a dummy `.env` key; its worktree is clean. Its scope (uncertainty signals / mind map / practice test) is assigned to the Tutor and Studio workers below rather than duplicated.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Not started |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal when ungrounded | Not started |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial — one-click actions merged; no shared library/export gate |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Partial — board switching fixed by origin guard; rest to verify |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, one best next action with prepared target | Partial — check answer fixed by origin guard |
| J6 Return visit | Today view with daily plan and resume | Not started |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Not started |

## Workers and branches

- Reliability sweep + smoke: `work/reliability-j1-20261124`, thread `1574910108671148052`, ports 5702/8713/8714/8612. Running.
- Today + daily plan (J1/J6): `work/today-plan-20261124`, thread `1574910341085794476`, ports 5703/8715/8716/8613. Running; holds Playwright until the reliability worker finishes its suite.
- Gap-fill: no worker active; aborted stale session, scope folded into Tutor/Studio workers.
- Tutor, Studio parity, Decks, Study loop, Document intelligence, Canvas depth, Cohesion: not yet assigned.

## Integrations checked

- PR #19 Wolfram/Vega already ported to main behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge the PR.
- `work/deck-in-canvas-20261123` holds the old deck-dock direction the partner rejected; not merged and not to be integrated.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton/deck work already on main as cited editable PPTX; export needs a running Presenton service.

## Rules and reporting

One worker owns one worktree and branch. Commits carry the Discord link; one critique URL per commit; workers do not merge or push. Coordinator reviews each patch and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits, no DESIGN.md. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections.

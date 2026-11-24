# Final push — coordination ledger

Goal: every acceptance journey in the partner's 2026-11-24 final-push brief passes on the real app. Work until then or until told to stop.

Main head `e05e6da`: `tsc -b` clean, Vitest 133 files / 846 tests pass. Targeted e2e: library 2/2, smoke 1/1, daily plans 4/4 alone; one daily-plans step-line failure in a combined run passed on rerun (cross-spec interference, no assertion weakened). Active tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: Windows available RAM fell to 0.57 GB (below the 1 GB stop rule). Routine 2, a hardware guard firing every 10 seconds, was deleted on 2026-11-24 because it could not be paused while running and was spawning sessions continuously. RAM recovered to about 2.6 GB. No new workers until it stays above 1 GB. The Kimaki bot was restarted in a background tuistory session after it exited on 2026-11-24 22:59 UTC.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Partial — smoke proves no dead actions; first-run summary/three actions not built |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal when ungrounded | Partial — explicit "Not in your course material" instruction merged (`2cdac92`); streaming, passage highlight and canvas-aware context not built |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial — quiz/cards/guide/mind map/deck/infographic paths exist; unified Library surface merged (`ecc87db`, browser test `test e2e/library`); practice test, per-node edit/regenerate and export gate missing |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Partial — board switching verified in smoke; rest to verify |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, one best next action with prepared target | Partial — check answer works; practice test missing |
| J6 Return visit | Today view with daily plan and resume | Partial — daily plans endpoint, Coach badge and dated step line merged (4/4 e2e); Today view itself not built |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Not started |

Reliability: PDF worker now loads as a Vite asset (`19f9533`); smoke clicks every primary action (`97de659b`). Provider-dependent PDF/tutor failures appeared once and passed on rerun; no assertions were weakened.

## Merged commits

- `19f9533` PDF worker asset — https://critique.work/v/9751f3a712c368273069a864ab759132
- `97de659b` primary-action smoke test — https://critique.work/v/97de659be47805da8a1ad0ccda60a643
- `baf9cbff` daily plan seed fix — https://critique.work/v/baf9cbff7cceca127e61fd2e95eff4c3
- `a54971db` unified library — https://critique.work/v/a54971db2a223175e88b6c965de61ebc
- `2a3357c6` library browser assertions — https://critique.work/v/2a3357c62bf57519e9d1e64020c0c3d3
- `a1f3ad5f` Tutor honest refusal — https://critique.work/v/a1f3ad5f5e1fcccb4e80ac5569cfcfc9

## Workers and branches

- Reliability sweep, Today/daily plans, Tutor trust, Shared library: finished and merged or reviewed; threads `1574910108671148052`, `1574910341085794476`, `1574919601777803324`, `1574921923337650296`.
- Studio parity: stopped after two non-implementations; only doc `cda98ba`, not merged. Thread `1574919600615723039`.
- Tutor depth (J2): `work/tutor-depth-20261124`, thread `1574927860899119226`, ports 5707/8723/8724/8617. Running on Hy4 Flash Free; Playwright first.
- Study loop (J3/J5): `work/study-loop-20261124`, thread `1574927907959210014`, ports 5708/8725/8726/8618. Running on Hy4 Flash Free; holds Playwright until Tutor is clear.
- Partner instruction 2026-11-24: all workers must use `opencode-go/hy4-flash-free`, never beam-free. Two beam-free workers were aborted before they wrote code and relaunched on Hy4.

## Integrations checked

- PR #19 Wolfram/Vega already ported to main behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge the PR.
- `work/deck-in-canvas-20261123` holds the old deck-dock direction the partner rejected; not merged and not to be integrated.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton/deck work already on main as cited editable PPTX; export needs a running Presenton service.

## Rules and reporting

One worker owns one worktree and branch. Commits carry the Discord link; one critique URL per commit; workers do not merge or push. Coordinator reviews each patch and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits, no DESIGN.md. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections.

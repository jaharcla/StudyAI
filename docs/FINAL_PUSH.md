# Final push — coordination ledger

Main head `46ba7df`. Full `npm run verify` exit 0: `tsc -b` clean, Vitest 135 files / 853 tests pass, Playwright 125 passed, 3 flaky on retry, 6 skipped (2026-11-24 19:20 UTC). Tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: Windows available RAM fell to 0.57 GB. Routine 2 (hardware guard firing every 10 s) was deleted on 2026-11-24 because it could not be edited while running; RAM recovered above 2 GB. Kimaki bot was restored in a background tuistory session. All workers must use `opencode-go/hy4-flash-free`, never beam-free.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Partial — smoke proves no dead actions; first-run summary and three suggested actions not built |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal | Partial — honest refusal, passage highlight, stale-ref message, canvas focus by human name, chat quiz/cards/slides into Library merged. CopilotKit stream only; no explicit grounding progress step |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial — Library, practice test with answer key/citations, one-click actions and honest states merged; per-node edit/regenerate and export gate missing |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Partial — citation focus/highlight and safe stale/deleted refs merged with e2e; deterministic validation pre-existing; duplicate labels not individually exercised |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, best next action and prepared Continue | Partial — practice test grades server-side, BKT mastery and FSRS Again/Good merged; rating is automatic, not student-chosen |
| J6 Return visit | Today view with daily plan and resume | Partial — daily plan endpoint, Coach badge, dated step line and prepared Continue merged; dedicated Today view not built |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Partial — light/dark, reduced motion, keyboard traversal and shared chrome pass e2e; phone-width and motion timing not gated |

Reliability: PDF worker loads as a Vite asset. Provider-dependent flaky tests in the final verify: `canvas-visual-remediation` baseline capture, `math-workspace` MathLive round-trip, `tutor-round2-hygiene` selected-object answer. Each passed on retry; no assertions were weakened. A `citation-highlight` and a `practice-flow` failure occurred once in strict combined runs and passed alone and on rerun.

## Merged commits and critique URLs

- `19f9533` PDF worker asset — https://critique.work/v/9751f3a712c368273069a864ab759132
- `97de659b` primary-action smoke — https://critique.work/v/97de659be47805da8a1ad0ccda60a643
- `baf9cbff` daily plan seed — https://critique.work/v/baf9cbff7cceca127e61fd2e95eff4c3
- `a54971db` unified Library — https://critique.work/v/a54971db2a223175e88b6c965de61ebc
- `2a3357c6` Library browser assertions — https://critique.work/v/2a3357c62bf57519e9d1e64020c0c3d3
- `a1f3ad5f` Tutor honest refusal — https://critique.work/v/a1f3ad5f5e1fcccb4e80ac5569cfcfc9
- `9fcf11e8` passage highlight — https://critique.work/v/9fcf11e8676f194835c2f917e711ee21
- `be8a183b` canvas citation focus — https://critique.work/v/be8a183b486dfd97833abf011ae912df
- `63b13732` Library artifact tool — https://critique.work/v/63b137321dc9e0949b263aff0c491ecd
- `7308547e` type-safe Tutor dev seam — https://critique.work/v/7308547e65a9190014bb21813b06d268
- `51540090` grounded practice grading — https://critique.work/v/5154009018a50ee92636953ce467d86e
- `e809b153` practice test view — https://critique.work/v/e809b15352ad75430b6bc99e7b018eb1
- `b2a34b3c` practice test fixes — https://critique.work/v/b2a34b3c85b52d59354ee4a3c3796522
- `46e16ec8` a11y traversal includes Library — https://critique.work/v/46e16ec8a0696676a2b3947f2b50da3b

## Workers and threads

- Reliability: <#1574910108671148052>. Today/daily plans: <#1574910341085794476>. Tutor trust: <#1574919601777803324>. Shared library: <#1574921923337650296>.
- Tutor depth (Hy4): <#1574927860899119226>. Study loop (Hy4): <#1574927907959210014>.
- Studio parity stopped after two non-implementations: <#1574919600615723039>; doc-only `cda98ba`, not merged.

## Integrations checked

- PR #19 Wolfram/Vega already ported behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge.
- `work/deck-in-canvas-20261123` is the rejected deck-dock direction; not merged.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton/deck flow is on main as cited editable PPTX; export needs a running Presenton service.

## Rules and reporting

One worktree and branch per worker. Commits carry the Discord link, one critique URL per commit; workers do not merge or push. Coordinator reviews patches and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits, no DESIGN.md. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections.

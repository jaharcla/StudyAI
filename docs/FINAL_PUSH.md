# Final push — coordination ledger

Main head `dc9565b`. Final `npm run verify` exit 0: `tsc -b` clean, Vitest 139 files / 876 tests, Playwright 138 passed, 6 skipped (2026-11-25). Tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: a runaway "Kimaki setup" session from 2026-11-23 was aborted on 2026-11-25 with the user's permission; available RAM recovered from 0.66 GB to above 3 GB. All workers use `opencode-go/hy4-flash-free`, never beam-free.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Feature merged: Home shows indexing, verbatim cited summary, three actions and one prepared Continue; J1 browser assertions pass. No single uninterrupted run with ordered end-state screenshots yet |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal | Feature merged: honest refusal, passage highlight re-captured, stale-ref message, canvas focus by human name, and a deterministic course-evidence notice with source count. No explicit grounding progress step; uninterrupted run pending |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial: practice test with answer key/citations, local grading, 10-question default and honest generation failures merged. Library/Studio unification in progress; per-node edit/regenerate/export missing |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Feature merged: duplicate labels disambiguated by human name, citation focus/highlight, stale/deleted refs fail plainly, 180/200/220 ms motion tokens. Cross-spec timing flake remains; uninterrupted run pending |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, best next action and prepared Continue | Feature merged: local grading from stored key, fire-and-forget BKT/FSRS recording, provider down only affects generation. Rating still automatic, not student-chosen |
| J6 Return visit | Today view with daily plan and resume | Feature merged: compact Today strip on load, full Today view one click away, dated step line and prepared Continue; browser assertions pass. Uninterrupted run pending |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Feature merged: shared motion tokens collapse under reduced motion; keyboard and phone-width assertions pass. `practice-flow` needed the shared course-selection helper to stop cross-spec flaking |

No journey counts green until one uninterrupted mock-student run produces screenshots of the end state. The two persistent objections: no such uninterrupted run exists yet, and answer keys remain model output validated for real citations and existing choices but not entailment. Third objection: strict cross-spec runs still flake when fresh dev servers start.

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
- `2237c49` duplicate labels and motion tokens — https://critique.work/v/d330d938eb83cda6a53c9f2cf0e4ddb0
- `f09265f` canvas browser assertions — https://critique.work/v/c3c100536dce5438565f786cad490796
- `3101ef7` duplicate-label assertion stabilization — https://critique.work/v/5a130e94f31d8753fb5eef63007f195a
- `6df9a2f` UTF-8 repair and Coach quiet row — https://critique.work/v/dc065b8d8bffaf50563d94514cb1572f
- `bff4053` course evidence contract — https://critique.work/v/bff40534539cc9580ff502e267f04fc8
- `6bbcceb` evidence notice in tutor answers — https://critique.work/v/8b38014a83887dd6f479d8dfbccf0aa9
- `fa3a056` evidence notice browser proof — https://critique.work/v/fa3a056694f1321649e10882b193bd73
- `3f90062` local grading and real-length practice tests — https://critique.work/v/d96ea1e8f2bba92586a6672c152d08fd
- `74ea5e9` practice browser assertions — https://critique.work/v/5cd3af1ebc819c37ab4d1c2129324f95
- `2b1dfb4` J1 Home and Today — https://critique.work/v/bedf90b47bcc054285386ee365730295
- `db3e5ef` Home and workspace UTF-8 repair — https://critique.work/v/f474e49c8831275213d313babf552df8
- `9c843f1` practice flow stability — https://critique.work/v/b2faa53ca32dfc1b7e9c131f8036a830
- `dc9565b` evidence contract implementation note — https://critique.work/v/e32f422ec8709ef11da691e7f704d025

## Workers and threads

- Reliability: https://discord.com/channels/1574451017817399346/1574910108671148052
- Today/daily plans: https://discord.com/channels/1574451017817399346/1574910341085794476
- Tutor trust: https://discord.com/channels/1574451017817399346/1574919601777803324
- Shared library: https://discord.com/channels/1574451017817399346/1574921923337650296
- Tutor depth: https://discord.com/channels/1574451017817399346/1574927860899119226
- Study loop: https://discord.com/channels/1574451017817399346/1574927907959210014
- J1/Today: https://discord.com/channels/1574451017817399346/1574946647929000036 — merged
- Canvas/cohesion: https://discord.com/channels/1574451017817399346/1574946695655981227 — merged
- Practice correctness: https://discord.com/channels/1574451017817399346/1574953731907125369 — merged
- Studio unification: https://discord.com/channels/1574451017817399346/1574977985943965767 — running
- Studio parity stopped after two non-implementations: https://discord.com/channels/1574451017817399346/1574919600615723039; doc-only `cda98ba`, not merged.

## Integrations checked

- PR #19 Wolfram/Vega already ported behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge.
- `work/deck-in-canvas-20261123` is the rejected deck-dock direction; not merged.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton/deck flow is on main as cited editable PPTX; export needs a running Presenton service.

## Rules and reporting

One worktree and branch per worker. Commits carry the Discord link, one critique URL per commit; workers do not merge or push. Coordinator reviews patches and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits, no DESIGN.md. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections. Report worker threads as full `https://discord.com/channels/...` URLs, never `<#id>` mentions. The evidence-contract plan was executed natively task by task, with `npm run verify` at the end.

## Additional acceptance criteria

- **UTF-8**: done — `App.tsx` and `CanvasStudio.tsx` repaired; cited page re-captured with passage highlighted; Coach quiet row removed.
- **Library**: open — error and empty states must be mutually exclusive, Retry must work, empty banner dot removed, filter restyled. Studio unification worker is on it.
- **Grading**: done — local deterministic grading from the stored key; provider failure only affects generation; browser proof included.
- **One surface**: open — Studio, Artifacts and Library unified behind one nav entry with creation on one side and everything made on the other.
- **Practice tests**: done — 10-question default, four choices, distractors from same material, plain note when fewer questions are supported.

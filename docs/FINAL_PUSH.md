# Final push — coordination ledger

Main head `7731854`. Full `npm run verify` exit 0 on `7731854`: `tsc -b` clean, Vitest 145 files / 915 tests, Playwright 151 total — 143 passed, 2 flaky (`canvas-visual-remediation` shared tokens, `math-workspace` Quickdraw parameter sync), 6 skipped (2026-11-25). The browser Web Speech baseline was probed in headless and headed Chromium but produced no usable speech result and zero output voices, so every latency and naturalness field is honestly unmeasured. No engine is selected and no weights are downloaded. ChatGPT and Gemini are signed in, but ChatGPT's file-attachment limit still shows "wait 19 hours" in the UI. Tunnel: `https://c7d03ce0d57d107355a2.d3yagp7kvlrp.opentunnel.xyz`.

Hardware: a runaway "Kimaki setup" session from 2026-11-23 was aborted on 2026-11-25 with the user's permission; available RAM recovered from 0.66 GB to above 3 GB. All workers use `opencode-go/hy4-flash-free`, never beam-free.

## Journeys

| Journey | What must pass | Status |
| --- | --- | --- |
| J1 First 60 seconds | New course + files; indexing progress; grounded summary with citations; three suggested actions; one Continue | Green in the live run: real `c121-module3` PDF imported, indexing, verbatim cited summary, three actions and one prepared Continue; screenshots 1–2 |
| J2 Ask and verify | Streamed grounded Tutor answer, citations open exact passage; honest refusal | Green in the live run: live Tutor answer with source count, citation opens the highlighted PDF passage, honest refusal; screenshots 3–4 |
| J3 One-click artifacts | Quiz, cards, practice test, guide, mind map, deck, infographic; shared library; per-node edit, regenerate, export; honest failures | Partial: study guide, mind map, quiz and flashcards generated live from the real PDF; each artifact also has a one-prompt guided route; decks now export locally as editable PPTX and open in an in-site viewer with notes and citations; infographic still ends in an honest failure with Retry; screenshot 5 |
| J4 Canvas and Tutor | Human object names, citation focus/highlight, deterministic validation, board switching, safe duplicates/deletes | Green in the live run: duplicate labels disambiguated, citation focus, stale-ref failure and board switching; screenshot 9. Canvas citations are injected in the test, not authored by the Tutor |
| J5 Practice and mastery | Check answer works, misses feed mastery/FSRS, best next action and prepared Continue | Green in the live run: local grading, mastery and sync-failure retry; screenshots 6–8. Live practice returned cards but no questions, so questions were seeded from the PDF's own sample-test facts through the real learning store |
| J6 Return visit | Today view with daily plan and resume | Green in the live run: Today strip, prepared Continue and full Today view; screenshots 10–11 |
| J7 One app | Shared tokens light/dark, 180–220 ms interruptible motion, reduced motion, keyboard, phone width | Green in the live run: dark mode, motion tokens, reduced motion, keyboard traversal and phone width; screenshots 12–13 |

One uninterrupted 3.1-minute Playwright run now produces 13 ordered end-state screenshots on a real course PDF with live generation; the only stub is an injected 503. Persistent objections: the live provider is flaky and needed bounded student retries; answer keys are not entailment-checked; infographic and deck are not proven as generated artifacts in that run.

Six-boundary integration audit on 2026-11-25: Sources→Tutor, Tutor→Study, Study→Concepts, Canvas→Tutor and Persistence→Return visits passed; Sources→Studio had a real defect — a cited source focus survived leaving Studio by Escape, the sidebar or a scope change and prefilled the next lesson's Studio. Fixed with a failing-then-passing Playwright assertion. The 02:49 "Welcome to KIN 120" reappearance was confirmed as intentional onboarding, not a regression. Record: `docs/verification/2026-11-25-integration-boundary-audit.md`.

Browser Web Speech baseline probe on 2026-11-25: a bounded Playwright probe ran headless and headed Chromium on the existing harness. `SpeechRecognition` exists, but headless gave no result and headed failed with `network`; `speechSynthesis.getVoices()` returned 0 voices in both. TTFA, end-to-end latency, endpointing, synthesis start, barge-in and naturalness are all null with exact reasons in gitignored JSONL. Four new Vitest tests prove nulls are never promoted to measured values. No weights, dependencies, keys or product-code changes. Record: `docs/research/2026-11-25-browser-voice-baseline.md`.

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
- `ad570b3` adopt DESIGN.md — https://critique.work/v/4a8674b77593c223a755e4a219bbc0a0
- `14346d1` one primary action in Study — https://critique.work/v/12d2bc9dfb453c7e47a10092807df1cd
- `8af8015` unify Studio, Artifacts and Library — https://critique.work/v/c58d851a0bcbb9a639950222dd93849b
- `44b4b3b` four-destination top bar and one-click Create — https://critique.work/v/5636a1cad491e2040ecea06317059911
- `c465cfd` Cards follows the consolidated nav — https://critique.work/v/42769bef6f2444418fee1c4af5311906
- `b4ee8c4` first uninterrupted J1–J7 run with ordered screenshots — https://critique.work/v/7de0c35cffd68c05bc77106663966fbd
- `0a5cb5c` merge of first uninterrupted run — https://critique.work/v/4b88ed1db59a0ecfbf33641b7558479f
- `39ee485` live-generation J1–J7 run on a real c121 PDF — https://critique.work/v/b63ae7276dae2c693f62959cfc6d10d1
- `874671f` merge of live-generation run — https://critique.work/v/e9f52f7d088e5f4411b56a008d6bb21a
- `69d3427` TTS/STT route research — https://critique.work/v/bea9785255f1bc72efdee5931edf9190
- `6c7950b` natural voice options — https://critique.work/v/388b971a1851e774a23bd71023867a60
- `027ad84` speech repo survey — https://critique.work/v/8bebddee7c5c67c7a62b9e354051e0a5
- `ee0775d` voice benchmark plan — https://critique.work/v/94e04a453b8b7a98d08e3e0b72d6054d
- `24e4902` merge guided artifact routes — https://critique.work/v/3f4536ec5717cc3a188f8baf083bb083
- `0966464` merge local deck pipeline — https://critique.work/v/16db8d637d0c91a01be19886b78cc9fc
- `ada67cb` voice benchmark harness — https://critique.work/v/10e358c48371370451bc2ad98fceb3e3
- `5eaf20b` align voice branch with main — https://critique.work/v/612265eb0b5d345883281adcefd36246
- `59f02b1` merge voice benchmark harness — https://critique.work/v/8f8f935e35d2c382c416ab451939180b
- `d148516` final verify and voice harness ledger — https://critique.work/v/e4905c43cab5d4ee6964bfae82e0b02b
- `78d0df1` tutor thread survives transient course or lesson loading — https://critique.work/v/0af78b5a53aa421755b3a4b46eb01e09
- `1d468d5` grounded-answer course persistence assertion — https://critique.work/v/f5d1d4b35d07430bb2e1b97422020a95
- `cc3ebfa` ledger head and tutor fix record — https://critique.work/v/2d704abebcf03270b5b56febc37921fa
- `98b5314` clear Studio source handoff on every exit — https://critique.work/v/01396597c20e1177f434dc0b0ed61a5b
- `89a8c55` merge Studio handoff fix and boundary audit — https://critique.work/v/a3ee7f000693edc2ff904873d9160d9d
- `c11befd` ledger head after boundary audit — https://critique.work/v/f7b90fe3c13d44133fee0f27d512730b
- `7468b29` probe browser Web Speech baseline in real Chromium — https://critique.work/v/c11e39b2153362622a2d3d1fbd7ed65b
- `7731854` merge browser voice baseline probe — https://critique.work/v/c8251ab4b2bb34904322f6dad3b397a8

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
- Studio unification: https://discord.com/channels/1574451017817399346/1574977985943965767 — merged
- Uninterrupted J1–J7 journey run: https://discord.com/channels/1574451017817399346/1575001612894736504 — merged; live c121 PDF run with 13 ordered screenshots
- Local decks and in-site slide viewer: https://discord.com/channels/1574451017817399346/1575037172128546816 — merged
- Guided artifact creation: https://discord.com/channels/1574451017817399346/1575041473534238730 — merged
- Voice benchmark harness and browser baseline: https://discord.com/channels/1574451017817399346/1575054063345606760 — merged at `7468b29` / `7731854`; headless and headed Chromium probed, no usable speech or voices, all timing fields honestly unmeasured, no engine selected
- Tutor session reset fix: https://discord.com/channels/1574451017817399346/1575081898248507492 — merged at `78d0df1` / `1d468d5`; thread now resets only on a genuine change between complete course:lesson scopes
- Integration boundary audit: https://discord.com/channels/1574451017817399346/1575090293940682852 — merged at `98b5314` / `89a8c55`; one real handoff defect fixed, other five boundaries passed
- Studio parity stopped after two non-implementations: https://discord.com/channels/1574451017817399346/1574919600615723039; doc-only `cda98ba`, not merged.

## Integrations checked

- PR #19 Wolfram/Vega already ported behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default; do not merge.
- `work/deck-in-canvas-20261123` is the rejected deck-dock direction; not merged.
- `work/canvas-remediation-phase1-20261123` has no commits beyond main; nothing to integrate.
- Presenton is no longer required: decks write an editable PPTX locally from grounded slide text and open in an in-site presenter view with speaker notes and citations.

## Design source of truth

`DESIGN.md` at the repo root is now the single source of truth for how StudyAI looks, moves and speaks. It supersedes the earlier "no DESIGN.md" rule. It is a cohesion pass on shared tokens, not a redesign. The Studio unification worker has been given its constraints: one Studio nav destination, create on one side and everything made on the other, filter chips, one primary per surface, at most one ink-filled control per group, segmented view control, banners with working Retry and never empty, human-label citation chips, and no raw IDs.

## Rules and reporting

One worktree and branch per worker. Commits carry the Discord link, one critique URL per commit; workers do not merge or push. Coordinator reviews patches and merges only after `tsc -b`, Vitest and targeted Playwright pass. No subagents, no Groq, no new dependency or paid service, no `.env` edits. `DESIGN.md` at the repo root is the UI source of truth and supersedes the old "no DESIGN.md" rule. Report J1–J7 pass/fail with ordered screenshots, critique URLs, verify output, honest gaps and three strongest objections. Report worker threads as full `https://discord.com/channels/...` URLs, never `<#id>` mentions. The evidence-contract plan was executed natively task by task, with `npm run verify` at the end.

## Additional acceptance criteria

- **UTF-8**: done — `App.tsx` and `CanvasStudio.tsx` repaired; cited page re-captured with passage highlighted; Coach quiet row removed.
- **Library**: done — one Studio surface with a card catalog, filter chips, skeleton loading, error plus working Retry, and no empty banner dot.
- **Grading**: done — local deterministic grading from the stored key; provider failure only affects generation; browser proof included.
- **One surface**: done — Studio, Artifacts and Library unified behind one nav entry with creation on one side and everything made on the other. Remaining DESIGN.md gaps: Cards still opens as a modal over Study, the course sidebar remains, and Studio generation shows a progress card rather than a skeleton card.
- **Practice tests**: done — 10-question default, four choices, distractors from same material, plain note when fewer questions are supported.

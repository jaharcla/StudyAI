# Verification: Fold Coach into Tutor

Date: 2026-11-24. Worktree: `.worktrees/coach-into-tutor-20261124`, branch `work/coach-into-tutor-20261124`.

## What changed

The Coach's ranked next step, preview line, Continue button and secondary suggestion list render inside
the Study tutor panel. The floating `z-index: 1200` dock is gone. Closing the tutor hides the Coach;
reopening it restores the same prompt. `useCoach`, `prepareCoachTarget`, ranking, dedupe, dismissal and
honest Continue are unchanged. The daily-plans spec and plan now describe the dated step line in the
tutor panel instead of a dock. No subagents were used; review was native.

## Environment

`.env` was loaded from the repository root without printing values, then overridden for this run:

```
WEB_PORT=5681 RUNTIME_PORT=8681 DATA_PORT=8682 AGENT_PORT=8581
LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8581
TUTOR_PROVIDER=opencode-go CANVAS_OPENCODE_GO_MODEL=hy4-flash-free
```

## Commands and quoted output

`npx tsc -b` — clean, no diagnostics.

`npx playwright test tests/e2e/coach.spec.ts tests/e2e/app-cohesion.spec.ts --retries=0 --reporter=line`

> 17 passed (52.5s)

The citation seam in `app-cohesion.spec.ts` ("citations from Studio, Artifacts and ConceptGraph open the
cited source") passes. That is the acceptance test for removing the overlay.

`npx playwright test tests/e2e/tutor-experience.spec.ts tests/e2e/tutor-hygiene.spec.ts --retries=0 --reporter=line`

> 2 passed (58.9s)

`npx playwright test tests/e2e/coach.spec.ts --retries=0 --reporter=line` (after the narrow-panel layout fix)

> 8 passed (30.5s)

`npm run verify` — quoted result:

> Test Files 129 passed (129)
> Tests 830 passed (830)
> Duration 17.33s (transform 6.10s, setup 1.49s, collect 134.28s, tests 26.47s, environment 29ms, prepare 33.55s)
> Running 119 tests using 1 worker
> 2 failed
> 3 flaky
> 6 skipped
> 108 passed (12.3m)
> VERIFY_EXIT=1

### Provider-dependent failures (not caused by this change)

- `tests/e2e/document-intelligence.spec.ts:5` — PDF import → tutor fact → page citation. Two attempts opened
  the viewer but `Page 1 of 1` never appeared; the third timed out after 180s waiting for the tutor answer to
  contain `ZORBIUM-417`. This is the live tutor/PDF path, untouched by the surface move.
- `tests/e2e/integration.spec.ts:4` — same PDF citation chain, all three attempts failed on the missing
  `Page 1 of 1` viewer text before reaching the canvas steps.

### Flaky — passed on retry (pre-existing board-creation races)

- `tests/e2e/canvas-analysis.spec.ts:192` — `waitForResponse` for `/analysis` timed out on the first attempt.
- `tests/e2e/canvas-physics-fbd.spec.ts:9` — `boards[0]` undefined on the first attempt.
- `tests/e2e/canvas-visual-remediation.spec.ts:321` — `boards[0]` undefined on the first attempt.

No spec was skipped or weakened. One assertion was added: `coach.spec.ts` now checks the surface is inside
`.tutor-panel`, that no `.coach-dock` is a direct child of `.app-shell`, that the box fits inside the panel,
and that closing the tutor removes the surface while reopening restores it.

## Screenshots uploaded in order

1. `test-results/coach-lesson-home.png` — one ranked step with preview and "1 more".
2. `test-results/coach-prepared-destination.png` — Continue prepares the Study dialog.
3. `test-results/coach-no-question-truth.png` — honest "no question prepared" message.
4. `test-results/coach-course-change-cleared.png` — stale status cleared on course change.
5. `test-results/coach-folded-light.png` — folded Coach inside the tutor panel, light theme.
6. `test-results/coach-folded-dark.png` — the same surface in dark theme.

## Three strongest objections and resolutions

1. **Closing the tutor silently hides guidance.** The brief requires the tutor to be the only assistant
   surface and forbids a second dock. The tutor defaults open, the existing "Open tutor" button is the single
   entry point, and the new e2e test asserts the surface disappears on close and returns on reopen.
2. **A 360px panel cannot fit the old single-row dock.** The first render squeezed the reason into an unreadable
   column and clipped the chat input. CSS now puts the mark and copy on one row and the controls on a second,
   and the block sits above the chat so the input stays fully visible. Light and dark screenshots confirm it.
3. **Removing `pointer-events: none` could make the block intercept clicks in modal surfaces.** The block is in
   normal flow inside the tutor panel with no fixed positioning or high z-index; `.modal-shade` sits at
   `z-index: 1000` and paints above it. The Studio/Artifacts/ConceptGraph citation acceptance test passes.

## Review link

Commit `100491f` — https://critique.work/v/367f80c88a5dc17da2dfc23c3b031feb

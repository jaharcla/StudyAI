# Adaptive quiz questions teach nothing

## What the user reported
"pressing continue opened this up. but according to excerpt doesnt tell the student anythign"

The folded Coach's Continue step opened Study with this question: "According to the excerpt, what is the hard part of solving the Schrodinger equation for helium or any multielectron atom?" The displayed source excerpt literally contains the answer: "The hard part is solving it, and the difficulty arises from the electron-electron interactions". Two choices are shown, so the item is answer-by-copy and teaches nothing.

## Goal
Adaptive practice questions should require understanding or application, not copying a phrase from the excerpt shown beneath them. Stop generated questions from using "According to the excerpt..." giveaway phrasing, and keep the cited excerpt useful for checking the answer without containing the correct choice verbatim. All questions must remain grounded in cited student course material (the 99.9% rule); label anything ungrounded.

## Where to look
`src/learning/StudyPanel.tsx` displays `question.source.excerpt` in full. Question drafts and schemas live in `server/learning/service.ts` and `server/learning/contracts.ts`. Studio practice artifacts generated in `server/studio/service.ts` can be imported into the lesson's cards/questions and are another likely source of these items. Find the actual generation prompt before changing it.

## Boundaries
- Work only in this worktree; commit to `work/quiz-quality-20261124` with the Discord link. Do not push or merge to main.
- No new provider, dependency or paid path; no change to the citation/acceptance contract that verifies a source ref matches document text and page. Do not weaken grounding assertions to make a test pass.
- The `Request origin is not allowed.` error on Check answer is a separate server-origin fix in another worktree — do not touch it here.
- No subagents of any kind, including reviewer subagents. No Groq models. No `DESIGN.md`.

## Verification
- Add a focused test that rejects copy-style questions and accepts a grounded application question; run targeted learning/studio specs plus `tsc -b` and Vitest.
- Quote `npm run verify`, name provider-dependent failures separately, one critique URL per commit, three strongest objections inline.

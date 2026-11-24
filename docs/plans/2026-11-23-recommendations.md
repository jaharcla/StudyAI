# Recommendations as a Coach prompt producer — spec and plan

Wave 1 (built): deterministic recommendation contract, `GET /api/recommendations`, and a shared list shown in the progress dialog and lesson home with Study/Canvas/Studio routing. Unit tests 4/4; Playwright 2/2 in isolation.

Wave 2 (binding partner decision, 2026-11-23): one Coach surface follows the student. Recommendation Continue, lab hints and due re-draw tasks are inputs to one ranked prompt stream that emits at most one prompt at a time. A prompt carries a target; activating it prepares the destination and surfaces the Coach there. No separate hint card, next-action card or due-task card.

## What this worker now owns

- Keep `server/recommendations.ts` as the deterministic producer: BKT mastery, FSRS due state, attempts, weak concepts, canvas evidence. Keep source citations, plain-language reasons, stable ids and the 5-item cap.
- Adapt the output to the shared `CoachPrompt` contract owned by `src/coach/contract.ts`: `id`, `reason` (plain language), `source` provenance, `target` with `courseId`, `lessonId` and one of `boardId`/`activityId`/`cardId`, plus `conceptId`.
- Register as a `CoachProducer` with `src/coach/service.ts`. Ranking, one-at-a-time emission, dismissal and activation belong to the Coach, not this feature.
- For study prompts, expose the preparation descriptor (`POST /api/study/ask`) so Coach activation can open the session on the next question. For canvas prompts, carry the evidence `canvasId` as `target.boardId`. For fresh lessons, carry the cited document/source focus for Studio preparation.
- Never call a view setter or render a card for a prompt. The wave-1 card DOM surface was removed after the integration decision from `src/App.tsx`, `ProgressDialog.tsx`, CSS and `RecommendationList.tsx`; no fallback UI exists. The producer, contract, provenance and citation rules remain intact.

## Explicit non-goals

- No own Coach UI, hint card, next-action card or due-task card.
- No provider calls or paid services; deterministic local logic only.
- No second learning authority: read the existing learning tables and reuse `server/progress.ts` signals.
- No change to progress numbers or weak-concept/due-review links.

## Verification

- `tests/recommendations.test.ts` asserts the producer emits shared-contract prompts with targets, reasons and citations, stays deterministic, bounded and deduplicated.
- `npm run verify` output quoted in the handoff. Browser-level assertions for the unified Coach surface belong to the Coach owner.
- Current gate: tsc clean; Vitest 103 files / 672 tests pass. Full Playwright run hung at test 42/58 with pre-existing canvas failures plus a card-overlap regression from wave-1 UI, which wave 2 removes.

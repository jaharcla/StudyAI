# ADR: Finish learning features in the new UI/UX

Date: 2026-11-22
Status: accepted
Base: `work/real-controls` (4881cf3) — the authoritative new UI/UX

## Context

The first button inventory was taken on `main`, where five controls were placeholders. That base was wrong: the real UI lives on `work/real-controls`, which already ships real `HelpDialog`, `TutorMenu`, `ProgressDialog` (backed by `server/progress.ts`), `SearchDialog`, and the immersive `App.tsx` + `schemes/immersive-real.css`. Rebuilding those would duplicate working features. Re-inventorying the new UI found a smaller real gap set.

## Decision

Build only what the new UI is missing:
- FSRS-backed flashcard review (Cards button, canvas "Add to review deck")
- Reviewed-question authoring in `StudyPanel`
- Reveal control for canvas practice questions
- Working `StudyStage` mode buttons

Do not modify Help, TutorMenu, ProgressDialog, SearchDialog, `server/progress.ts`, or the `?lab` prototype (`ConversationFirst`, `LabShell`, scheme demos).

## Alternatives considered

1. The `main`-based plan (remove dead Help/Tutor, build progress and search). Rejected: wrong base; those features already exist in the new UI.
2. Base on `work/ui-ux-schemes`. Rejected by the human partner, who chose `work/real-controls`.

## Reuse

| Reused | Source | Version |
|---|---|---|
| BKT + lowest-mastery selection | `server/learning/bkt.ts` (OATutor MIT, see `NOTICE.md`) | in-repo |
| FSRS | `ts-fsrs` | 5.2.3 |
| Validation | `zod` | 4.2.0 |
| UI | `react` | 19.2.0 |
| Icons | `lucide-react` | 0.563.0 |
| Study modal | `src/learning/StudyPanel.tsx` | in-repo |
| Question endpoints | `/api/study/questions`, `ask`, `resume` | in-repo |
| Document APIs | `/api/documents`, `/api/document-intelligence/search` | in-repo |

No new dependency added.

## New surfaces

- Additive schema: `learning_cards.front`, `learning_cards.back` (nullable TEXT, no default) and `flashcard_review_logs`. `review_logs` is untouched — its `attempt_id` is `NOT NULL REFERENCES learning_attempts(id)` (`server/learning/schema.ts:51`), so flashcard ratings need their own log.
- Routes: `POST/GET /api/study/cards`, `POST /api/study/card-reviews`.
- Components: `FlashcardReview`, `QuestionAuthor`, reveal toggle in `SceneGlyph`; prop wiring in `StudyStage`.

## Limits

- Card upsert idempotent on `(courseId, lessonId, conceptId)` via existing `learning_cards.concept_id UNIQUE`; canvas "Course concept ID" is treated as the concept name.
- Due list is not paginated.
- No prompt/model/provider/OCR changes; no canvas benchmark baseline update.
- GitNexus indexes only the main checkout and cannot analyze this worktree; `git diff --stat` plus per-task DOM/service tests are the change evidence.

## Verification

`npm run verify` (with isolated ports `WEB_PORT=5293 RUNTIME_PORT=8220 DATA_PORT=8221 AGENT_PORT=8143` because a dev server in the `real-controls` worktree owns the default ports):

- `tsc -b`: clean.
- Vitest: 450 passed, 2 failed. `tests/learning-activities.test.ts` timed out under full-suite load but passes in isolation (24/25 tests in the rerun passed). `tests/canvas-analysis-producer.test.ts` fails with `no such table: canvas_analyses` — this file and the canvas-analysis subsystem were not touched by this work; the failure is present at the base commit `4881cf3` and is pre-existing.
- Playwright: all new specs passed individually (`flashcard-review`, `question-authoring`, `canvas-question-reveal`, `study-stage-modes`, `no-dead-controls`); a combined run of those five is recorded in the SDD ledger.

`/canvas-verify` was not available as a command or script in this worktree; canvas behavior is covered by the Playwright canvas spec and the full suite. No prompt/model/provider/OCR change was made, so no canvas benchmark baseline update was needed.

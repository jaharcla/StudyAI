# Design: Finish the learning features in the NEW UI/UX

Date: 2026-11-22
Status: draft for approval
Base branch: `work/real-controls` (4881cf3) — the authoritative new UI/UX
Spec supersedes: the `main`-based draft of the same filename

## Intent and why

The earlier inventory was done against `main`, where five buttons were placeholders. The authoritative UI lives on `work/real-controls`: it already ships `HelpDialog`, `TutorMenu`, `ProgressDialog` (backed by `server/progress.ts`), `SearchDialog`, and the immersive `App.tsx` + `schemes/immersive-real.css`. Building those again would be wrong. Re-inventorying the new UI found a smaller, real set of gaps in the learning flow.

## Current state (verified in the new UI)

- `src/main.tsx:12-17`: `App.tsx` is the real app; `src/lab/*` (including `ConversationFirst` with its flipcards) is a `?lab` prototype and must not be treated as the product.
- `src/App.tsx:295-297`: Help, TutorMenu, ProgressDialog, SearchDialog are all real and wired.
- `src/App.tsx:269`: the "Cards" button calls `setMode("study")`, which opens `StudyStage` (`src/lab/StudyStage.tsx`) — that stage only embeds `StudyPanel` (quizzes). There is no flashcard review in the real app, even though canvas flashcards can be authored (`CanvasStudio.tsx:848`).
- `src/lab/StudyStage.tsx:23-25`: "Adaptive quiz", "Activities", "Course sources" buttons have no `onClick` — dead controls in the new UI.
- `src/learning/StudyPanel.tsx`: no question authoring UI; `POST /api/study/questions` is API/test-only.
- `src/canvas/SceneGlyph.tsx:28`: a `question` object renders `object.prompt` and `object.answer` permanently.

## Goals

1. "Cards" opens a real flashcard review driven by the existing FSRS engine; canvas flashcards can join the review deck.
2. A student/author can create a reviewed quiz question from the study panel.
3. Practice-question canvas objects hide the answer until revealed.
4. Every button in `StudyStage` does what its label says.

## Non-goals

- No changes to Help, TutorMenu, ProgressDialog, SearchDialog, or `server/progress.ts` — they are already complete.
- No new mastery algorithm; reuse `server/learning/bkt.ts` and `ts-fsrs` 5.2.3.
- No changes to the `?lab` prototype (`ConversationFirst`, `LabShell`, scheme demos) except where `StudyStage` is used by the real app.
- No prompt/model/provider/OCR changes; no canvas benchmark baseline update.

## Constraints

Same binding rules as the superseded design: additive SQLite only; `npm run verify` must pass and be quoted; no `@ts-ignore`/`as any`; Playwright DOM assertions for every UI feature; cite third-party APIs from installed sources; ADR in `docs/decisions/`; GitNexus impact before edits (MCP cannot index this worktree — record the same tooling limitation as a ruling); `/canvas-verify` after the `SceneGlyph` change.

## The decided how

1. **Flashcard backend** — additive `front TEXT`/`back TEXT` on `learning_cards` (nullable, no default) plus a `flashcard_review_logs` table. `review_logs.attempt_id` is a required FK to a quiz attempt (`server/learning/schema.ts:51`), so ratings cannot reuse `/api/study/reviews`. New methods on `LearningService`: `registerCard`, `dueCards`, `rateCard`; new routes `POST/GET /api/study/cards`, `POST /api/study/card-reviews`.
2. **Flashcard review UI** — `src/learning/FlashcardReview.tsx`; "Cards" in `App.tsx` opens it instead of `StudyStage`; "Add to review deck" action in the canvas object editor for flashcards with a non-empty `conceptId`.
3. **Quiz authoring** — `src/learning/QuestionAuthor.tsx` opened from `StudyPanel`; reuses `GET /api/documents`, document search, and `POST /api/study/questions` unchanged.
4. **Practice question** — local reveal toggle in `SceneGlyph`, default hidden, with `stopPropagation()` like the existing note/source buttons.
5. **StudyStage buttons** — pass real callbacks from `App.tsx` so "Adaptive quiz" focuses StudyPanel, "Activities" opens `ActivityLibrary`, "Course sources" switches to Lecture view. Mark the active mode with `aria-current`/class.

## Verification

`npm run verify`, `/canvas-verify`, and Playwright specs for each UI item. ADR: `docs/decisions/2026-11-22-learning-ui-completion.md`, updated to reflect the new-UI scope.

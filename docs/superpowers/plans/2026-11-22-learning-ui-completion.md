# Learning Features for the New UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add flashcard review, quiz authoring, an honest practice-question card, and working StudyStage mode buttons to the authoritative `work/real-controls` UI — without rebuilding the Help, Progress, Search, or Tutor features that already exist there.

**Architecture:** `src/App.tsx` is the real app (`src/main.tsx:12-17`); `src/lab/*` is a `?lab` prototype, except `StudyStage` which the real app uses. Backend additions stay inside `LearningService` and `createLearningHandler`; schema changes are additive SQLite. Flashcard ratings use a separate log table because `review_logs.attempt_id` requires a quiz attempt.

**Tech Stack:** React 19.2.0, TypeScript, Vite, Vitest, Playwright, better-sqlite3 12.4.1, ts-fsrs 5.2.3, zod 4.2.0.

**Spec:** `docs/superpowers/specs/2026-11-22-learning-ui-completion-design.md` (new-UI scope). Read both.

## Global Constraints

- Additive SQLite only; never modify existing tables destructively.
- `npm run verify` = `tsc -b && vitest run && playwright test`; quote its output in the handoff.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`.
- Every UI feature needs a Playwright DOM assertion.
- Cite third-party API usage from installed sources; reuse `serializeCard`/`hydrateCard`/`Rating`/`State` in `server/learning/service.ts:3,122-137,161-169`.
- No changes to Help, TutorMenu, ProgressDialog, SearchDialog, `server/progress.ts`, or the `?lab` prototype.
- No prompt/model/provider/OCR changes; no canvas benchmark baseline update.
- GitNexus cannot index this worktree; use `git diff --stat` plus tests as the per-commit change check and state this in the handoff.
- Run `/canvas-verify` after the `SceneGlyph` change.

## Review Focus

1. **Empty state** — no due cards / no authored questions must show an honest message. Tests: Tasks 2, 3.
2. **Uncited question** — an excerpt not in a document must be rejected visibly. Test: Task 3.
3. **Double submission** — repeated idempotency keys must not duplicate card reviews or questions. Tests: Tasks 1, 3.
4. **Pointer isolation** — the reveal button must not select/drag the canvas object. Test: Task 4.
5. **Misleading controls** — "Cards" must not open the quiz stage; StudyStage buttons must navigate. Tests: Tasks 2, 5.

---

### Task 1: Flashcard schema, service, and endpoints

**Files:** `server/learning/schema.ts`, `server/learning/contracts.ts`, `server/learning/service.ts`, `server/learning/http.ts`, `tests/learning.test.ts`, `tests/learning-api.test.ts`

**Interfaces:**
- Produces:
```ts
export type CardInput = { courseId: string; lessonId: string; conceptId: string; front: string; back: string };
export type DueCard = { cardId: string; conceptId: string; concept: string; front: string; back: string; dueAt: string };
export type CardReviewInput = { cardId: string; rating: "Again" | "Hard" | "Good" | "Easy"; idempotencyKey: string };
registerCard(input: CardInput): { cardId: string }
dueCards(courseId: string, lessonId: string): DueCard[]
rateCard(input: CardReviewInput): { duplicate: boolean; cardId: string; dueAt: string; state: string }
POST /api/study/cards -> { cardId: string }
GET  /api/study/cards?course=&lesson= -> DueCard[]
POST /api/study/card-reviews -> { duplicate: boolean; cardId: string; dueAt: string; state: string }
```
`input.conceptId` is the concept **name**; find/create `learning_concepts` as `addReviewedQuestion` does at `service.ts:30`, then upsert via `learning_cards.concept_id UNIQUE`. `dueCards` returns only rows with non-null `front`/`back` whose `due` is at or before `this.now()`.

- [ ] **Step 1: Write failing schema/service test** in `tests/learning.test.ts` using the existing `setup()` fixture:

```ts
it("adds flashcard columns, registers a card, and rates it once per idempotency key", () => {
  const learning = setup();
  const card = learning.registerCard({ courseId: "c", lessonId: "l", conceptId: "Water", front: "H2O?", back: "Water" });
  const columns = database.prepare("PRAGMA table_info(learning_cards)").all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["front", "back"]));
  expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='flashcard_review_logs'").get()).toBeTruthy();
  const first = learning.rateCard({ cardId: card.cardId, rating: "Good", idempotencyKey: "card-1" });
  const second = learning.rateCard({ cardId: card.cardId, rating: "Good", idempotencyKey: "card-1" });
  expect(second.duplicate).toBe(true);
  expect(first.dueAt).not.toBe("");
  expect(database.prepare("SELECT count(*) total FROM review_logs").get()).toMatchObject({ total: 0 });
  expect(database.prepare("SELECT count(*) total FROM flashcard_review_logs").get()).toMatchObject({ total: 1 });
  expect(learning.dueCards("c", "l")).toEqual([]);
});
```

- [ ] **Step 2:** Run `npx vitest run tests/learning.test.ts -t "adds flashcard columns"` → FAIL (`registerCard is not a function`).
- [ ] **Step 3:** Add nullable `front TEXT`/`back TEXT` columns with a `PRAGMA table_info`-guarded `ALTER TABLE` for existing databases, plus `flashcard_review_logs (id, card_id, rating, reviewed_at, due_at, state, idempotency_key)` and an index, in `server/learning/schema.ts`. Never touch `review_logs`.
- [ ] **Step 4:** Add the three exported types and methods to `server/learning/service.ts`. `rateCard()` mirrors `rate()`'s FSRS transition (`service.ts:122-137`) but checks idempotency against `flashcard_review_logs` and requires no quiz attempt.
- [ ] **Step 5:** Re-run Step 2's command → PASS.
- [ ] **Step 6:** Add `CardReviewInputSchema` to `server/learning/contracts.ts` and the three routes to `server/learning/http.ts` beside the existing study routes, requiring `course`/`lesson` on the GET and using the existing `send`/catch pattern.
- [ ] **Step 7:** Add a route test in `tests/learning-api.test.ts` that POSTs a card, GETs due cards (asserting front/back present), POSTs a card review twice with the same key, and asserts the second response has `duplicate: true` and status 200.
- [ ] **Step 8:** Run `npx vitest run tests/learning.test.ts tests/learning-api.test.ts` → PASS.
- [ ] **Step 9:** Commit `server/learning/*` and both test files: `git commit -m "feat: register and review flashcards with FSRS"`.

---

### Task 2: Flashcard review UI and the "Cards" button

**Files:** Create `src/learning/FlashcardReview.tsx`; modify `src/App.tsx:269,298`, `src/canvas/CanvasStudio.tsx:848`
**Interfaces:** Consumes Task 1 routes. Produces `FlashcardReview({ courseId, lessonId, close })` in `data-testid="flashcard-review"`.

- [ ] **Step 1: Write the failing test** `tests/e2e/flashcard-review.spec.ts`:

```ts
test("Cards opens flashcard review and a rated card advances", async ({ page, request }) => {
  const { course, lesson } = await createCourseWithLesson(request, `Cards ${Date.now()}`, "Cards lesson");
  await request.post("/api/study/cards", { data: { courseId: course.id, lessonId: lesson.id, conceptId: "Water", front: "Formula?", back: "H2O" } });
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByTestId("flashcard-review")).toBeVisible();
  await expect(page.getByText("H2O")).toBeHidden();
  await page.getByRole("button", { name: "Reveal card" }).click();
  await expect(page.getByText("H2O")).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/Next review/)).toBeVisible();
  await expect(page.getByText("No flashcards are due")).toBeVisible();
});
```

- [ ] **Step 2:** Run `npx playwright test tests/e2e/flashcard-review.spec.ts` → FAIL (no `flashcard-review` element).
- [ ] **Step 3:** Build `FlashcardReview.tsx`: fetch due cards on mount, front face + `Reveal card` button, four rating buttons calling `POST /api/study/card-reviews` with `crypto.randomUUID()`, inline `role="status"` error, `No flashcards are due` empty state, `Next review <dueAt>` after rating.
- [ ] **Step 4:** In `src/App.tsx`, add `flashcardReviewOpen` state, change the "Cards" button at line 269 from `setMode("study")` to `setFlashcardReviewOpen(true)`, and render the panel beside the `StudyStage` render on line 298.
- [ ] **Step 5:** In `src/canvas/CanvasStudio.tsx:848`, add a `button-soft` with `aria-label="Add to review deck"` shown only when `object.conceptId?.trim()`, POSTing front/back/conceptId to `/api/study/cards` and reporting through `onStatus`.
- [ ] **Step 6:** Run Step 2's command → PASS.
- [ ] **Step 7:** Commit: `git commit -m "feat: review flashcards from the Cards button"`.

---

### Task 3: Quiz authoring in the study panel

**Files:** Create `src/learning/QuestionAuthor.tsx`; modify `src/learning/StudyPanel.tsx:57`
**Interfaces:** Consumes `GET /api/documents?course=`, document search (`src/components/document-intelligence/api.ts:28`), `POST /api/study/questions`. Produces `QuestionAuthor({ courseId, lessonId, close, onCreated })` in `data-testid="question-author"`.

- [ ] **Step 1: Write failing tests** `tests/e2e/question-authoring.spec.ts` with two tests: (a) seed a document via API, open *Study this lesson* → *Add a question*, fill `Concept`, `Prompt`, `Choice 1`, `Choice 2`, `Source document` (selectOption), `Source excerpt`, click *Save question*, then *Ask a reviewed question* and assert the new prompt heading; (b) same form with excerpt `not in the source`, assert `role="status"` contains `Citation must match text and page` and the form stays open.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/question-authoring.spec.ts` → FAIL (no *Add a question* button).
- [ ] **Step 3:** Build `QuestionAuthor.tsx` with those exact accessible labels; choices labelled `Choice 1`, `Choice 2`, …; correct-choice radio default to Choice 1; source picker from `GET /api/documents?course=`; excerpt prefilled from document search on focus; POST with `reviewed: true`; inline `role="status"` on error; `onCreated()` then `close()` on success.
- [ ] **Step 4:** In `StudyPanel.tsx:57`, add an `aria-label="Add a question"` button in `study-actions`, local `authorOpen` state, and render `<QuestionAuthor ... onCreated={() => { void resume(); setAuthorOpen(false); }} />` (`resume()` exists at line 24).
- [ ] **Step 5:** Run Step 2's command → PASS for both tests.
- [ ] **Step 6:** Commit: `git commit -m "feat: author reviewed questions in the study panel"`.

---

### Task 4: Practice question stops revealing the answer

**Files:** `src/canvas/SceneGlyph.tsx:28-35`; test `tests/e2e/canvas-question-reveal.spec.ts`

- [ ] **Step 1:** Write a test that places a `Practice question` object from the tool palette, edits Question to `Where is DNA?` and Answer to `the answer text`, closes the editor, asserts the answer is hidden, clicks `data-testid="reveal-answer"`, asserts visible, clicks again, asserts hidden.
- [ ] **Step 2:** Run it → FAIL (answer visible initially).
- [ ] **Step 3:** In `SceneGlyph.tsx`, add `useState(false)` (React already imported); for `object.kind === "question"` set `body = revealed ? object.answer ?? "" : ""` and render a `data-testid="reveal-answer"` button with `aria-label` toggling `Reveal answer`/`Hide answer`, calling `stopPropagation()` in both `onPointerDown` and `onClick` like the existing *Open note* button.
- [ ] **Step 4:** Run it → PASS.
- [ ] **Step 5:** Commit: `git commit -m "fix: hide practice question answer until revealed"`.

---

### Task 5: StudyStage mode buttons work

**Files:** `src/lab/StudyStage.tsx:4-25`; `src/App.tsx:298`; test `tests/e2e/study-stage-modes.spec.ts`
**Interfaces:** StudyStage gains `onOpenActivities: () => void` and `onOpenSources: () => void` props; the adaptive-quiz button focuses the already-rendered StudyPanel.

- [ ] **Step 1:** Write a test that opens *Study* from the lesson header, clicks *Course sources*, and asserts the document library is visible; reopens and clicks *Activities*, asserting the activity library dialog; and asserts each active mode button carries `aria-current="step"`.
- [ ] **Step 2:** Run it → FAIL (buttons do nothing).
- [ ] **Step 3:** Add the two props to `StudyStage`, wire `onClick` on the three mode buttons, and set `aria-current={active ? "step" : undefined}` with local mode state defaulting to `"quiz"`. Do not alter the prototype `LabShell`.
- [ ] **Step 4:** In `App.tsx:298`, pass `onOpenActivities={() => { setMode("canvas"); setActivityLibraryOpen(true); }}` and `onOpenSources={() => { setMode("canvas"); setView("Lecture"); }}`. Reuse existing state setters.
- [ ] **Step 5:** Run Step 2's command → PASS.
- [ ] **Step 6:** Commit: `git commit -m "fix: wire StudyStage mode buttons"`.

---

### Task 6: Full verification and close-out

- [ ] **Step 1:** Add the final assertion to `tests/e2e/no-dead-controls.spec.ts` equivalent for the new UI: every `.stage-session` and `.stage-*` mode button has an `onClick`-driven effect covered by Task 5; run its spec → PASS.
- [ ] **Step 2:** Run `npm run verify`; quote the full output.
- [ ] **Step 3:** Run `/canvas-verify` because `SceneGlyph.tsx` changed; record the result.
- [ ] **Step 4:** Update the ADR (`docs/decisions/2026-11-22-learning-ui-completion.md`) to the new-UI scope with reused/new surfaces, the GitNexus-index limitation, and quoted verification; set the spec status to `implemented`.
- [ ] **Step 5:** Commit the docs: `git commit -m "docs: record verification for new-UI learning features"`.

# Zero-config learning actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace configuration forms on Study, Cards, Studio, Artifacts and Learning Activities with one intent button per surface that infers its inputs from the current lesson.

**Architecture:** Add one shared `makePractice` helper that calls the existing Studio practice generator and importer, then wire each surface's primary action to it (or to a domain-specific template for activities). Manual editors stay mounted behind an Advanced disclosure; no new provider, endpoint family or visual scheme.

**Tech Stack:** React + TypeScript, Vite, existing `src/studio/api.ts` client, existing `/api/studio/*` and `/api/activities/*` handlers, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-zero-config-learning-design.md`

## Global Constraints

- 99.9% of student-facing substance comes from student-provided course material; label anything ungrounded.
- Local-first providers only: `opencode-go` / `hy4-flash-free` for live runs. No paid service, subscription, API key or external commitment.
- No subagents of any kind, including reviewer subagents. Review natively in the thread.
- No new visual direction and no `DESIGN.md`; work under the current `immersive-real` scheme.
- Keep the citation and acceptance contract: a source ref must still match document text and page.
- Do not weaken or delete the copy-style question filter added on 2026-11-24.
- Generation failure or 429 must produce an honest, actionable message, never a fake or copy-style item.
- Keep the tunnel origin guard working; do not hardcode origins. Requests use relative same-origin URLs so the browser supplies its own `Origin`.

## Review Focus

- **No indexed course text:** the one-click action must say the lesson needs a source, not render an empty quiz — Task 1 test asserts the exact no-material message, Task 2 e2e asserts it on screen.
- **Provider 429 or failed generation:** the action must report "The study assistant isn't responding right now…" and leave course material unchanged — Task 1 test stubs a 429 and asserts that message.
- **Every generated item rejected by grounding or quality checks:** must say the material did not yield a usable item, never fall back to a copy-style question — Task 1 test stubs a zero-count import and asserts that message.
- **Tunnel origin:** one-click actions are POSTs and must pass the `KIMAKI_TUNNEL_URL` origin guard — Task 1 test asserts relative URLs with no explicit `Origin` header, and `tests/tunnel-origin.test.ts` must stay green.
- **Manual path and citations survive:** Advanced must still author a cited question and an ActivitySpec — Task 2 and Task 6 keep the existing e2e assertions after opening Advanced.

---

### Task 1: Shared `makePractice` helper

**Files:**
- Create: `src/learning/make-practice.ts`
- Test: `tests/make-practice.test.ts`

**Interfaces:**
- Consumes: `generateArtifact`, `importPractice`, `type PracticeType`, `type StudioArtifact` from `../studio/api` (`src/studio/api.ts:48,60`).
- Produces: `makePractice(input: { courseId: string; lessonId: string; focus: string; practiceType: PracticeType; count?: number }): Promise<{ cardsAdded: number; questionsAdded: number }>`. Default `count` is `4`. Errors are thrown with student-facing messages, not provider strings.

- [ ] **Step 1: Write the failing test**

`tests/make-practice.test.ts` stubs `globalThis.fetch` and asserts:
- `generateArtifact` receives `kind: "practice"`, the supplied `focus`, `practiceType`, and `count: 4` when omitted;
- `importPractice` receives the generated artifact id and every card/question index from `content`;
- return value equals the import response counts;
- a 429 generation response throws `The study assistant isn't responding right now. Your course material is unchanged. Try again in a moment.`;
- a zero-count import throws `This lesson didn't yield a usable practice item. Try again with another source.`;
- neither request sets an explicit `Origin` header and both use relative `/api/...` URLs.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/make-practice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `makePractice`**

Implement in `src/learning/make-practice.ts` with one `generateArtifact` call followed by one `importPractice` call. Reuse the existing `studentMessage` wording from `src/studio/StudioSurface.tsx:36-42` verbatim for the 429 case. Do not add a new provider call site.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/make-practice.test.ts tests/tunnel-origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/learning/make-practice.ts tests/make-practice.test.ts && git commit -m "feat: add shared one-click practice generator"` with the Discord link from the project instructions.

### Task 2: Study — Make quiz in one click

**Files:**
- Modify: `src/learning/StudyPanel.tsx`, `src/lab/StudyStage.tsx`
- Test: `tests/e2e/question-authoring.spec.ts`, `tests/e2e/adaptive-learning.spec.ts`

**Interfaces:**
- Consumes: `makePractice` from `./make-practice`.
- Produces: `StudyPanel` props become `{ courseId: string; lessonId: string; lessonTitle: string; close: () => void }`; `StudyStage.tsx:48` passes its existing `lessonTitle`.

- [ ] **Step 1: Write the failing e2e test**

Add to `tests/e2e/question-authoring.spec.ts`: after opening Study, click `Make quiz`, then assert a question heading and `Source:` are visible, and that no `Concept` / `Prompt` / `Source excerpt` textbox is visible. Seed the lesson's indexed source in the test as existing specs do.

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/playwright/cli.js test tests/e2e/question-authoring.spec.ts -g "makes a quiz in one click"`
Expected: FAIL — `Make quiz` not found.

- [ ] **Step 3: Implement the primary action**

Add the `lessonTitle` prop and a primary `Make quiz` button. Its handler calls `makePractice({ courseId, lessonId, focus: lessonTitle, practiceType: "quiz" })`, then `ask()`. Keep `Ask a reviewed question`. Move the whole `QuestionAuthor` block behind `<details><summary>Advanced</summary>…</details>`; do not delete or rewrite `QuestionAuthor`.

- [ ] **Step 4: Update existing manual assertions without weakening them**

In `tests/e2e/question-authoring.spec.ts`, open `Advanced` before each existing `Add a question` click. Keep every assertion about citation matching, error copy and answering unchanged.

- [ ] **Step 5: Run targeted tests**

Run: `node node_modules/playwright/cli.js test tests/e2e/question-authoring.spec.ts tests/e2e/adaptive-learning.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/learning/StudyPanel.tsx src/lab/StudyStage.tsx tests/e2e/question-authoring.spec.ts && git commit -m "feat: make quiz generation one click in Study"` with the Discord link.

### Task 3: Cards — Make cards in one click

**Files:**
- Modify: `src/learning/FlashcardReview.tsx`, `src/App.tsx`
- Test: `tests/e2e/flashcard-review.spec.ts`

**Interfaces:**
- Consumes: `makePractice`.
- Produces: `FlashcardReview` props become `{ courseId: string; lessonId: string; lessonTitle: string; close: () => void }`; `App.tsx:510` passes `lessonTitle`.

- [ ] **Step 1: Write the failing e2e test**

Add a test that opens Cards with no cards due, clicks `Make cards from this lesson`, and asserts a flashcard appears with a visible source line.

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/playwright/cli.js test tests/e2e/flashcard-review.spec.ts -g "makes cards in one click"`
Expected: FAIL — button not found.

- [ ] **Step 3: Implement the action and the citation**

Add the button in the empty state. It calls `makePractice({ courseId, lessonId, focus: lessonTitle, practiceType: "cards" })` then reloads `/api/study/cards`. Extend `DueCard` with `sourceTitle`, `sourcePage`, `sourceExcerpt` and render them as a `study-citation` line. If `server/learning/http.ts:56` does not return those fields, add them there from the stored card record without changing the response's existing fields.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/playwright/cli.js test tests/e2e/flashcard-review.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/learning/FlashcardReview.tsx src/App.tsx server/learning/http.ts tests/e2e/flashcard-review.spec.ts && git commit -m "feat: make flashcard creation one click"` with the Discord link.

### Task 4: Studio — one generate button per tab

**Files:**
- Modify: `src/studio/StudioSurface.tsx`
- Test: `tests/e2e/studio.spec.ts`, `tests/e2e/artifact-breadth.spec.ts`

**Interfaces:**
- Consumes: existing `generateArtifact`, no new helper.
- Produces: focus/count/practice-type inputs remain mounted only inside an `Advanced` disclosure; the primary button label is `Generate <KIND_LABEL[kind]>`.

- [ ] **Step 1: Write the failing e2e test**

Assert the primary generate button is visible on the main path, the focus input is not, and `Advanced` reveals it. Keep the existing artifact assertions in `studio.spec.ts` intact.

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/playwright/cli.js test tests/e2e/studio.spec.ts -g "Advanced"`
Expected: FAIL — no `Advanced` control.

- [ ] **Step 3: Implement the disclosure**

Move only the configuration inputs into `<details>`. Leave the kind tabs, generated artifact view, citation buttons and acceptance controls exactly where they are. Default focus stays `Key concepts and mechanisms` and count stays `4`.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/playwright/cli.js test tests/e2e/studio.spec.ts tests/e2e/artifact-breadth.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/studio/StudioSurface.tsx tests/e2e/studio.spec.ts && git commit -m "feat: put Studio configuration behind Advanced"` with the Discord link.

### Task 5: Artifacts — remove the focus field from the main path

**Files:**
- Modify: `src/artifacts/ArtifactsPage.tsx`
- Test: `tests/e2e/artifacts-page.spec.ts`

**Interfaces:**
- Consumes: existing `generateSlideDeck`.
- Produces: `generate()` calls `generateSlideDeck({ courseId, lessonId, focus: lessonTitle })`; the focus input lives inside `Advanced`.

- [ ] **Step 1: Write the failing e2e test**

Assert `Build slide deck` is the primary action, no focus textbox is on the main path, and `Advanced` reveals it.

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/playwright/cli.js test tests/e2e/artifacts-page.spec.ts -g "Advanced"`
Expected: FAIL — no `Advanced` control.

- [ ] **Step 3: Implement**

Remove the focus field from the main path; keep filter, rename, delete and the Presenton-missing notice unchanged. Update existing specs that typed into the focus field to open `Advanced` first, without weakening their assertions.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/playwright/cli.js test tests/e2e/artifacts-page.spec.ts tests/e2e/app-cohesion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/artifacts/ArtifactsPage.tsx tests/e2e/artifacts-page.spec.ts && git commit -m "feat: infer slide deck focus from the lesson"` with the Discord link.

### Task 6: Activities — start a guided activity in one click

**Files:**
- Create: `src/learning/activities/domain.ts`
- Modify: `src/learning/ActivityLibrary.tsx`
- Test: `tests/activity-domain.test.ts`, `tests/e2e/learning-activities.spec.ts`

**Interfaces:**
- Produces: `chooseActivityDomain(text: string): "force" | "graph" | null`. Returns `null` when the text matches no template domain.

- [ ] **Step 1: Write the failing unit test**

`tests/activity-domain.test.ts` asserts force keywords (`force`, `acceleration`, `vector`) return `"force"`, graph keywords (`slope`, `linear`, `graph`) return `"graph"`, and unrelated text returns `null`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/activity-domain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement domain selection**

Implement `chooseActivityDomain` in `src/learning/activities/domain.ts` with case-insensitive word-boundary matching. No provider call.

- [ ] **Step 4: Add the failing e2e test**

Add a test that opens Activities and clicks `Start a guided activity`, then asserts a task heading and a cited source line appear without pasting JSON.

- [ ] **Step 5: Implement the primary action**

Use the first indexed source for the lesson, call `chooseActivityDomain(source.excerpt)`, then reuse `insertTemplate(domain)` from `src/learning/ActivityLibrary.tsx:58` and the existing preview/start flow. When it returns `null`, show `This lesson's source doesn't match a guided activity template yet. Add a force or graph source, or use Advanced.` Move the JSON textarea behind `Advanced`; keep `Use in force template` / `Use in graph template` inside it.

- [ ] **Step 6: Keep manual assertions intact**

In `tests/e2e/learning-activities.spec.ts`, open `Advanced` before existing template/JSON steps. Keep every checkpoint assertion unchanged.

- [ ] **Step 7: Run targeted tests**

Run: `node node_modules/vitest/vitest.mjs run tests/activity-domain.test.ts` and `node node_modules/playwright/cli.js test tests/e2e/learning-activities.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

`git add src/learning/activities/domain.ts src/learning/ActivityLibrary.tsx tests/activity-domain.test.ts tests/e2e/learning-activities.spec.ts && git commit -m "feat: start guided activities without pasting JSON"` with the Discord link.

### Task 7: Full verification and screenshots

**Files:**
- No source changes. Record in `docs/verification/2026-11-24-zero-config-learning.md`.

**Interfaces:**
- Consumes: all six tasks.

- [ ] **Step 1: Run the full suite**

Run: `npm run verify`. Expect `tsc -b` clean, Vitest green, Playwright green apart from the known provider-dependent PDF citation failures; name them separately. Do not weaken assertions to make the suite green.

- [ ] **Step 2: Capture the five primary actions**

Screenshot Study, Cards, Studio, Artifacts and Activities with their new primary buttons; upload in order to the thread.

- [ ] **Step 3: Record and commit**

Write `docs/verification/2026-11-24-zero-config-learning.md` with commands, results, provider-dependent failures, screenshots and three strongest objections. Commit with the Discord link and produce one critique URL per commit.

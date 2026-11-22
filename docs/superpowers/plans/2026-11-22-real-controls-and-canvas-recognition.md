# Real Controls and Canvas Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every currently fake control perform real work, and keep canvas recognition available after a reload by persisting analysis results.

**Architecture:** Four small dialogs/menus in React are wired to existing app state and two local reads: the existing document-intelligence search endpoint and a new progress aggregation endpoint. Canvas analysis is stored as derived data beside the board and rehydrated on load, gated by the existing receiver validator. No hosted services and no OCR/provider changes.

**Tech Stack:** React 19 + TypeScript + Vite, Node HTTP API with better-sqlite3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-real-controls-and-canvas-recognition-design.md`

## Global Constraints

- `npm run verify` must pass before any completion claim; quote its output.
- UI-visible changes need a Playwright assertion on the actual DOM result.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`. Use `@ts-expect-error` only with a comment and tell the user.
- Verify third-party APIs against installed type declarations; cite file and line.
- Do not lower OCR region caps, provider budgets, or recognition confidence thresholds without an ADR.
- Do not change `CanvasDocument.version`; canvas mutations still go through `server/canvas-persistence`.
- Any prompt/model/provider change requires `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json` with the four gate numbers quoted.
- Keep generated captures under `output/` and `.impeccable/` out of commits.

## Review Focus

- **No course selected** — Search must explain it needs a course and must not call the API. Test in Task 1's Playwright spec.
- **Search hit with a `studyai://` source ref** — clicking it must open the reader at that page/slide, not just close the dialog. Test in Task 1's Playwright spec.
- **Zero study activity** — Progress must show an honest empty state with no fabricated numbers. Test in Task 2's API unit test and Playwright spec.
- **Stale or mismatched persisted analysis** — rehydration must ignore analysis whose board/revision/course/lesson differ. Test in Task 5's unit test.
- **Clipboard unavailable** — Copy last answer must fail gracefully with a visible message. Test in Task 4's Playwright spec by stubbing `navigator.clipboard`.

---

### Task 1: Global search dialog

**Files:**
- Create: `src/components/SearchDialog.tsx`
- Modify: `src/App.tsx` (search button, dialog state, ⌘K listener)
- Test: `tests/e2e/real-controls.spec.ts`

**Interfaces:**
- Consumes: `SearchHit` from `src/components/document-intelligence/api.ts:5`; `course.id`; existing `setOpenSourceRef`, `setOpenDocumentId`, `setView` in `App.tsx`.
- Produces: `<SearchDialog courseId: string; onClose: () => void; onOpen: (sourceRef: string) => void />`; `searchOpen` state in `App.tsx`.

- [ ] **Step 1: Write the failing Playwright test**

Add to `tests/e2e/real-controls.spec.ts`:
```ts
test("global search finds an indexed source and opens it", async ({ page }) => {
  // arrange: create course + import a document through the existing helpers
  await page.goto("/");
  await selectCourseOnPage(page, course.title);
  await page.getByTitle("Search anything").click();
  const dialog = page.getByRole("dialog", { name: "Search course materials" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("DNA");
  await expect(dialog.getByText(/nucleus/i).first()).toBeVisible();
  await dialog.getByRole("button", { name: /open source/i }).first().click();
  await expect(page.locator(".lecture-pane")).toBeVisible();
  await expect(page.getByRole("button", { name: "Canvas" })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/real-controls.spec.ts --grep "global search"`
Expected: FAIL — "Search anything" is still disabled.

- [ ] **Step 3: Implement `SearchDialog`**

Signature: `export default function SearchDialog({ courseId, onClose, onOpen }: { courseId: string; onClose: () => void; onOpen: (sourceRef: string) => void })`.
Use a 250 ms debounce, `GET /api/document-intelligence/search?course=<courseId>&q=<query>`, render `{results: SearchHit[]}` as rows with title, unit number, excerpt, and an "Open source" button calling `onOpen(hit.sourceRef)`. Escape closes; Enter opens the first hit. If `courseId` is empty, render "Select a course to search." and do not fetch. Errors render the server `error` string. Give the dialog `role="dialog"` and `aria-label="Search course materials"`.

- [ ] **Step 4: Wire `App.tsx`**

Enable the sidebar Search button: remove `disabled` and its "not available yet" title; `onClick={() => setSearchOpen(true)}`. Add a `useEffect` for `keydown` with `(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"` that prevents default and toggles `searchOpen`. Render `<SearchDialog>` and pass `onOpen={(sourceRef) => { setOpenDocumentId(undefined); setOpenSourceRef(sourceRef); setOpenSourceKey((key) => key + 1); setView("Lecture"); setSearchOpen(false); }}`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/real-controls.spec.ts --grep "global search"`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add src/components/SearchDialog.tsx src/App.tsx tests/e2e/real-controls.spec.ts && git commit -m "feat: make global search open real course sources"`

---

### Task 2: Learning progress endpoint and dialog

**Files:**
- Create: `server/progress.ts`
- Create: `src/components/ProgressDialog.tsx`
- Modify: `server/api.ts` (route near `/api/search`)
- Modify: `src/App.tsx` (progress nav item, dialog state)
- Test: `tests/progress.test.ts`, `tests/e2e/real-controls.spec.ts`

**Interfaces:**
- Consumes: existing learning tables in `server/learning/schema.ts`.
- Produces: `export function getCourseProgress(database: Database.Database, courseId: string): CourseProgress` where `CourseProgress = { lessons: Array<{ id: string; title: string; attempts: number; correct: number; mastery: number }>; totalAttempts: number; totalCorrect: number; conceptsMastered: number; dueReviews: number }`; `GET /api/progress?course=<id>`; `<ProgressDialog courseId: string; onClose: () => void />`.

- [ ] **Step 1: Write the failing unit test**

In `tests/progress.test.ts`, create an in-memory DB with the tables from `server/learning/schema.ts`, seed one course, two lessons, one correct and one incorrect attempt plus one mastery row, then:
```ts
expect(getCourseProgress(db, "c")).toMatchObject({
  totalAttempts: 2, totalCorrect: 1, conceptsMastered: 1,
  lessons: [{ id: "l1", attempts: 1, correct: 1 }],
});
expect(getCourseProgress(db, "c")).not.toHaveProperty("streak");
```
Add a second assertion that an unseeded course returns all zeros and an empty `lessons` array.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/progress.test.ts`
Expected: FAIL — cannot resolve `../server/progress.js`.

- [ ] **Step 3: Implement `getCourseProgress`**

Signature as above. Aggregate only from existing tables: `learning_attempts`, `learning_attempts.is_correct`, `mastery_updates` (latest per concept), `learning_cards.fsrs_state` for due reviews. Return plain numbers; no streak, no hours, no invented fields.

- [ ] **Step 4: Add the route and verify the unit test**

In `server/api.ts`, add `if (req.method === "GET" && url.pathname === "/api/progress") { ... }` mirroring `/api/search`: require `course`, return 200 with `getCourseProgress(db, course)`, 400 without a course. Run `npx vitest run tests/progress.test.ts` — expected PASS.

- [ ] **Step 5: Implement `ProgressDialog`**

Fetch `GET /api/progress?course=<courseId>` on mount. Render `totalAttempts`, `totalCorrect`, `conceptsMastered`, `dueReviews` and one row per lesson with attempt count, correct count, and a thin mastery bar. Zero-activity state renders exactly "No study activity yet — answer a question or start an activity." and no numbers. `role="dialog"`, `aria-label="Learning progress"`, Escape closes.

- [ ] **Step 6: Wire and test in the browser**

Enable the sidebar Learning progress button (`onClick={() => setProgressOpen(true)}`). In `tests/e2e/real-controls.spec.ts` add a test that opens it and asserts the dialog shows either real numbers or the exact empty-state string. Run that test — expected PASS.

- [ ] **Step 7: Commit**

`git add server/progress.ts server/api.ts src/components/ProgressDialog.tsx src/App.tsx tests/progress.test.ts tests/e2e/real-controls.spec.ts && git commit -m "feat: show real local learning progress"`

---

### Task 3: Help dialog

**Files:**
- Create: `src/components/HelpDialog.tsx`
- Modify: `src/App.tsx` (help button, dialog state)
- Test: `tests/e2e/real-controls.spec.ts`

**Interfaces:**
- Consumes: existing `setSettings`, `setView`, `setTutor`, `setSidebar` state setters.
- Produces: `<HelpDialog onClose: () => void; onOpenSettings: () => void; onOpenCanvas: () => void />`.

- [ ] **Step 1: Write the failing Playwright test**

```ts
test("help opens a real guide and its settings action works", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("Help is not available yet").click().catch(() => {});
  await page.locator(".top-actions button[title*='Help']").click();
  const help = page.getByRole("dialog", { name: "StudyAI help" });
  await expect(help).toBeVisible();
  await expect(help.getByText("Analyze board")).toBeVisible();
  await help.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "StudyAI settings" })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails** — expected FAIL on the disabled Help button.

- [ ] **Step 3: Implement `HelpDialog`**

Static real content only: sections for Canvas tools (palette, Draw/Science/Learning groups), Recognize and review (Analyze board, Labels), Canvas controls (undo/redo, pan, zoom), Views (Canvas/Lecture/Split), Tutor (ask, citations, new conversation), and Keyboard (⌘K search, Escape closes dialogs). Include one button "Open settings" wired to `onOpenSettings` and one "Go to canvas" wired to `onOpenCanvas`. No links to nonexistent pages. Escape closes.

- [ ] **Step 4: Wire `App.tsx` and verify** — remove the fake title, `onClick={() => setHelpOpen(true)}`, render the dialog. Run the test — expected PASS.

- [ ] **Step 5: Commit**

`git add src/components/HelpDialog.tsx src/App.tsx tests/e2e/real-controls.spec.ts && git commit -m "feat: add real in-app help"`

---

### Task 4: Tutor options menu

**Files:**
- Create: `src/components/TutorMenu.tsx`
- Modify: `src/App.tsx` (⋯ button, menu state)
- Test: `tests/e2e/real-controls.spec.ts`

**Interfaces:**
- Consumes: `useCopilotChatConfiguration` from `@copilotkit/react-core/v2` — exported at `node_modules/@copilotkit/react-core/dist/v2/index.d.mts` (export list, symbol `tr`); `startNewThread(): void` declared in `node_modules/@copilotkit/react-core/dist/v2/headless.d.mts` within `CopilotChatConfigurationValue`. Existing `tutorContextOpen` state.
- Produces: `<TutorMenu onClose: () => void; onToggleContext: () => void; config: CopilotChatConfigurationValue | null />`.

- [ ] **Step 1: Write the failing Playwright test**

```ts
test("tutor menu starts a new conversation and copies an answer", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("Tutor options are not available yet").click().catch(() => {});
  await page.locator(".tutor-header button[title*='options']").click();
  const menu = page.getByRole("menu", { name: "Tutor options" });
  await expect(menu.getByRole("menuitem", { name: "New conversation" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Toggle lesson context" })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true }); });
  await menu.getByRole("menuitem", { name: "Copy last answer" }).click();
  await expect(page.getByText("Copied")).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails** — expected FAIL on the disabled ⋯ button.

- [ ] **Step 3: Implement `TutorMenu`**

A `role="menu"` anchored in the tutor header with three `role="menuitem"` buttons. New conversation calls `config?.startNewThread()`; when `config` is null, render the item disabled with title "Tutor chat is not configured." Toggle lesson context calls `onToggleContext`. Copy last answer reads `.copilot-slot [data-testid="copilot-assistant-message"]` last element's `innerText` and calls `navigator.clipboard.writeText`; on rejection or missing API set a "Copy failed" status instead of throwing. Show "Copied" for 2 seconds. Close on outside click and Escape.

- [ ] **Step 4: Wire `App.tsx` and verify** — remove the fake title, `onClick={() => setTutorMenuOpen(true)}`, pass `config={useCopilotChatConfiguration()}` inside the `CopilotKitProvider` tree. Run the test — expected PASS.

- [ ] **Step 5: Commit**

`git add src/components/TutorMenu.tsx src/App.tsx tests/e2e/real-controls.spec.ts && git commit -m "feat: make tutor options menu functional"`

---

### Task 5: Persist and rehydrate canvas analysis

**Files:**
- Create: `server/canvas-analysis/storage.ts`
- Modify: `server/learning/schema.ts` or `server/db.ts` (table initialization) — put the table next to the other canvas tables
- Modify: `server/canvas-analysis/producer.ts` (store after successful analysis)
- Modify: `server/canvas-analysis/http.ts` (GET endpoint for stored analysis)
- Modify: `src/canvas/CanvasStudio.tsx` (rehydrate on board load)
- Test: `tests/canvas-analysis-persistence.test.ts`

**Interfaces:**
- Consumes: `CanvasAnalysisResult` from `server/canvas-analysis/contract.js`; `validateCanvasAnalysisAtReceiver`.
- Produces: `saveCanvasAnalysis(database, boardId, courseId, lessonId, revision, analysis): void`; `loadCanvasAnalysis(database, boardId, courseId, lessonId, revision): CanvasAnalysisResult | null`; `GET /api/canvases/:id/analysis?course=&lesson=` returning `{ analysis: CanvasAnalysisResult | null }`.

- [ ] **Step 1: Write the failing test**

In `tests/canvas-analysis-persistence.test.ts`, use an in-memory DB with the board and analysis tables seeded with one board at revision 3 and a minimal valid `CanvasAnalysisResult` fixture. Assert:
```ts
expect(loadCanvasAnalysis(db, "b", "c", "l", 3)).toEqual(analysis);
expect(loadCanvasAnalysis(db, "b", "c", "l", 4)).toBeNull();
expect(loadCanvasAnalysis(db, "b", "c", "other", 3)).toBeNull();
```
Add a case where stored JSON is malformed and expect `null` rather than a throw.

- [ ] **Step 2: Run it to verify it fails** — expected FAIL, module not found.

- [ ] **Step 3: Implement storage**

Create table `canvas_analyses(board_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, revision INTEGER NOT NULL, result_json TEXT NOT NULL, saved_at TEXT NOT NULL)`. `saveCanvasAnalysis` uses `INSERT ... ON CONFLICT(board_id) DO UPDATE`. `loadCanvasAnalysis` selects by all four keys, parses JSON in a try/catch returning `null` on any parse failure, and returns `null` on a mismatch.

- [ ] **Step 4: Wire producer and HTTP**

In `producer.ts`, after `produceCanvasAnalysisForPersistedBoard` returns and before `send(200, ...)`, call `saveCanvasAnalysis(database, boardId, courseId, lessonId, analysis.revision, analysis)`. In `http.ts`, add a GET branch on `/api/canvases/:id/analysis` that reads the board's authoritative row first and returns `{ analysis: loadCanvasAnalysis(..., row.revision) }`. Run the unit test — expected PASS.

- [ ] **Step 5: Rehydrate in `CanvasStudio`**

After a board loads successfully and `activeBoard`/revision are known, call the GET endpoint; if `analysis` is non-null, `setCanvasAnalysis(analysis)` and `onStatus("Canvas analysis restored for this board")`. On any error, leave analysis unset and do not show a blocking error. Clear `canvasAnalysis` immediately on course/lesson/board change. Do not auto-run analysis.

- [ ] **Step 6: Add a browser regression test**

In `tests/e2e/real-controls.spec.ts`, add a test that imports a document, draws a stroke, runs Analyze board, reloads the page, and asserts the analysis status text is present and the tutor still has the analysis context. Use existing analysis fixtures/helpers where possible. Run the test — expected PASS.

- [ ] **Step 7: Run full verification**

Run `npm run verify`, quote the summary, and run `npm run benchmark:canvas` if any agent context changed (quote the four gates).

- [ ] **Step 8: Commit**

`git add server/canvas-analysis/storage.ts server/canvas-analysis/producer.ts server/canvas-analysis/http.ts server/db.ts src/canvas/CanvasStudio.tsx tests/canvas-analysis-persistence.test.ts tests/e2e/real-controls.spec.ts && git commit -m "feat: persist canvas analysis across reloads"`

---

## Self-Review Notes

- Spec coverage: all four fake controls, both backend reads, and analysis persistence have owning tasks.
- Review Focus items are pinned in Tasks 1, 2, and 4; Task 5's stale-analysis case is pinned in its unit test.
- No `TBD` steps; every step names a file, signature, command, or exact assertion.
- No subagent dispatch used for the review, per the partner's instruction.

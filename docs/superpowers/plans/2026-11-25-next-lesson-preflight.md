# Next-Lesson Pre-flight Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show one grounded warm-up in Today before the next class: three cited passages from weak concepts, one reviewed question and one short explanation. Every item traces to indexed student material; no unsupported content is invented.

**Spec:** `docs/superpowers/specs/2026-11-25-next-lesson-preflight-design.md`

**Architecture:** There is no reliable `nextLesson` field, so anchor on the active course/lesson. Read weak concepts from the existing concept graph (BKT mastery is already in each node), fetch one passage per concept from the document-intelligence `/documents?course=&q=` search (which returns a real `sourceRef`), and fetch one reviewed question from `/api/study/ask`. Render a single `PreflightCard` in the Today surface with honest loading, empty, error and retry states. No new generator, provider or authoring path.

## Global Constraints

- `DESIGN.md` is the UI source of truth; this is a cohesion pass, not a redesign.
- At least 99.9% of student-facing substance comes from student-provided material. Never invent citations, mastery numbers, answers or lesson order.
- Local-first and BYOK. No new dependency, paid service, API key, subscription or `.env` change.
- TDD: every UI-visible change gets a Playwright DOM assertion. Never weaken a test.
- One worktree and branch per worker; no merge before `tsc -b`, Vitest and targeted Playwright pass.
- One Playwright suite at a time; pause new work below 1 GB free RAM. No subagents.
- Preserve `tests/e2e/journey-uninterrupted.spec.ts`.

## Review Focus

- **No weak concepts or no indexed passages:** explicit empty state, never filler.
- **No reviewed question:** reuse StudyPanel's honest "author from source" state; never show a fake question.
- **Failed graph/search/ask call:** error with retry; never a partial "ready" card.
- **Citation integrity:** every passage carries a parseable `sourceRef` from the search hit, never a guessed one.

---

### Task 1: Pure pre-flight selector

**Files:**
- Create: `src/today/preflight.ts` (selector portion)
- Test: `tests/preflight-selection.test.ts`

**Interfaces:**
- Consumes: `ConceptGraphNode[]` from `server/concept-graph.ts` (`id`, `label`, `mastery`, `sourceRef?`).
- Produces: `selectPreflightConcepts(nodes: readonly ConceptGraphNode[], limit?: number): ConceptGraphNode[]` — keeps only nodes with a `sourceRef`, sorts by `mastery` ascending with a stable `id` tiebreak, returns at most `limit` (default 3).

- [ ] **Step 1:** Write failing Vitest cases: lowest mastery first, nodes without `sourceRef` excluded, stable tie-break, limit honoured, empty input.
- [ ] **Step 2:** Run `npx vitest run tests/preflight-selection.test.ts`, watch it fail.
- [ ] **Step 3:** Implement the selector; run again, watch it pass.
- [ ] **Step 4:** Run `npx tsc -b`. Commit with the thread's Discord link and one critique URL.

### Task 2: Grounded loader

**Files:**
- Modify: `src/today/preflight.ts` (loader portion)
- Test: `tests/preflight-loader.test.ts`

**Interfaces:**
- Produces: `loadPreflight(courseId: string, lessonId: string, fetcher?: typeof fetch): Promise<PreflightResult>` where
  `PreflightResult = { status: "ready"; concepts: Array<{ label: string; excerpt: string; sourceRef: string }>; question: ReviewedQuestion | null }
    | { status: "empty"; reason: "no-concepts" | "no-passages" }
    | { status: "error"; message: string }`.
- Calls `/api/concepts/graph?course=`, then `${DOCUMENT_API}/documents?course=&q=<label>` once per selected concept, taking the first hit with a parseable `sourceRef`; then `/api/study/ask?course=&lesson=&concept=<weakest>` (a `no-reviewed-questions` response yields `question: null`, not an error).

- [ ] **Step 1:** Write failing tests with a stubbed fetcher: ready with three cited items and a question; no weak concepts; no passages; ask returns no reviewed question; graph call rejects.
- [ ] **Step 2:** Run the test file, watch it fail.
- [ ] **Step 3:** Implement the loader with honest error mapping and no fabricated fields; watch tests pass.
- [ ] **Step 4:** Run `npx tsc -b`. Commit with critique URL.

### Task 3: PreflightCard and Today integration

**Files:**
- Create: `src/today/PreflightCard.tsx`
- Modify: `src/today/DailySurfaces.tsx`, `src/today/daily-surfaces.css`, `src/App.tsx` (wire the existing study-open action)
- Test: `tests/e2e/preflight.spec.ts`

**DOM contract:** `preflight-card`, `preflight-item`, `preflight-excerpt`, `preflight-citation`, `preflight-question`, `preflight-start`, `preflight-empty`, `preflight-error`, `preflight-retry`, `preflight-loading`.

- [ ] **Step 1:** Write a failing Playwright test that stubs `/api/concepts/graph`, `/api/document-intelligence/documents` and `/api/study/ask`, opens Today, and asserts three cited items, one question text and one enabled `preflight-start`.
- [ ] **Step 2:** Watch it fail.
- [ ] **Step 3:** Build the card with loading/empty/error/retry states, reuse `Citation`, and mount it in Today; wire Start to the existing Study surface. Watch the test pass.
- [ ] **Step 4:** Add e2e cases for empty (no weak concepts), no reviewed question, and failed graph call with successful retry.
- [ ] **Step 5:** Run `npx tsc -b` and the targeted Playwright suite. Commit with critique URL.

### Task 4: Regression gate

- [ ] Run `npx tsc -b`, `npm test`, the targeted Playwright suite, then full `npm run verify`.
- [ ] Confirm the J1–J7 journey suite still passes. Do not merge if any gate fails.
- [ ] Report exact test output and the critique URL for each commit.

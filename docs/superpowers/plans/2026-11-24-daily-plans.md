# Daily plans implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the one Coach a dated, course-grounded sequence of next actions without adding a second recommender, surface, provider or table.

**Architecture:** A pure `buildDailyPlan` wraps the unchanged `getRecommendations` projection and attaches a scheduled day and a grounding label. A read-only endpoint carries it to a `CoachProducer` that reuses `mapRecommendation`, adds a plan badge, and replaces the raw recommendation producer registration. The existing Coach next-step block inside the Study tutor panel renders one dated step line.

**Tech Stack:** TypeScript, better-sqlite3, React 19, existing CSS scheme, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-daily-plans-design.md`

## Global Constraints

- Work only in this worktree on `work/daily-plans-spec-20261124`. No push or merge.
- No new provider, paid path, dependency, authoring authority, grounding implementation, plan table or `DESIGN.md`. Work under `immersive-real.css`.
- Do not change `server/recommendations.ts`, `getRecommendations`, `/api/recommendations`, `server/progress.ts`, Study/Activity/Canvas logic or their existing tests.
- Keep every existing Coach test id: `coach-surface`, `coach-reason`, `coach-preview`, `coach-continue`, `coach-more`, `coach-secondary`, `coach-secondary-item`, `coach-status`, `coach-dismiss`, `coach-toggle`.
- No `@ts-ignore`, no `as any`, no weakened assertions, no skipped specs to make a run green.
- Typecheck every task: `node node_modules/typescript/bin/tsc -b`. Unit tests: `node node_modules/vitest/vitest.mjs run <files>`.
- E2E for every focused step: load `.env`, set `WEB_PORT=5601`, `RUNTIME_PORT=8611`, `DATA_PORT=8612`, `AGENT_PORT=8511`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8511`, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`, then run `node node_modules/@playwright/test/cli.js test tests/e2e/daily-plans.spec.ts --retries=0 --reporter=line` from the repo root.
- Every commit message ends with `Discord: https://discord.com/channels/1574451017817399346/1574861259910815786`.

## Review Focus

- A derived item must say "From your activity"; a cited item must keep its real `source`. No invented excerpt, page, concept or target.
- Two producers must never be registered at once: the plan replaces the raw recommendation producer so dedupe cannot drop or duplicate an action.
- Course or lesson change clears the plan badge and prompts with the rest of the Coach state; no stale date survives.
- Empty plan (unknown course or no signals) keeps the Coach's existing quiet state; no placeholder task.
- Determinism: fixed `now`, same database → same dates, ids, order and badge numbers.

---

### Task 1: Pure daily-plan projection

**Files:**
- Create: `server/daily-plans.ts`
- Create: `tests/daily-plans.test.ts`

**Interfaces:**
- Consumes: `getRecommendations`, `Recommendation` from `server/recommendations.js`; `Database` from `better-sqlite3`.
- Produces: `DailyPlanItem = Recommendation & { day: string; grounding: "cited" | "derived" }`, `DailyPlan = { date, courseId, lessonId, items }`, `buildDailyPlan(database, courseId, now = new Date(), lessonId = "")`.

- [ ] **Step 1: Write the failing tests**

In `tests/daily-plans.test.ts`, copy the small `seededDb()` fixture from `tests/recommendations.test.ts` (courses, lessons, documents, `initializeLearningSchema`, one weak due concept with a cited question, one canvas mistake, one fresh lesson). With `const now = new Date("2026-11-24T12:00:00.000Z")` assert:
  - `buildDailyPlan(db, "c", now).date === "2026-11-24"` and every item has a `day` in `2026-11-24..2026-11-26`, a positive 1-based implied order, and `grounding === "cited"` when `source !== null`.
  - The due `review` item is first and lands on `day === "2026-11-24"`; a `canvas` item is on a later day; a `start` item is last.
  - Two calls with the same `now` are deep-equal; `items.length <= 5`; ids unique.
  - `buildDailyPlan(db, "c", now, "l1").items.every(item => item.lessonId === "l1")`; `buildDailyPlan(db, "unknown", now).items` is empty.
  - An item built from a concept with no question source has `grounding === "derived"` and a non-empty plain `reason` that does not claim a citation. Add one such concept to the fixture by inserting a `learning_concepts` row with attempts/mastery but no `reviewed_questions` row.

Run `node node_modules/vitest/vitest.mjs run tests/daily-plans.test.ts` and confirm it fails because the module does not exist.

- [ ] **Step 2: Implement the projection**

In `server/daily-plans.ts`, call `getRecommendations(database, courseId, lessonId, now)` once and attach fields only. Constants: `DAY_ZERO_CAP = 3`, `HORIZON_DAYS = 3`. Offset rule: `review` → 0; `practice`/`relearn` → 0 while fewer than `DAY_ZERO_CAP` such items have been placed, else 1; `canvas` → 1; `start` → 2. Compute `day = new Date(Date.parse(date + "T00:00:00.000Z") + offset * 86_400_000).toISOString().slice(0, 10)`; clamp any offset beyond the horizon to the last day. `grounding = item.source ? "cited" : "derived"`. Sort items by `day`, then the source order (already priority-descending), then id. Do not add a query, change a reason or invent a source.

- [ ] **Step 3: Run the focused tests and typecheck**

Run `node node_modules/typescript/bin/tsc -b` and `node node_modules/vitest/vitest.mjs run tests/daily-plans.test.ts tests/recommendations.test.ts`. Expected: no type errors; new and existing tests pass.

- [ ] **Step 4: Commit**

`git add server/daily-plans.ts tests/daily-plans.test.ts` and commit with the Discord link.

### Task 2: Read-only daily-plan endpoint

**Files:**
- Modify: `server/api.ts`
- Create: `tests/e2e/daily-plans.spec.ts` (endpoint test only in this task)

**Interfaces:**
- Consumes: `buildDailyPlan` from `server/daily-plans.js`, the live `db` in `server/api.ts`.
- Produces: `GET /api/daily-plans?course=<id>[&lesson=<id>]` returning `DailyPlan`; `400 { error: "course is required." }` when `course` is absent.

- [ ] **Step 1: Write the failing endpoint test**

In `tests/e2e/daily-plans.spec.ts`, import `createCourseWithLesson` from `./helpers`. Create a course/lesson, post a reviewed question from a document via `/api/documents` and `/api/study/questions` (copy the seeding pattern from `tests/e2e/coach.spec.ts`), then assert `request.get("/api/daily-plans?course=<id>&lesson=<id>")` is `200`, its body has `date`, `courseId`, `lessonId` and `items`, and every item has `day`, `grounding` and a real `source` with `title` and `excerpt`. Assert a request without `course` returns `400`. Run the focused e2e command and confirm it fails on the missing route.

- [ ] **Step 2: Wire the route**

In `server/api.ts`, import `buildDailyPlan` beside the `getRecommendations` import and add the route immediately after the `/api/recommendations` branch: require `course`, pass `url.searchParams.get("lesson") ?? ""` as the lesson scope, and return `json(res, 200, buildDailyPlan(db, course, new Date(), lesson))`. No mutation, no store, no provider.

- [ ] **Step 3: Run the focused test and typecheck**

Run `node node_modules/typescript/bin/tsc -b` and the focused e2e command. Expected: endpoint test passes; coach and recommendations unit tests still pass.

- [ ] **Step 4: Commit**

`git add server/api.ts tests/e2e/daily-plans.spec.ts` and commit with the Discord link.

### Task 3: Coach adapter and one registration

**Files:**
- Create: `src/coach/dailyPlanProducer.ts`
- Modify: `src/coach/contract.ts`, `src/App.tsx`, `tests/coach.test.ts`

**Interfaces:**
- Consumes: `mapRecommendation` from `src/coach/recommendationProducer.js`; `CoachContext`, `CoachProducer`, `CoachPrompt` from `contract.js`; `API` from `src/api.js`.
- Produces: `CoachPlanBadge` and optional `CoachPrompt.plan`; `mapDailyPlanItem(item, plan, context)`; `dailyPlanProducer: CoachProducer`.

- [ ] **Step 1: Write the failing adapter tests**

Add a `describe("daily plan producer adapter")` block to `tests/coach.test.ts`. Stub `fetch` with `vi.stubGlobal` and a `DailyPlanResponse` whose items reuse the existing `item` fixture plus `day: "2026-11-24"` and `grounding: "cited"` / `"derived"` variants. Assert:
  - `mapDailyPlanItem` returns the `mapRecommendation` prompt plus `id` prefixed `daily-plan:2026-11-24:`, a badge `{ date, day, step, total }` with `step + total` correct when two items share a day, and an unchanged citation for a cited item.
  - A derived item's `preview` starts with `From your activity — ` and its `source` is `null`.
  - `dailyPlanProducer.produce(context)` fetches `/api/daily-plans?course=c&lesson=l1` and returns prompts deep-equal on two calls.

Run `node node_modules/vitest/vitest.mjs run tests/coach.test.ts` and confirm it fails before implementation.

- [ ] **Step 2: Add the contract field and adapter**

In `src/coach/contract.ts`, add `CoachPlanBadge` and the optional `plan` field with a comment that it is display metadata only and never affects ranking. In `src/coach/dailyPlanProducer.ts`, implement `mapDailyPlanItem` exactly as in the spec's data contract: call `mapRecommendation`, prefix the id, prefix the preview for derived items, and compute the badge from same-day items. Implement `dailyPlanProducer.produce` with the same course/lesson `URLSearchParams` pattern as `recommendationProducer` and the same error message on a failed fetch.

- [ ] **Step 3: Swap the single registration**

In `src/App.tsx`, replace the `recommendationProducer` import and `registerCoachProducer(recommendationProducer)` with `dailyPlanProducer`. Do not register both. Leave `prepareCoachTarget` and `useCoach` wiring untouched.

- [ ] **Step 4: Run focused tests and typecheck**

Run `node node_modules/typescript/bin/tsc -b` and `node node_modules/vitest/vitest.mjs run tests/coach.test.ts tests/daily-plans.test.ts tests/recommendations.test.ts tests/coach.test.ts`. Expected: no type errors; all four files pass.

- [ ] **Step 5: Commit**

`git add src/coach/contract.ts src/coach/dailyPlanProducer.ts src/App.tsx tests/coach.test.ts` and commit with the Discord link.

### Task 4: Dated step line in the Coach block inside the tutor panel

**Files:**
- Modify: `src/coach/useCoach.ts`, `src/coach/coach.css`
- Modify: `tests/e2e/daily-plans.spec.ts`

**Interfaces:**
- Consumes: `top.plan` on the selected `CoachPrompt`.
- Produces: one `<p className="coach-plan" data-testid="coach-plan">` inside the existing `coach-copy` block, reading `Plan <day>, step <step> of <total>` (or `Plan <date>` for a one-item day); no new dock, card or surface beyond the existing tutor panel.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/daily-plans.spec.ts`, reuse `seedReviewedLesson` / `openCoachedLesson` from `tests/e2e/coach.spec.ts` (copy the helpers into this file). Assert: exactly one `coach-surface` and one `coach-continue`; `coach-plan` shows the plan day and a step of a total; Continue opens the Study dialog with the seeded question and `coach-status` says `Ready in Study. Your next question is loaded.`; `coach-more` reveals the remaining steps; switching lesson clears prompts and the plan line; no element with a new plan-card test id exists. Run the focused e2e command and confirm the plan-line assertion fails first.

- [ ] **Step 2: Render the badge**

In `useCoach.ts`, insert the `coach-plan` paragraph inside the existing `coach-copy` div only when `top?.plan` is present, before the `coach-reason` line. Use the same `h(...)` createElement style as the neighbouring lines. In `coach.css`, style `.coach-plan` with the Coach block's existing muted text token and spacing; add a `.dark` override only if the current token is not already readable. No new theme, animation or direction choice.

- [ ] **Step 3: Run focused browser tests and typecheck**

Run the focused e2e command plus `node node_modules/typescript/bin/tsc -b`. Expected: new assertions pass; `tests/e2e/coach.spec.ts` still passes unchanged with its current test ids.

- [ ] **Step 4: Commit**

`git add src/coach/useCoach.ts src/coach/coach.css tests/e2e/daily-plans.spec.ts` and commit with the Discord link.

### Task 5: Full gate, critique and verification record

**Files:**
- Create: `docs/verification/2026-11-24-daily-plans.md`

**Interfaces:**
- Consumes: all four tasks' modules and tests.
- Produces: the verification record with pass/fail/flaky/skipped counts, provider-dependent failures named separately, and one critique URL per commit.

- [ ] **Step 1: Run the full suite**

Run `npm run verify`. Quote the counts for tsc, Vitest and Playwright. Name any provider-dependent or pre-existing intermittent failures separately. Do not weaken or skip a spec to make the run green.

- [ ] **Step 2: Capture and review**

Capture a light and dark screenshot of the tutor panel with the Coach plan line and upload them in the worker thread. Generate one critique URL per commit with `bunx critique --commit <hash> --web "<title>"` and paste each patch into the review. Record the three strongest objections and their resolutions, or note that none were found.

- [ ] **Step 3: Write the record and commit**

Write `docs/verification/2026-11-24-daily-plans.md` with the commands, counts, screenshots, critique URLs and remaining caveats. Commit the record with the Discord link. Do not push or merge.

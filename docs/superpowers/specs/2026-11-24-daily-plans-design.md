# Daily plans — design spec

Owner request: "Daily plans, visual document extraction, deeper simulations, per node artifact editing, and parity are all very important"

Brief: `docs/research/2026-11-24-daily-plans-spec-brief.md`. This is read-only product and architecture work; it writes no product code.

## Intent

A daily plan is a **dated, ordered sequence of grounded next actions** for the course and lesson the student is in. It is a scheduling view over the learning signals the app already computes, not a new recommender and not a generic task list. Every item sends the student back to their own material: a reviewed question in Study, a saved activity board, or a cited source in Studio.

The plan feeds the one Coach. The Coach still emits one ranked prompt at a time, keeps the rest as secondary suggestions, prepares the real destination, and reports honestly. The plan adds a date and a step number to that stream; it adds no second attention surface.

## Goals

- Produce a plan whose items are the existing `Recommendation` objects with two extra facts: the day they belong to and whether their substance is cited or derived from the student's own activity.
- Keep every item actionable through the existing `CoachTarget` contract (`courseId`, `lessonId`, `destination`, one of `boardId`/`activityId`/`cardId`, `conceptId`, plain `reason`).
- Make the projection deterministic: same database state and same day produce the same plan, ids and order.
- Preserve one Coach: one top prompt, secondary suggestions, honest preparation and Continue.
- Display a small, dated step line inside the Coach's next-step block in the Study tutor panel under the current scheme. There is no second dock; closing the tutor hides the Coach until the tutor is reopened.

## Non-goals

- No second recommender, ranking pass over learning tables, learning-signal authority or source-of-truth table. `getRecommendations` remains the only projection of mastery, FSRS, attempts and canvas evidence into next actions.
- No plan table, CRUD, user-editable calendar, streaks, reminders, long-term scheduling, or second plan UI.
- No new provider, paid path, dependency, authoring authority or grounding implementation.
- No change to `/api/recommendations`, `getRecommendations`, `/api/progress`, progress numbers, Study/Activity/Canvas logic or the existing recommendation tests.
- No `DESIGN.md`, visual direction choice or new theme; the plan badge uses the active `immersive-real` scheme.
- No subagents and no Groq models.

## Constraints

- 99.9% of student-facing substance comes from course material. An item with a `source` is cited; an item without one is labelled "From your activity" and carries a plain reason from `getRecommendations`. No excerpt, title, page or citation is invented.
- One Coach owns guidance. The daily-plan producer is registered **instead of** the raw recommendation producer, so the same action cannot appear twice. Ranking, dedupe, dismissal and activation stay in `src/coach/service.ts` and `src/coach/useCoach.ts`.
- The plan is scoped to `courseId` + `lessonId`, matching `CoachContext`. `collectCoachPrompts` already drops out-of-scope items and the Coach clears on course or lesson change; a course-wide calendar would be silently discarded and is therefore out of scope.
- Bounded by the existing `MAX_RECOMMENDATIONS = 5`. No new unbounded query.
- `day` is the UTC calendar date of the injected `now` (`toISOString().slice(0, 10)`). The student-facing badge shows that explicit date rather than claiming a device-local "today", so the contract stays deterministic and testable. Local-time day handling is a later decision, not this slice.

## What already ships — the single source of truth

| Where | Role in this design |
| --- | --- |
| `server/recommendations.ts` (`getRecommendations`) | Deterministic projection of BKT mastery, FSRS due state, attempts, weak concepts, canvas mistakes and fresh-lesson sources into at most five ranked `Recommendation`s with citations and plain reasons. Kept untouched. |
| `server/api.ts` (`GET /api/recommendations`, `GET /api/progress`) | Route pattern and course-required validation to mirror for the new read-only endpoint. |
| `src/coach/contract.ts` | Shared `CoachPrompt`, `CoachTarget`, `CoachSource`, `mapRecommendation`-compatible shapes and dismissal/dedupe keys. |
| `src/coach/service.ts` | Producer registry, ranking (urgency → board match → staleness → kind → id), dedupe, dismissal and one-prompt selection. |
| `src/coach/recommendationProducer.ts` | Existing HTTP adapter and `mapRecommendation`; reused by the new adapter so mapping stays in one place. |
| `src/coach/useCoach.ts` + `src/coach/coach.css` | The single next-step block inside the tutor panel, preview line, secondary list and `data-testid`s the plan badge joins. |
| `src/App.tsx` | `registerCoachProducer(recommendationProducer)` and `prepareCoachTarget`: the one registration point and the real preparation path for study, board and studio targets. |

## Approaches

1. **Server projection over `getRecommendations` plus a Coach producer (recommended).** Add a pure `buildDailyPlan` that calls `getRecommendations` and attaches `day` and `grounding`; expose it through one read-only endpoint; adapt it into a `CoachProducer` that reuses `mapRecommendation` and registers in place of the raw producer. No new signal source, no second UI, no schema change. Small, reversible and fully testable with the existing seeded database fixture.
2. **Client-only derivation from `/api/recommendations`.** Cheapest and needs no server change, but it re-implements scheduling in the client, has no stable date anchor, and cannot represent a sequence beyond the flat five-item list. It also risks becoming a second recommender if its ordering diverges from the server's.
3. **Persisted plan table with editing and CRUD.** Supports a real calendar and long-term scheduling, but introduces a new source of truth and authoring authority, a new UI surface, migrations and a second grounding path. Rejected by the brief's constraints.
4. **Provider-generated natural-language plan.** Violates the no-provider, deterministic and 99.9% course-grounding rules; ranking would stop being reproducible. Rejected.

## Recommended design

Data flow:

```
getRecommendations(db, course, lesson, now)   // unchanged, one signal projection
  -> buildDailyPlan(...)                        // pure: add day + grounding, bucket into a 3-day horizon
  -> GET /api/daily-plans?course&lesson         // read-only, course-required validation
  -> dailyPlanProducer.produce(context)         // map via mapRecommendation, add plan badge
  -> Coach service (rank / dedupe / dismiss)    // unchanged
  -> useCoach + prepareCoachTarget              // one prompt, Continue, honest result
```

### Scheduling rule

`day` is derived from the recommendation `kind` and priority order; it is fresh bucketing, never new ranking. The source list is already sorted by priority.

| Recommendation kind | Day offset | Order within day |
| --- | --- | --- |
| `review` (FSRS due/overdue) | 0 | descending priority, then existing stable id |
| `practice`, `relearn` | 0 for the first three such items, then 1 | descending priority |
| `canvas` | 1 | descending priority, then most recent incorrect event |
| `start` | 2 | lesson title, then document title |

Constants: `DAY_ZERO_CAP = 3`, `HORIZON_DAYS = 3`, total items capped by the existing five-item source bound. Items whose computed offset exceeds the horizon keep the last day rather than disappearing. A day with no items is omitted, so the plan shows only real work.

### Grounding and honesty

- `source !== null` → `grounding: "cited"`. The adapter passes the citation through unchanged; the Coach can open the source as today.
- `source === null` → `grounding: "derived"`. The reason from `getRecommendations` already names the concept and action without claiming a citation; the adapter prefixes the preview with `From your activity —` so the student can tell it is derived from their own attempts, not a course excerpt.
- The plan never changes a reason, excerpt, page, document id or lesson title. It only adds `day`, `step`, `total` and the derived label.

### Determinism and failure behaviour

- `buildDailyPlan` takes an injected `now: Date = new Date()` and `lessonId = ""`; the endpoint passes the server clock. Tests inject a fixed `now`.
- The same input yields identical ids (`daily-plan:<date>:<recommendation id>`), order and badge values.
- An unknown course or a lesson with no signals returns an empty plan (`items: []`), exactly as `getRecommendations` returns `[]`. The Coach then shows its existing quiet state; no placeholder task is invented.
- A failing producer is already swallowed by `collectCoachPrompts`; other producers and the Coach surface keep working.

## Data contract

```ts
// server/daily-plans.ts — reuses, does not redefine, server/recommendations.ts
export type DailyPlanItem = Recommendation & {
  /** YYYY-MM-DD (UTC) this item is scheduled for. */
  day: string;
  /** "cited" when source exists; "derived" when the action comes from local activity only. */
  grounding: "cited" | "derived";
};

export type DailyPlan = {
  /** YYYY-MM-DD (UTC) the plan was generated for. */
  date: string;
  courseId: string;
  lessonId: string;
  /** Ordered by day, then priority; at most MAX_RECOMMENDATIONS (5). */
  items: DailyPlanItem[];
};

export function buildDailyPlan(
  database: Database.Database,
  courseId: string,
  now?: Date,
  lessonId?: string,
): DailyPlan;
```

```
GET /api/daily-plans?course=<courseId>[&lesson=<lessonId>]
  -> 400 { error: "course is required." } when course is absent
  -> 200 DailyPlan
```

```ts
// src/coach/contract.ts — additive only
export type CoachPlanBadge = {
  date: string;   // plan date
  day: string;    // this item's scheduled day
  step: number;   // 1-based within that day
  total: number;  // items on that day
};

// CoachPrompt gains:
plan?: CoachPlanBadge | null;
```

```ts
// src/coach/dailyPlanProducer.ts
type DailyPlanResponse = { date: string; courseId: string; lessonId: string; items: DailyPlanItem[] };

export function mapDailyPlanItem(item: DailyPlanItem, plan: DailyPlanResponse, context: CoachContext): CoachPrompt {
  const mapped = mapRecommendation(item, context); // single mapping authority
  const sameDay = plan.items.filter((entry) => entry.day === item.day);
  return {
    ...mapped,
    id: `daily-plan:${plan.date}:${item.id}`,
    preview: `${item.grounding === "derived" ? "From your activity — " : ""}${mapped.preview}`,
    plan: {
      date: plan.date,
      day: item.day,
      step: sameDay.findIndex((entry) => entry.id === item.id) + 1,
      total: sameDay.length,
    },
  };
}

export const dailyPlanProducer: CoachProducer; // fetches /api/daily-plans?course&lesson
```

### Invariants the builder must keep

- Every item has a concrete `CoachTarget` and at least one of a real `source` or an honest derived reason; no invented target or citation.
- `items.length <= 5`; ids unique; ids and order stable across repeated calls with the same `now`.
- `mapDailyPlanItem` is the only place that adds the plan badge and derived label; `mapRecommendation` stays unchanged.
- Registration in `src/App.tsx` swaps `recommendationProducer` for `dailyPlanProducer` rather than adding a second producer, so dedupe cannot hide or duplicate the same action.
- The Coach surface keeps all current test ids (`coach-surface`, `coach-reason`, `coach-preview`, `coach-continue`, `coach-more`, `coach-secondary`, `coach-status`, `coach-dismiss`, `coach-toggle`). The badge adds one `data-testid="coach-plan"` line inside the tutor panel's Coach block.

## What is left to the builder

- Exact badge copy and how the derived label reads in the rendered tutor-panel Coach block; keep it plain and under the current scheme, and check both light and dark states.
- Confirm from the rendered DOM whether the step line belongs above or below the preview line; no layout or theme decision is made here.
- Whether a course-wide or multi-day browser view is wanted later. It needs a different scope decision because `collectCoachPrompts` filters by lesson and clears on lesson change.
- Local-time day handling if "today" must follow the student's timezone; this spec deliberately uses the explicit UTC date instead.
- Whether `DAY_ZERO_CAP` should change when more than five signals exist; any change must keep the source bound and determinism tests.
- The verification record, screenshots and critique URLs for the implementation commits.

## Acceptance

- `tests/daily-plans.test.ts` proves dated sequence, determinism, five-item bound, citation-or-honest-label, lesson scope and empty unknown course.
- `tests/coach.test.ts` proves adapter mapping, plan badge, derived label, fetch URL and determinism.
- `tests/e2e/daily-plans.spec.ts` proves one Coach prompt with a dated step line, Continue preparing a grounded destination, secondary steps, and no second card or surface.
- `tests/recommendations.test.ts` and `tests/coach.test.ts` keep passing unchanged; `npm run verify` output is quoted without weakened assertions.

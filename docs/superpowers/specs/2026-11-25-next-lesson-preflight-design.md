# Next-Lesson Pre-flight — design (2026-11-25)

## Intent

From a model ideation run, the user picked **Next-Lesson Pre-flight**: show one grounded warm-up before the student's next class, so StudyAI has a reason to be reopened. MVP: three cited items targeting weak prerequisites, one retrieval question and one short explanation.

The idea's own main risk was that StudyAI may not reliably know which lesson is next. **Validated:** there is no `nextLesson` field in the app. There is a daily plan producer, BKT mastery records, a concept graph with weak concepts, a study-resume endpoint and a `Citation` component. The design therefore anchors on the **active lesson / today's plan item**, never a guessed next lesson.

## Goals

1. A single Pre-flight card in Today with three cited passages from weak concepts, one retrieval question and one short explanation.
2. Every passage and answer traces to indexed student material; unsupported material produces an explicit empty state, never invented content.
3. Reuse existing BKT mastery, concept graph, daily plan, study question and citation infrastructure.
4. One primary action: start the reviewed question.

## Non-goals and anti-goals

- No calendar, LMS, notification or push integration.
- No second authoring path, free-text grading or new provider.
- No claim that the app knows the student's real next class; we use the active lesson or today's plan.
- No fabricated mastery, confidence or citation.

## Constraints

- `DESIGN.md` is the UI source of truth; cohesion, not redesign.
- Local-first and BYOK; no new dependency, key, service or `.env` change.
- TDD with Playwright DOM assertions and honest empty/error/retry states.
- No merge before `tsc -b`, Vitest and targeted Playwright pass.
- The one-drop start plan (Tasks 4–5) remains approved but paused while this is built.

## Approach

Reuse `coach` daily-plan prompts and concept-graph mastery to select three weak concepts in the active course. Retrieve one passage per concept through the existing document API and render each with the existing `Citation` chip. Offer one existing reviewed question from the study API; if none exists, show the honest "author from source" empty state already used by StudyPanel. The short explanation is the retrieved excerpt itself with its citation, not model prose.

This avoids a new model call for content selection and keeps all substance in student material. Alternative approaches — a deterministic lesson-order guess, or a new generator — were rejected because the next lesson is not knowable and a generator would risk unsupported claims.

## Verification

- Unit tests for concept selection from mastery signals.
- Playwright DOM assertions: three cited passages, one question, one start action; empty state when no weak concept or no indexed passage.
- Full `npm run verify` before merge.

# Adaptive learning

The lesson scoped learning subsystem lives in `server/learning` and `src/learning`. Its additive SQLite schema is initialized by the data API. Existing course, lesson, document, note, attempt, and canvas tables are left intact.

Reviewed questions can be registered with `POST /api/study/questions`. The endpoint requires `reviewed: true`, validates the course/lesson and source document scope, and checks that the citation excerpt and optional page occur in either the existing document intelligence chunks or legacy document chunks. Questions are versioned.

Student flow:

- `GET /api/study/ask?course=…&lesson=…` presents the due reviewed question from the lowest mastery concept.
- `POST /api/study/attempts` accepts `{ presentationId, idempotencyKey, choiceId }`. Grading compares the selected choice with the reviewed version. The transaction stores the answer, source evidence, and BKT update once.
- `POST /api/study/reviews` accepts `{ cardId, idempotencyKey, rating }`, where rating is `Again`, `Hard`, `Good`, or `Easy`. FSRS runs with fuzz disabled so a given prior state, rating, and timestamp has an exact due time.
- `GET /api/study/resume?course=…&lesson=…` restores an unanswered presentation, an unrated result, or the next scheduled review from SQLite.

BKT equations and lowest-mastery selection are adapted from OATutor (CAHLR); see [NOTICE.md](../server/learning/NOTICE.md) for MIT attribution. The implementation uses the default parameters `pInit=.1`, `pLearn=.2`, `pGuess=.2`, and `pSlip=.1`.

The adaptive-learning tests are `tests/learning.test.ts`, `tests/learning-api.test.ts`, and `tests/e2e/adaptive-learning.spec.ts`.

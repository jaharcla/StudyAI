# ADR: Course-relevance judgement moves from the intent policy to the tutor model

Date: 2026-11-22
Status: accepted, implemented, measured.
Design: [2026-11-22-canvas-course-grounding-design.md](../superpowers/specs/2026-11-22-canvas-course-grounding-design.md)
Measurement: `scripts/benchmark-canvas-grounding.ts` (deterministic), `scripts/measure-canvas-grounding-live.ts` (provider calls)

## Decision

`server/tutor-retrieval-policy.ts` no longer decides whether a question needs coursework.
`shouldRetrieveCourseDocuments` now declines only messages that contain no question — a greeting, or
an exact-output instruction — and the keyword wall and the canvas veto that used to sit in it are
deleted, along with `canvasFirstWithoutSource` and `canvasDescriptionOnly`. The retrieval tool stays
bound whenever a course is active, and the model decides whether to use the prefetched excerpts, to
search again in its own words, or to ignore course material entirely.

Two supporting changes, both containment rather than judgement:

- `server/tutor-context.ts` treats course excerpts as the first thing to drop when the frame is
  tight, since the model can fetch them again itself. Overflow of prefetched evidence no longer
  refuses the request; it returns `courseEvidenceDropped`.
- `server/agent.ts` stops serializing a "no matching excerpts" envelope into the prompt. Empty
  results are `null`, so unmatched questions stop paying ~120 characters for the word "nothing".

## Evidence

Six questions about drawn things, against real imported lectures, scored on whether the passage that
answers each one reaches the model. Same corpus before and after.

| | before | after |
|---|---|---|
| reaches course retrieval at all | 2/6 | 6/6 |
| answer passage returned from the utterance alone | 2/6 | 6/6 |

The corpus is `tests/fixtures/canvas-course-grounding.ts`; every `needle` is asserted to occur in
exactly one indexed chunk, so a hit cannot be an accident of the fixture.

Model-authored queries, the same six cases, two repeats, `openai/gpt-oss-120b`, 12 calls, 4,105
tokens: **12/12 reached the answer passage.** The queries the model wrote were not paraphrases of
the student's sentence — for the spring it wrote `spring overshoot equilibrium simple harmonic motion
inertia damping`, for the freebody sketch `normal force reaction force free-body diagram`. Neither
"simple harmonic motion" nor "free-body" appears in the utterance or in the board terms supplied to
it. That is the vocabulary bridge this ADR was going to buy with embeddings.

## Rejected alternatives

- **Tune the regex.** Keeps the architecture that just failed four of seven cases; every unusual
  phrasing needs another branch. The partner's objection — hardcoded rules about what the AI may do
  — is correct on the evidence, not just on taste.
- **Deterministic query synthesis from board state.** Written as this project's plan, withdrawn. The
  live run shows the model does it better and the rule would only bound it.
- **Embeddings / Chroma / reranking.** `ADR-2026-11-18-spatial-canvas-scene.md:22` requires a
  demonstrated capability gap. 6/6 deterministic and 12/12 model-authored reach is the opposite of a
  demonstration. The lexical index was never the problem.
- **Keep prefetching but add a "does this look academic" classifier.** That is the deleted wall
  rebuilt in another language.

## Limits

- Six cases, authored by me, in one course. Strong enough to show the veto was the failure; not
  enough to claim 100% generalization. Real student phrasing will miss sometimes, which is now
  visible rather than suppressed.
- The live measurement tests query authoring in isolation, not the full agent graph with tools bound.
  A model that chooses not to search at all would still fail; nothing here measures that choice.
- `can you tell me what is on the board` now prefetches irrelevant excerpts. Deliberate: the frame is
  bounded by the budget layer and the model was told excerpts are candidate evidence, not answers.
- Retrieval is still FTS5 bm25 over up to 20 quoted OR-terms; multi-word concepts are not phrase
  matched, and no embeddings were added.
- `recommendedToolsForQuery` still routes by keyword, but it only names tools in a prompt hint and
  never removes a bound tool, so it cannot veto course grounding again.
- `ocr.space` was not integrated. It measured 3/6 exact, 0.853 mean F1 against a 4/6, 0.91 Gemini
  baseline, its LaTeX-capable engine is capped at 1,000 requests/month, and none of the failures
  above involve OCR accuracy.

## Verification

- `node_modules/typescript/bin/tsc -b` clean; `vitest run` over `tutor-context`,
  `tutor-retrieval-policy`, `tutor-integration`, `tutor-tool-retrieval`: 57 passed.
- New tests: evidence dropped rather than refused, evidence kept when it fits, and a regression pin
  asserting the three spring/arrow/decay utterances are no longer declined.
- `tests/tutor-integration.test.ts` course-isolation test now asserts the other course's marker is
  absent instead of asserting the empty envelope was present.
- Not run: `npm run benchmark:canvas`. The changed prompt is the tutor's system prompt, not a canvas
  OCR/structure/fusion prompt, but the project rule keys on "any change to a prompt", so the canvas
  benchmark remains owed before this ships.

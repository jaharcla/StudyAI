# Design: canvas-grounded course answering

Date: 2026-11-22
Status: revised after partner feedback — judgement moves to the model, rules stay only as containment.
Origin: a request to add the `ocr.space` OCR provider, which investigation showed does not address the actual goal.

## Intent

The student draws something on the canvas — a freehand spring, a freebody diagram, a handwritten
expression — and asks a question about it that only makes sense against their coursework. The tutor
should know what is being asked, know what is on the board, retrieve the relevant course material,
and answer. The canvas is meant to be the system's home ground: something it is confident about,
that it notices changes to, and whose relationships it understands.

## Findings that define the problem

Three separate breaks, all confirmed in code, in the order a request hits them.

1. **Canvas questions are vetoed from course retrieval by design.**
   `server/agent.ts:68` computes `retrievalRequested = shouldRetrieveCourseDocuments(query)`, and
   `server/tutor-retrieval-policy.ts:3` returns `false` when `canvasFirstWithoutSource()` matches —
   defined at `:81-84` as *mentions canvas/board/diagram/drawing/sketch* **and** *does not explicitly
   say "according to / from the course|lecture|textbook|notes|study guide"*. So
   `"why does the spring in this diagram overshoot equilibrium?"` retrieves no course evidence at
   all. This is intentional and pinned by `tests/tutor-retrieval-policy.test.ts:15`
   (`"Explain this canvas."` → `false`). The escape hatch that does work is naming a source in
   prose, which a student describing their own drawing has no reason to do.

2. **The canvas never shapes the retrieval query.**
   `server/agent.ts:160` calls `retrieveCourseDocuments(db, course.id, query)` with the raw user
   utterance. Whatever is on the board contributes nothing. The only path where canvas content
   influences retrieval is the model voluntarily calling `search_course_documents`
   (`server/document-intelligence/retrieval-tool.ts:10`) with a query it composes itself — not
   guaranteed, and until now unmeasured.

3. **The seam between board and course has never been tested.**
   `docs/DOCUMENT_INTELLIGENCE.md:16`: "the system does not use embeddings or reranking."
   `searchDocuments` (`server/document-intelligence/service.ts:92`) splits the query on whitespace
   into up to 20 quoted OR-terms and ranks by bm25. No test asserts that canvas content changed which
   course chunk came back; e2e coverage checks document citation and canvas reading separately
   (`docs/canvas-interaction-verification.json`).

Related, and not the same problem: the accumulating blackboard in `server/canvas-reasoning/` — the
one component that actually builds durable board knowledge — is gated at `server/agent.ts:178` to
`reasoningMode === "always"` or the local Ollama provider, so on the default cloud path it is not
running.

## Measured baseline and outcome

`scripts/benchmark-canvas-grounding.ts` on the corpus in `tests/fixtures/canvas-course-grounding.ts`,
questions about drawn things against real imported lectures, no provider call.

Before the change, on seven scored cases:

```
gate:           3/7 questions reach course retrieval at all
reach:          3/3 of those return the answer passage (3/7 overall)
board-informed: 7/7 return it when the board's own terms are in the query
```

After deleting the keyword wall and the canvas veto, on the six genuine canvas questions:

```
gate:   6/6 reach course retrieval at all
reach:  6/6 return the passage that answers them from the utterance alone
```

Two conclusions, and neither was the one expected going in:

- The hardcoded intent gate accounted for essentially all of the failure. It is the largest single
  cause by a wide margin, not a contributing factor.
- **Lexical retrieval is not the bottleneck, and neither is vocabulary.** Every passage was findable
  once board vocabulary entered the query, and after the veto was lifted the raw student sentence
  found it unaided. A live run of the same six cases, two repeats, `openai/gpt-oss-120b`, asking the
  model to author its own query, scored **12/12** — with invented bridging terms like `simple harmonic
  motion inertia damping` and `free-body diagram` that appear in neither the utterance nor the board
  terms given to it. The case for embeddings is not merely undemonstrated, it is contradicted:
  `ADR-2026-11-18-spatial-canvas-scene.md:22` keeps its gate closed, now on evidence.

## Revision after partner feedback

The original design proposed deterministic query synthesis — code assembling board terms into a
retrieval query. That was rejected: it hardcodes exactly the decision the model should be free to
make, and the baseline above shows the model's own reach is fine when it is permitted to try.

The principle now: **judgement belongs to the model, containment belongs to the code.**

- *Judgement, given to the model*: whether a question needs course grounding at all; what to search
  for; how to weigh an excerpt against what it sees on the board; whether it is confident enough to
  answer or should say it cannot read something. The keyword wall in `tutor-retrieval-policy.ts`
  stops deciding these.
- *Containment, kept in code* — these are validity and safety bounds, not opinions about capability:
  course and board scope isolation, revision checks so stale analysis is rejected, request and
  context budgets, the write-approval gate, and citation identity validated against retrieved
  candidates rather than invented.

## Goals

- Delete the regex intent gate as the authority on relevance; bind `search_course_documents`
  whenever a course is active and let the model decide whether and how to use it.
- Keep the two bounds that were never judgement: exact-output requests get no appended citations,
  and course scope isolation stays server-validated.
- Prove the freedom works rather than assume it: measure the model-decides path on the same corpus,
  reporting the rate at which a model-authored query reaches the target passage, repeated to show
  variance.
- Retain the instrument. The corpus is a fixture and a validity check on the measurement, not a
  runtime rule; it is how a free component is prevented from silently getting worse.

## Non-goals

- Adding `ocr.space` in this round. Its math accuracy is below the committed Gemini baseline (3/6 vs
  4/6 exact, 0.853 vs 0.91 mean F1) and its LaTeX-capable engine is capped at 1,000 requests/month;
  none of the three breaks involve OCR accuracy. Its one unclaimed merit is per-word bounding boxes
  for *printed* labels, which the pipeline currently discards (`imageRegion: null` at `groq.ts:350`,
  `openai-compatible.ts:117,132`). Deferred.
- Embeddings, vector stores, or reranking — unsupported by the baseline above, and re-openable only
  with evidence that model-authored queries still miss.
- A confidence number on OCR items. Six labelled math boards exist in
  `data/canvas-dataset-benchmark/scoring/ground-truth.json`; that cannot calibrate anything.
- Change detection between revisions — agreed valuable, sequenced after this.

## Anti-goals

- Replacing one hardcoded decision with another. Any "canvas-informed query builder" that assembles
  terms by rule is the rejected design wearing a different hat.
- Freedom without measurement. An unmeasured agent is not more capable, only less legible when it
  fails.
- Confidently answering about the wrong drawn object. Silent misreference is worse than admitting it
  cannot tell which thing was meant.

## Approaches considered

**A. Measurement first, then delete the gate and let the model decide (chosen).** The instrument
comes before the behaviour change so the change is provable. Trades: verifying freedom costs
provider calls and returns a rate rather than a boolean; gains: no rule pretends to know when
coursework is relevant.

**B. Tune the regex.** Narrow `canvasFirstWithoutSource` so board questions pass. Rejected: it keeps
the architecture that just failed four of seven cases, and every unusual phrasing needs another
branch. This is the "hardcoded stuff" the partner objects to, in a friendlier costume.

**C. Deterministic query synthesis from board state.** Written as the plan, withdrawn after feedback
and after the baseline showed model reach is already adequate. Rejected.

**D. Add embeddings to close the vocabulary gap.** Rejected on evidence: 7/7 board-informed reach
says the index is not what is missing.

## What is left to the builder

How the model is told the board is present without a keyword test deciding what that means; how many
repeated live runs are enough to call the rate stable; and whether controls that must *not* retrieve
(greetings, exact-output) survive as bounds or simply as the model's own good sense, checked by the
harness.

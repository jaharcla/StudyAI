# Plan: canvas-grounded course answering

Design: [docs/superpowers/specs/2026-11-22-canvas-course-grounding-design.md](../specs/2026-11-22-canvas-course-grounding-design.md)
Decision: [docs/decisions/ADR-2026-11-22-tutor-retrieval-judgement.md](../../decisions/ADR-2026-11-22-tutor-retrieval-judgement.md)

Sequence agreed in conversation: measure the seam, then remove the rule that blocks it, then change
deltas, then a durable board model, then the confirmation loop. ocr.space is parked — it is not on
this path.

## Phase 1 — measure the seam (done 2026-11-22)

- [x] Corpus of questions about drawn things against real imported lectures, with the expected
      passage pinned to exactly one chunk — `tests/fixtures/canvas-course-grounding.ts`
- [x] Deterministic runner reporting gate / reach / board-informed — `scripts/benchmark-canvas-grounding.ts`
- [x] Baseline captured: 3/7 reached retrieval, 3/7 reached the answer passage

## Phase 2 — take the judgement away from the regex (done 2026-11-22)

- [x] Delete the keyword wall and the canvas veto from `shouldRetrieveCourseDocuments`
- [x] Regression pins: the three previously-vetoed utterances now reach retrieval
- [x] Make prefetched course excerpts droppable in `budgetTutorContext` instead of refusing the request
- [x] Stop serializing an empty "no matching excerpts" envelope into the prompt
- [x] Tell the tutor in the system prompt that relevance is its call, including for drawn things
- [x] Measured after: 6/6 reach retrieval, 6/6 reach the answer passage from the utterance alone
- [x] Live model-authored queries: 12/12 reached the passage (6 cases x 2 repeats, 4,105 tokens)
- [x] `tsc -b` and the four tutor test files green (57 tests)

## Still owed before this ships

- [ ] `npm run benchmark:canvas` against the committed baseline. The rule keys on any prompt change;
      the edit here is the tutor's system prompt, and this needs ~7 deep-mode board runs with
      provider calls. Needs a go-ahead because it costs money.
- [ ] `npm run verify` in full, including the Playwright flows, quoted in the handoff.
- [ ] `gitnexus detect_changes` before committing.
- [ ] Commit — nothing has been committed; the working tree also carries unrelated in-progress work
      from earlier sessions in `server/learning/`, `src/learning/` and several e2e specs.

## Phase 3 — say what changed (not started)

Deterministic delta between canvas revisions: which strokes and objects appeared, vanished or moved,
and which recorded claims that touches. No provider calls, confidence 1 by construction, and the
precondition for "if something changes it should know exactly what and how."

## Phase 4 — make the board model durable (not started)

`server/canvas-reasoning/` is the only accumulating component, but its state carries `question`, so
the system re-learns the board per question, and `agent.ts:178` runs it only on the local provider.
Making it question-independent and persistent means it becomes the authority on board knowledge,
which collides with the current one-authority-per-interpretation rule and needs its own ADR.

## Phase 5 — close the confirmation loop (not started)

`scene/ink.ts:40` already promotes a reading to `verificationStatus: "confirmed"` when the student
confirms it, and `evidence.ts` treats confirmed ink as certain. What does not exist is the tutor
asking about the one glyph it could not read and persisting the answer. This is the only mechanism
that turns an OCR guess into knowledge, and in a study app it is also the better pedagogy.

## Parked

- `ocr.space`: 3/6 exact, 0.853 F1 vs the 4/6, 0.91 Gemini baseline; Engine 3 (the one that emits
  LaTeX) is 1,000 requests/month against the 25,000 headline, which is Engine 2 at F1 0.048 on
  handwriting. Its unclaimed merit is per-word boxes for *printed* labels, which the pipeline
  currently discards (`imageRegion: null` at `groq.ts:350`, `openai-compatible.ts:117,132`). Key is
  not written to `.env`; it was never needed.
- Embeddings: contradicted by the live run rather than merely unproven. Revisit only if
  model-authored queries start missing passages that the corpus says they should find.

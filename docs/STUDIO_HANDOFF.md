# StudyAI Studio — discovery, implementation and verification handoff

Date: 2026-11-22
Worktree: `C:\Users\Owner\.local\share\opencode\worktree\e35993\studyai-studio` (branch `work/studyai-studio`)
Base: `work/learning-ui-newui` @ 38b77bc. **No commits made** (no authorization). `main` was not edited.

## What was discovered

StudyAI already integrates the core of the 28 staged OSS archives (see `docs/DEPENDENCIES.md`):
CopilotKit/LangGraph, Math.js/MathLive, OpenChemLib, ts-fsrs, QuickDraw, Zod, pdf.js/react-pdf and
Transformers.js/CLIP. The rest were deliberately deferred with recorded reasons. The remaining gap
is not "missing libraries" but missing **generated study artifacts**.

Competitor benchmark (NotebookLM, now Gemini Notebook): official Google help pages
`support.google.com/gemininotebook/answer/16206563` (Sources/Chat/Studio), `.../16212283`
(mind maps), `.../16454555` (video overviews), `.../16958963` (flashcards/quizzes), plus
`notebook.google` and a secondary DigitalOcean 2026 overview. Its Studio panel generates mind maps,
study guides/reports, data tables, slide decks, infographics, audio/video overviews, flashcards and
quizzes from multi-format sources, with inline citations. StudyAI had none of these, but has a
scientific canvas, BKT + FSRS mastery, FTS5 citations and local-first data that NotebookLM lacks.

`src/lab/*.tsx` turned out to be explicitly throwaway design prototypes (`src/lab/data.ts:1-2`);
the real new UI is the immersive `src/App.tsx` + `src/schemes/immersive-real.css`.

## Conflicts with existing uncommitted work

- `main` holds a **partial, uncommitted** copy of the new UI. The complete new UI, FSRS flashcard
  review and question authoring are committed on `work/learning-ui-newui`. Studio was based there
  so it integrates with the real learning engine; `main`'s working tree was left untouched.
- `main`'s uncommitted `tests/canvas-analysis-producer.test.ts` fix
  (`initializeCanvasAnalysisStorage(database)`) explains the baseline failure and was carried over.
- No provider, OCR, prompt, recognition-threshold or benchmark-baseline changes.

## What was implemented

- **Server** `server/studio/`: Zod contracts, additive `studio_artifacts` table, bounded grounding
  from FTS5 document chunks + `learning_concepts` + the canvas scene graph, one Groq-first JSON
  completion through the existing `createTutorChatModel`, strict Zod validation and a provenance
  filter that drops any item with an invented citation and rewrites document IDs/pages from the
  server's own source map. `importStudioArtifact` sends accepted items through
  `LearningService.registerCard` / `addReviewedQuestion`, so BKT, FSRS and citation validation stay
  the only authorities. Routes wired into `server/api.ts`.
- **Client** `src/studio/`: a real Studio surface in the immersive UI (Studio button in the top
  actions) with mind map, study guide and practice tabs; `@xyflow/react` mind map with
  expand/collapse, node inspector and source navigation; cited guide sections; practice review with
  "Add to study deck". Mind-map nodes can cite either a document chunk or a canvas scene-graph node
  (the structured knowledge already in StudyAI); guides/practice require document refs because they
  feed the citation validator. Scoped CSS; no prototype/mock data.
- **ADR** `docs/decisions/2026-11-22-studio-architecture.md`: reuse decisions and why FTS5 remains
  the retrieval authority (no vector DB/embeddings without a labelled relevance evaluation).

No new dependency, no second flashcard system, no change to `TUTOR_PROVIDER`.

## What was tested

| Check | Result |
| --- | --- |
| Baseline on 38b77bc | `tsc` clean; vitest 451 pass / 1 pre-existing `canvas-analysis-producer` failure |
| `npx tsc -b` after changes | clean |
| `npx vitest run` after changes | **459 pass / 0 fail** (one earlier flaky parallel collection run was green on re-run) |
| `npm run build` | passes (pre-existing chunk-size warning) |
| `npx playwright test tests/e2e/studio.spec.ts` | **1 passed**: ReactFlow nodes render, branch collapse/expand, concept inspector, source navigation closes Studio, guide sections/citations render, practice import posts `{artifactId, cards, questions}` |
| E2E setup | Vite on 5193 proxying to the already-running loopback data/runtime services; studio routes mocked with fixtures; throwaway config removed afterwards |

## What remains incomplete / not verified

- **Live Groq generation was not smoke-tested** with a real `GROQ_API_KEY`: unit tests inject a
  deterministic generator and the Playwright test mocks the HTTP routes, so prompt quality,
  token limits and JSON compliance of the real model are unverified. A manual run with a key is the
  next step before shipping.
- Mind-map/guide/practice **quality is not benchmarked** against NotebookLM; only grounding and
  citation integrity are enforced and tested.
- Semantic search/embeddings were investigated and deliberately deferred via ADR; no labelled
  relevance set exists to justify overturning FTS5.
- Audio/video overviews, data tables, slide decks and infographics remain out of scope for v1.
- Studio is wired into the real immersive `App.tsx` only, not the `?lab` comparison prototypes.
- Changes are **not committed and not merged into `main`** — awaiting authorization.
- `main` advanced by several commits while this work was in progress (including the learning-UI
  completion). Integration is a merge of `work/studyai-studio`; the only overlap with `main` is the
  small `src/App.tsx` mode/button/overlay addition and the one-line canvas-analysis test fix, both
  of which should be straightforward to reconcile. `main`'s uncommitted work was never edited.

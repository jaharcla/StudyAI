# Design: StudyAI Studio (provenance-bound learning artifacts)

Date: 2026-11-22
Status: approved by the human partner's delegation ("choose the implementation details")
Base: `work/studyai-studio` branched from `work/learning-ui-newui` @ 38b77bc (the real new UI)

## Intent and why

NotebookLM (now Gemini Notebook) wins on a visible "Studio" panel: mind maps, study guides,
flashcards, quizzes, data tables and overviews generated from a notebook's sources. StudyAI has
the deeper learning engine (BKT + FSRS), a scientific canvas, and local-first data, but none of
those generated artifacts, so a student still has to assemble study material by hand. This adds a
first version of StudyAI Studio inside the **real immersive UI**, with a deliberately different
bet: every generated item carries a citation back to the exact course chunk, canvas node or
concept it came from, and generated practice enters the existing mastery/review engine rather
than a second flashcard stack.

## Goals

1. Generate an interactive mind map from a lesson's course documents plus its canvas scene graph.
2. Generate a grounded study guide/report with inline, openable source references.
3. Generate flashcards and quiz questions, review them, and import accepted ones into the existing
   `LearningService` (BKT mastery, FSRS scheduling, reviewed-question validation).
4. Reuse `@xyflow/react` (already installed, zero imports) and the pinned Groq-first model factory.
5. Persist artifacts in SQLite and survive reload.
6. Verify rendered DOM behaviour with Playwright, not only compilation.

## Non-goals

- No audio/video overviews, infographics or slide decks (no generative-media authority here).
- No new vector database, embeddings pipeline, or change to FTS5 retrieval (see the ADR).
- No change to `TUTOR_PROVIDER`, Groq model selection, tutor prompts, canvas OCR, recognition
  thresholds or the canvas benchmark baseline.
- No new "StudioCommand" prototype in `src/lab/` — those files are explicitly throwaway mockups.
  Studio is a real surface in `src/App.tsx`, the app's actual new UI.
- No auto-marking of generated questions as human-reviewed; import goes through the existing
  citation validator and the student accepts the items.

## Anti-goals (what would make this a failure)

- A mind map that is a static image or a mock: it must render real ReactFlow nodes with real
  source refs and expand/collapse behaviour.
- A study guide with plausible text whose citations do not resolve to a course document.
- Flashcards that flip locally but never enter FSRS, or quiz questions that bypass
  `addReviewedQuestion`'s excerpt check.
- A third board-interpretation or retrieval authority alongside `server/canvas-intelligence/scene/`
  and `server/document-intelligence/`.

## Constraints

- Additive SQLite schema only (`studio_artifacts`), initialized from `server/api.ts`.
- Every UI-visible feature gets a Playwright assertion against the rendered DOM (`AGENTS.md`).
- No `@ts-ignore`/`as any`; third-party APIs verified against installed type files
  (`@xyflow/react/dist/esm/index.d.ts:1,20` confirms `ReactFlow` and `useNodesState`).
- Model calls go through `createTutorChatModel` + `getTutorProviderSettings`; no provider switch.
- Generated JSON is validated with Zod; every citation ref must be one that was supplied to the
  model. The server fills document IDs/pages from its own grounding map, never from model output.
- Workspace stays local-first and single-user; app services remain on loopback.

## Approaches considered

| | Shape | Trade-off |
|---|---|---|
| A | Clone NotebookLM Studio: audio/video, infographics, slides | Largest scope, no shared infrastructure with StudyAI, copies a competitor rather than differentiating; reject |
| B | Minimal "generate a note" button with no persistence or learning integration | Cheap but a placeholder; reject |
| **C (chosen)** | Provenance-bound artifacts (mind map, guide, practice) in the immersive UI, reusing xyflow, FTS5, Groq config and LearningService | Coherent with existing authorities, genuinely useful, and Playwright-testable |

## The decided how

### Server — `server/studio/`

- `contracts.ts`: Zod schemas for `POST /api/studio/generate` (`courseId`, `lessonId`, `kind`,
  `focus`, `practiceType`, `count`), artifact responses, and `POST /api/studio/import`.
- `grounding.ts`: builds a bounded packet from three sources that already exist:
  1. `searchDocuments` (FTS5/BM25) over the course for the focus and document titles;
  2. `learning_concepts` names for the course/lesson (the personalized knowledge layer);
  3. `queryCourseCanvasScene` nodes/edges for the board (the structured scientific knowledge graph).
  Caps: 12 excerpts of 600 chars, 20 concepts, 12 canvas relations, ~10k chars total.
- `service.ts`: one Groq-first model call per generation. Strict JSON prompt; robust parse
  (fences/leading prose); Zod validation; **provenance filter** drops any item whose `sourceRef`
  was not supplied, and rewrites IDs/pages from the grounding map. Persists to `studio_artifacts`.
  `importArtifact()` feeds accepted cards/questions through `LearningService.registerCard` and
  `addReviewedQuestion`, so BKT/FSRS/review UI remain the only authorities.
- `schema.ts` + `http.ts`: additive table and routes, wired into `server/api.ts` beside the other
  feature handlers.

### Client — `src/studio/`

- `StudioSurface.tsx`: full-screen overlay matching the new UI's `study-stage` pattern, opened by a
  **Studio** button in the immersive top actions. Tabs: Mind map / Study guide / Practice. Focus
  input, Generate, artifact history, status/empty/error states.
- `MindMapView.tsx`: `ReactFlow` with `useNodesState`/`useEdgesState`, `Background`, `Controls`,
  custom nodes, click-to-expand/collapse and a citation inspector. "Open source" uses the same
  document-navigation callback the global search uses.
- `StudyGuideView.tsx`: sections and key terms with clickable citations.
- `PracticeView.tsx`: review generated cards/questions, then "Add to study deck" calls
  `/api/studio/import`; the existing `FlashcardReview` and `StudyPanel` become the review surface.
- `src/studio/studio.css`: scoped to `.studio-surface`, matching `immersive-real.css` tokens.

### Verification

- `npx tsc -b`, `npx vitest run` (new unit tests for grounding bounds, provenance filtering, import
  into LearningService, schemas), `npm run build`.
- Playwright spec that mocks `/api/studio/*` with a fixture and asserts: ReactFlow nodes render and
  expand, citations render, guide sections render, practice import posts to the real endpoint.
- Re-run the existing canvas verification path; Studio does not touch recognition.

## Baselines and known conflicts

- Baseline at branch commit 38b77bc: `tsc` clean; vitest 451 pass / 1 pre-existing failure in
  `tests/canvas-analysis-producer.test.ts` (502 vs 200). `main`'s uncommitted diff adds
  `initializeCanvasAnalysisStorage(database)` to that test; carry that fix into this branch.
- `main`'s uncommitted work is a partial, untracked copy of this branch's new UI. It is left
  untouched in `main`; this branch is isolated and shares no editable files with it.

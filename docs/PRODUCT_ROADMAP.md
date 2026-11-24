# StudyAI product roadmap — coordinator's ground truth

Date: 2026-11-23. Owner: channel coordinator. Authority for this document: the partner's 2026-11-15 coordinator brief (full product vision in Section 2) plus `docs/VISION.md`, `docs/STATUS.md`, `docs/next.md`, and `docs/usability-vs-product-vision.md`.

This is the living coordination document. `docs/next.md` remains the authority for *canvas/author_board* sequencing; this page adds the full product view the partner asked for, including capabilities not yet specified in the repo.

## North star

One intelligent workspace where a student imports course material, learns from grounded tutoring, constructs and manipulates scientific representations on the Canvas, generates and edits educational artifacts, practices adaptively, and sees a clear next step. The Scientific Canvas is the differentiator; everything else must connect to it and to the learner's state.

**Standing competitive frame (partner, 2026-11-23):** StudyAI is an AI study tool that should rival Gemini NotebookLM, StudyFetch and Gauth. Lead with the interactive Scientific Canvas: a Tutor that both understands and directly manipulates the board, teaches the student's own course material, and creates study artifacts. Competitors set the parity bar — NotebookLM's source-grounded Q&A and audio overviews, StudyFetch's cards/quizzes/notes from uploads, Gauth's step-by-step problem solving — but parity alone is not the goal. The wedge is structured, manipulable scientific work plus grounded artifact creation in one connected environment. Any UX or feature decision should be checked against this frame: does it make the Canvas-led study loop clearly better than those products, not just comparable?

## Audit: what is true today

Based on `docs/usability-vs-product-vision.md` (static audit of the documented `main` snapshot) and `docs/STATUS.md` / `docs/next.md`.

**Works and must be protected**
- One course/lesson scope threads canvas, documents, Tutor retrieval, Studio, learning, and progress.
- Grounding is enforced server-side: citations are rewritten from the server's own source map; questions require excerpts present in retrieved chunks.
- AI edits are proposals, not actions: one approval transaction, one revision bump, one undo step.
- The retention loop closes: question attempt → BKT update → FSRS card → rating → due date → progress.
- Deterministic scientific authority exists (Math.js, formal charge, vectors, OpenChemLib).
- Canvas is the deepest subsystem: 15 structured object kinds, revision-bound scene graph, physics diagnostics, OCR, `author_board`.

**Broken or confusing on primary paths**
- Tutor describes drawn work as geometry, raw component arrays, and `canvas item-<uuid>` placeholders.
- Lewis structure construction is documented as failing end to end.
- Generated artifacts ignore `artifact.kind`; `graph` becomes an equation, `vector` a hardcoded `[1,0,0]`, no validator runs.
- Course and lesson creation use bare `window.prompt`.
- Deep analysis has no staged progress and a p95 above its own target.
- Progress shows numbers but no weak concepts, trend, or actionable next step.
- Visual/scanned document content is silently unavailable to the Tutor and learning system.

**Missing from the full vision**
- Personalized recommendations: no contract, no model, no UI surface. (Critical.)
- Misconception → BKT loop: canvas errors do not change future practice.
- Semantic knowledge graph: the existing graph is spatial and per-board; no cross-lesson concept graph with mastery.
- Educational artifact breadth: only `author_board` and a slide-deck *design draft* exist. Podcasts, audio lessons, educational video, study guides, infographics, and interactive materials are undocumented as capabilities.
- Voice-based tutoring: no TTS/STT learning flow.
- Cross-course review queue, portable courses, simulations, per-node artifact editing.

**Undocumented capabilities the partner named that the repo does not even plan for**
Podcasts and audio lessons; narrated educational video; study guides as a first-class artifact; infographics; interactive simulations; voice tutoring; learning plans with daily/long-term scheduling. These are gaps in the *specification*, not just the implementation, and must be investigated rather than treated as out of scope.

## Vision coverage matrix (Section 2 of the partner brief)

| Capability | Today | Next | Notes |
| --- | --- | --- | --- |
| A. Grounded tutoring, explanations, Socratic, adaptive questions, grading | Strong core; weak canvas description | Human-level canvas description; misconception→BKT | Voice tutoring unplanned |
| A. Personalized plans and recommendations | Absent | Define contract + surface | Critical path |
| B. Presentations / slides | Design draft only (Presenton integration chosen) | Spike, then implement | Editable PPTX, claim provenance |
| B. Podcasts / audio lessons | Absent | Research → spec | No TTS flow exists |
| B. Educational video | Absent | Research → spec | Scene-based explainers |
| B. Study guides / summaries | Partial (Studio) | First-class artifact | Reuse grounding |
| B. Flashcards / quizzes | Implemented, gated | Unified creation entry; eligibility feedback | FSRS + BKT real |
| B. Diagrams / infographics | Canvas objects only | Semantic spec → artifact | No generator |
| B. Concept maps | Spatial mind map | Semantic graph with mastery | Two vocabularies never meet |
| B. Interactive materials | Force editor only | Per-object interactivity | Math steps, reactions open |
| C. Scientific Canvas | Deepest subsystem | Lewis flow, human descriptions, simulations | Differentiator |
| D. Course / document intelligence | Text-only | Visual extraction status + recovery | Scanned/visual material invisible |
| E. Knowledge graph / personalized learning | Mastery + FSRS; no semantic graph | Concept graph + recommendations | Coherence gap |

## Roadmap

Guiding principle from the competitive frame: **the Canvas is the lead, not just one surface among many.** Every wave-1 and later assignment must either deepen the Canvas/Tutor loop or feed it. Artifact generation, recommendations and document intelligence are judged by whether they return the student to grounded, manipulable work on their own material.

### Now — wave 1 (started 2026-11-23)

Priority is set by user impact, dependency on existing foundations, and independent file scope.

1. **Recommendations and "what next"** (Critical). Define one contract from concept mastery, FSRS due state, attempts, and canvas issues to a suggested activity with a source and reason. Surface it in progress and the lesson home, routing into existing Study, Canvas, and Studio actions. Owner: worker `work/recommendations-20261123`.
2. **Human-level Tutor descriptions of canvas work** (Major, differentiator). Replace geometry/UUID dumps with named objects and human relations, keeping raw metadata inside the tool layer. Owner: worker `work/tutor-canvas-description-20261123`.
3. **Artifact Intelligence Phase 1** (Major, foundation for all content creation). Make `artifact.kind` determine compiled objects, fix problem-set duplication, generate real graphs/vectors, add deterministic validation. Follow `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md` Phase 1 exactly. Owner: worker `work/artifact-intelligence-phase1-20261123`.
4. **Artifact breadth gap analysis and spec** (undocumented vision). Investigate podcast/audio, video, study guides, infographics, interactive materials, and voice tutoring; reuse existing research; produce a phased spec with a shared course-context/citation contract so artifacts are not isolated generators. Owner: worker `work/artifact-broadening-20261123`. Read-only product work.

### Next — wave 2 (after wave 1 lands)

- Course/lesson creation dialog and navigation consolidation into one lesson workspace (Major UX; touches `src/App.tsx` heavily, so serial after wave 1's UI work).
- Lewis structure end-to-end repair and chemistry surface consolidation.
- Misconception → BKT loop and semantic concept graph with mastery overlay (depends on wave 1 recommendation contract).
- Visual/scanned document extraction status and recovery path.
- Slide-deck spike (Presenton) if the artifact-broadening spec endorses it.

### Later

- Cross-course review queue and portable course export/import.
- Per-node artifact editing, simulations, voice tutoring, learning plans.
- Hosted services only with explicit approval; BYOK/local-first stays the architecture.

## Integration rules (binding)

- One worktree and one branch per worker; never a shared checkout. Main has uncommitted verify work from a separate session — do not touch it.
- Workers are native thread agents only. No subagents of any kind, and no Groq-hosted models anywhere in the worker tree. A worker that needs parallel help reports to the coordinator instead.
- Unique port quad per worktree (see each worker prompt); stagger full Playwright and benchmark runs to avoid shared provider budget flakes.
- No paid services or API costs without approval. Local Ollama / deterministic mocks are the default.
- No `@ts-ignore`, `as any`, or weakened assertions. UI changes need Playwright DOM assertions.
- No new authoring authority: extend `author_board` and `src/artifacts/`, never a second path.
- Quote `npm run verify` output in every handoff. Canvas prompt/model/provider changes additionally require `benchmark:canvas` four gate numbers.
- Review every diff before merging; a worker's completion claim is not verification.

## Active workers

Tracked in the channel; this table is updated when work lands.

| Worker | Worktree | Scope | Status |
| --- | --- | --- | --- |
| Recommendations + next best action | `work/recommendations-20261123` | `server/progress.ts` or new `server/recommendations.ts`, progress UI, lesson home | Starting |
| Tutor canvas description | `work/tutor-canvas-description-20261123` | `server/tutor-canvas-context.ts`, `server/agent.ts`, tutor presentation | Starting |
| Artifact Intelligence Phase 1 | `work/artifact-intelligence-phase1-20261123` | `src/canvas/ai/teaching-scene.ts`, tests, per plan | Starting |
| Artifact breadth research | `work/artifact-broadening-20261123` | Product spec in `docs/superpowers/specs/` | Starting |

## Decisions requiring the partner

**Resolved 2026-11-23 — recommendations UX:** the primary Continue action prepares the target state (board or study session with the next exercise or material already loaded), with a short preview line stating what will be prepared. It is not a bare navigation link. The existing ranked list stays as secondary suggestions; progress numbers and weak-concept / due-review links stay. Hierarchy changes only, no functionality removed.

None open yet. A decision will be raised when the artifact-broadening spec needs a choice between self-hosted rendering engines or when a new provider would introduce cost.

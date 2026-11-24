# StudyAI product roadmap — coordinator's ground truth

Date: 2026-11-23. Owner: channel coordinator. Authority for this document: the partner's 2026-11-15 coordinator brief (full product vision in Section 2) plus `docs/VISION.md`, `docs/STATUS.md`, `docs/next.md`, and `docs/usability-vs-product-vision.md`.

This is the living coordination document. `docs/next.md` remains the authority for *canvas/author_board* sequencing; this page adds the full product view the partner asked for, including capabilities not yet specified in the repo.

## North star

One intelligent workspace where a student imports course material, learns from grounded tutoring, constructs and manipulates scientific representations on the Canvas, generates and edits educational artifacts, practices adaptively, and sees a clear next step. The Scientific Canvas is the differentiator; everything else must connect to it and to the learner's state.

**Standing grounding principle (partner, 2026-11-23):** most of the experience is driven by the LLM, and 99.9% of it must be based on the student's own course material. Interpreted as a binding product rule: the LLM composes, explains and tutors, but student-facing claims, artifacts, questions and canvas interpretations must trace to retrieved course evidence; model knowledge is allowed only when explicitly labelled as general knowledge; deterministic scientific tools remain the authority for calculations; when relevant evidence is missing, the product says so instead of inventing it. The 99.9% is an aspiration for grounding coverage, not a claim that UI copy or math evaluation comes from a PDF.

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
| A. Personalized plans and recommendations | Coach shipped: one ranked prompt, prepared targets, truthful Continue, course-change clearing and active provider display | Daily plans and richer mastery labels | Original Critical gap now has a working, honest surface |
| B. Presentations / slides | Implemented: Presenton renderer, artifacts page, editable PPTX, cited decks, human slide titles; export needs a running Presenton service | Service smoke test and export gate | No longer a design draft |
| B. Podcasts / audio lessons | Canvas narration shipped: grounded walkthrough of the student's board with browser speech and synchronized highlight | Reasoned generator vs deterministic readout | Distinctive first audio experience; generic podcasts still deferred |
| B. Educational video | Absent | Research → spec | Scene-based explainers |
| B. Study guides / summaries | Partial (Studio) | First-class artifact | Reuse grounding |
| B. Flashcards / quizzes | Implemented, gated | Unified creation entry; eligibility feedback | FSRS + BKT real |
| B. Diagrams / infographics | Canvas objects only | Semantic spec → artifact | No generator |
| B. Concept maps | Spatial mind map plus first course-level semantic concept graph with BKT mastery and jump-to-practice | Relationship edges from stored learning events and truthful mastery labels | Knowledge and vocabulary are now connected |
| B. Interactive materials | Steppable worked examples shipped: replay, pause, step, manipulate, take over; force editor and math workspace | Deeper simulations and reaction semantics | Lecture artifacts are now interactive, not static |
| C. Scientific Canvas | Deepest subsystem | Lewis flow, human descriptions, simulations | Differentiator |
| D. Course / document intelligence | Text-only | Visual extraction status + recovery | Scanned/visual material invisible |
| E. Knowledge graph / personalized learning | Mastery, FSRS, a first semantic concept graph and a Coach prompt stream | Daily plans and richer mastery labels | Coherence gap narrowing |

## Roadmap

Guiding principle from the competitive frame: **the Canvas is the lead, not just one surface among many.** Every wave-1 and later assignment must either deepen the Canvas/Tutor loop or feed it. Artifact generation, recommendations and document intelligence are judged by whether they return the student to grounded, manipulable work on their own material.

### Now — wave 1 (started 2026-11-23)

Priority is set by user impact, dependency on existing foundations, and independent file scope.

1. **Recommendations and "what next"** (Critical). Define one contract from concept mastery, FSRS due state, attempts, and canvas issues to a suggested activity with a source and reason. Surface it in progress and the lesson home, routing into existing Study, Canvas, and Studio actions. Owner: worker `work/recommendations-20261123`.
2. **Human-level Tutor descriptions of canvas work** (Major, differentiator). Replace geometry/UUID dumps with named objects and human relations, keeping raw metadata inside the tool layer. Owner: worker `work/tutor-canvas-description-20261123`.
3. **Artifact Intelligence Phase 1** (Major, foundation for all content creation). Make `artifact.kind` determine compiled objects, fix problem-set duplication, generate real graphs/vectors, add deterministic validation. Follow `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md` Phase 1 exactly. Owner: worker `work/artifact-intelligence-phase1-20261123`.
4. **Artifact breadth gap analysis and spec** (undocumented vision). Investigate podcast/audio, video, study guides, infographics, interactive materials, and voice tutoring; reuse existing research; produce a phased spec with a shared course-context/citation contract so artifacts are not isolated generators. Owner: worker `work/artifact-broadening-20261123`. Read-only product work.

### Wave 2 selection (2026-11-23, after wave 1 lands)

Five product-invention specs are now written. Each reuses existing infrastructure; none proposes a second authority.

| Idea | Spec + plan | Reuse found | Wave 2 verdict |
| --- | --- | --- | --- |
| Re-draw practice | `2026-11-23-redraw-practice-{design.md,md}` | `server/learning/activities` (versioned specs, revision-bound idempotent attempts, checker registry, BKT events), `src/canvas/physics.ts` semantic grading, FSRS + `FlashcardReview`, `saveCanvasDocument` as sole write path | **Enter wave 2.** Strongest differentiator, smallest new surface: one semantic checker, additive spec metadata, one review log + two endpoints, UI. |
| Lab partner (opt-in coaching) | `2026-11-23-lab-partner-{design.md,md}` | Six `PhysicsIssueCode`s and `suggestedCorrections` in `src/canvas/physics.ts`; scene authority already emits `p:<code>:<target>` diagnostics; `ai-requests.ts` queue/timeouts/dedupe; existing physics alert in `CanvasStudio.tsx` | **Enter wave 2, deterministic Phase 1 only.** Tutor explanations are gated on the canvas-description fix landing. |
| Canvas narration | `2026-11-23-canvas-narration-{design.md,md}` | Tutor explanation path, human-readable canvas labels from the description work, object IDs for highlighting, artifact store, browser-native Web Speech `speechSynthesis` as a zero-cost first candidate | **Enter wave 2 as ADRs + contract phase only.** No provider commitment until persistence and TTS ADRs are approved. |
| Steppable artifacts | `2026-11-23-steppable-artifacts-{design.md,md}` | `worked-example.steps` already exists but is discarded by `deriveBrief`; `replayCanvasEvents` state shape; one transaction/undo/approval; `learning_activity_*` checkpoint storage; single provenance path | **Hold one wave.** Shares `src/artifacts/package.ts` and `teaching-scene.ts` with Artifact Intelligence Phase 2; sequence after Phase 2 to avoid conflicting writes. |
| Generic podcasts / video | `2026-11-23-artifact-breadth-design.md` | Shared `ArtifactPackage` contract; no TTS/STT infra in the repo | **Defer behind canvas narration.** Own-canvas narration is the sharper first audio experience; provider cost needs approval. |

Also entering wave 2 after wave 1 UI work: course/lesson creation dialog and navigation consolidation (touches `src/App.tsx` heavily). Still waiting: Lewis repair, misconception→BKT loop, visual document extraction, slide-deck spike.

**Partner decisions made by the coordinator (2026-11-23), recorded so workers do not re-litigate them:**

- Redraw: one unified per-concept FSRS schedule; freehand-only redraws not gradable in v1; learner self-rating after deterministic feedback; pinned saved board as the reference source; physics-rules debt deferred, use the `src/canvas/physics.ts` superset.
- Lab partner: Coach toggle in the canvas toolbar, default off; opt-in persisted per device, dismissed hints per board/code/target until revision changes; 800 ms debounce with a 2 s floor and a 10 s per-target cooldown; Phase 1 physics-only; Explain why posts one prepared question to the existing Tutor chat; explanations use the student's already-configured provider, no new cloud requirement; the canvas-description fix gates Phase 2; corrections stay editor-first through the existing approval path.

### Later

- Cross-course review queue and portable course export/import.
- Per-node artifact editing, simulations, voice tutoring, learning plans.
- **Voice/audio transcription candidate:** [FunASR](https://mcpmarket.com/server/funasr-1) (ModelScope, MIT, self-hostable, OpenAI-compatible API, 50+ languages, diarization, streaming). Investigate in the voice-tutoring phase, not now: it needs a reuse ADR, a local model/GPU footprint decision, and a transcript-as-course-source provenance contract before any UI work. No API key or paid service is approved. See also [Magic](https://github.com/21st-dev/magic-mcp) — UI component generation is not a theme authority and stays unused until a visual direction is chosen and `DESIGN.md` exists.
- Hosted services only with explicit approval; BYOK/local-first stays the architecture.

## Integration rules (binding)

- One worktree and one branch per worker; never a shared checkout. Main is clean; merge in the coordinator's order and re-verify after each merge.
- Workers are native thread agents only. No subagents of any kind, and no Groq-hosted models anywhere in the worker tree. A worker that needs parallel help reports to the coordinator instead.
- Unique port quad per worktree (see each worker prompt); stagger full Playwright and benchmark runs to avoid shared provider budget flakes.
- No paid services or API costs without approval. Local Ollama / deterministic mocks are the default.
- No `@ts-ignore`, `as any`, or weakened assertions. UI changes need Playwright DOM assertions.
- No new authoring authority: extend `author_board` and `src/artifacts/`, never a second path.
- Quote `npm run verify` output in every handoff. Canvas prompt/model/provider changes additionally require `benchmark:canvas` four gate numbers.
- Review every diff before merging; a worker's completion claim is not verification.

Overnight accessibility pass shipped: 2px focus rings, 44px hit targets, labelled dialogs with focus trap and restore, Escape dismissal across shells, hidden lesson controls removed from Tab order, tinted contrast text in both themes, and narration controls clear of the floating toolbar. `tests/e2e/a11y-polish.spec.ts` passes 5/5 on main. Remaining known limits: third-party CopilotKit buttons stay under 44px; nested dialog Tab order is untested.

## Active workers

Tracked in the channel; this table is updated when work lands.

| Worker | Worktree | Scope | Status |
| --- | --- | --- | --- |
| Recommendations + next best action | `work/recommendations-20261123` | Single prepared Continue action, secondary list kept; progress + lesson home | Running — UX decision sent |
| Tutor canvas description | `work/tutor-canvas-description-20261123` | `server/tutor-presentation.ts`, human labels for canvas refs | Running — unit tests green, e2e unblocked |
| Artifact Intelligence Phase 1 | `work/artifact-intelligence-phase1-20261123` | Verified existing five commits; no new code | Verified — tsc, 668 tests, e2e 3/3 |
| Artifact breadth research | `work/artifact-broadening-20261123` | Product spec in `docs/superpowers/specs/` | Delivered |
| Re-draw practice spec | `work/redraw-practice-20261123` | Spec + implementation plan | Delivered |
| Lab partner spec | `work/lab-partner-20261123` | Spec + implementation plan | Delivered |
| Steppable artifacts spec | `work/steppable-artifacts-20261123` | Spec + implementation plan | Delivered |
| Canvas narration spec | `work/canvas-narration-20261123` | Spec + implementation plan | Delivered |

## Decisions requiring the partner

**Resolved 2026-11-23 — recommendations UX:** the primary Continue action prepares the target state (board or study session with the next exercise or material already loaded), with a short preview line stating what will be prepared. It is not a bare navigation link. The existing ranked list stays as secondary suggestions; progress numbers and weak-concept / due-review links stay. Hierarchy changes only, no functionality removed.

**Resolved 2026-11-23 — paid credits are dormant, not abandoned.** No paid rail is exposed to users and no money moves. Keep the existing ledger, Stripe and gateway code intact and compilable; do not delete it and do not make architecture choices that prevent re-enabling it later. Hide or disable the credits provider option, checkout and wallet UI in the shipped experience; BYOK/local stays the only user-facing path. Before reactivation, the memo's gaps must be closed: 1:1 pricing loses money after Stripe, the free demo grant is below the reservation floor, refund/dispute events are unhandled, tax setup is inert, provider resale terms need counsel, and abuse controls are missing. No paid key, tax registration or legal spend is approved now. Revisit at the 60–90 day product review or when the partner explicitly reopens it.

**Resolved 2026-11-23 — provider and key management:** users must be able to add multiple providers, see connection status, pick models, and switch providers in-app. API keys are stored in the local app database through a loopback settings API, not in `.env` and not returned to the client after save (masked display only). `.env` remains a supported override for advanced/local setups. One resolution boundary injects stored keys into the existing provider modules; no scattered DB lookups.

**Resolved 2026-11-23 — one unified Coach (binding wave-2 requirement):** there is one Coach surface, not three attention surfaces. The recommendation Continue card, lab-partner hints, and due re-draw tasks are inputs to a single ranked prompt stream that emits at most one prompt at a time. The Coach follows the student across surfaces: a prompt carries a target, and activating it prepares the board, study session, or lesson state in the destination, then surfaces the Coach there. No separate hint card, next-action card, or due-task card may be built as a competing surface. Each owning feature keeps its deterministic logic and provenance; only the presentation and activation are unified.

**Coach module ownership (named by the coordinator):** `src/coach/contract.ts` owns the `CoachPrompt` and target types; `src/coach/service.ts` owns deterministic ranking and selection from registered `CoachProducer`s; `src/coach/useCoach.ts` owns React activation and the single surface. Features register producers and never own a card or call view setters for prompts. Ranking is urgency (FSRS due/overdue), then current-board context match, then staleness; lab-hint precedes recommendation on ties. A target carries `courseId`, `lessonId`, one of `boardId`/`activityId`/`cardId`, plus `conceptId` and a reason. Opt-in is one localStorage preference per device; dismissed hints are keyed by board revision. The canvas-description defect gates Coach explanations only once landed on `main`.

None open yet. A decision will be raised when the artifact-broadening spec needs a choice between self-hosted rendering engines or when a new provider would introduce cost.

# StudyAI — usability against the product vision

Read-only analysis of the `main` snapshot recorded in `docs/STATUS.md` (`4961dbb`, 2026-11-22) plus the 2026-11-23 lab-notebook canvas work. No code was changed and no tests were run. Claims cite source files and dated project docs; where the docs mark something as planned or failing, this report treats it as not delivered.

## Authoritative vision (quoted verbatim)

> StudyAI is an intelligent unified learning environment (BYOK, provider-independent) combining course/document management, grounded tutoring, flashcards, assessments, spaced repetition, knowledge graphs, study materials, progress tracking, personalized recommendations, and scientific tools; defining differentiator is the Scientific Canvas (interactive workspace for math/physics/chemistry/biology where the Tutor understands structure and meaning of student work and interacts with it); everything interconnected; ultimate goal is deeper understanding through reading, reasoning, constructing, experimenting, practising, and meaningful feedback.

The repo's own statement of intent is `docs/VISION.md`, especially §3 "The defining differentiator: The Scientific Canvas", §4 "The connection between everything", and §5 "The long-term vision". This report scores the shipped experience against both.

## Method

Heuristic evaluation (Nielsen's ten heuristics, named in words), cognitive walkthrough of the main lesson flows, and anti-pattern/task-success scanning. Findings are rated Critical (blocks a core task or causes harm), Major (significant friction or harm), Minor (recoverable degradation), or Cosmetic (polish). Every finding states what happens, why it matters, which heuristic it breaks, and the design change. Positive findings record what to protect.

## At a glance

| Part | Vision role | State | Strongest connection | Biggest gap |
| --- | --- | --- | --- | --- |
| Scientific Canvas | Defining differentiator | Implemented, deep | Revision-bound scene graph reaches the Tutor | Tutor describes drawn work poorly |
| Tutor | Grounded intelligence | Implemented | Course retrieval + citations + canvas tools | Can't see scanned PDFs or slide images |
| Course materials | Organize the whole workflow | Implemented | Every subsystem is course/lesson scoped | Add via `window.prompt`, no portability |
| Document intelligence | Lecture/document understanding | Text-only implemented | Citations feed Tutor, Studio, questions | Images, charts, scanned pages ignored |
| Knowledge graph | Interactive mind maps and graphs | Partial | Tutor-authored mind map via approval path | Spatial graph, not a semantic concept graph |
| Spaced repetition | Retention loop | Implemented (FSRS) | Studio practice imports into the card deck | No unified "make flashcards" entry point |
| Assessments | Automatic quizzes | Implemented, gated | Reviewed questions carry source excerpts | Generation requires manual review step |
| Flashcards | Generation and review | Implemented | Add-to-deck from Studio, then FSRS review | Two separate card/Question systems to learn |
| Progress | Mastery tracking | Implemented, shallow | BKT mastery + due-review counts | No misconception or canvas activity in progress |
| Recommendations | Personalized next steps | Missing | Lowest-mastery question selection only | No recommendation surface at all |
| Scientific tools | Math/physics/chem/bio | Implemented, uneven | Deterministic tools wired into the Tutor | Lewis flow fails; simulations absent |
| Artifacts | Construct, not just generate | `author_board` shipped; Intelligence planned | One approval transaction for generated boards | `artifact.kind` ignored; no real validator |

## What connects well (protect these)

- **One scope for everything.** Course and lesson IDs thread through the canvas, documents, Tutor retrieval, Studio, learning, and progress (`src/App.tsx`, `server/progress.ts`). This is the "one environment" promise delivered at the data layer.
- **Grounding is enforced, not decorative.** Tutor retrieval is course-scoped, citations open source pages, questions require excerpts that occur in indexed chunks, and Studio rewrites every citation from its own source map (`docs/DOCUMENT_INTELLIGENCE.md`, `server/studio/service.ts:62-88`).
- **AI edits are proposals, not actions.** Canvas model interpretations stay distinct from observations, and edits require explicit apply (`docs/design.md:5-6`, `docs/ARCHITECTURE.md:36`).
- **The learning loop actually closes.** Question attempt → BKT update → FSRS card → rating → due date → progress count, with idempotency keys and resume state (`docs/ADAPTIVE_LEARNING.md`, `server/progress.ts`).
- **Deterministic scientific authority exists.** Expression evaluation, formal charge, vectors, and molecule validation run through bounded tools rather than model prose (`server/science-tools.ts`).

---

## Part-by-part mapping

### 1. Scientific Canvas

**Vision role.** The differentiator: an intelligent workspace that understands the structure and meaning of student work, lets the Tutor interact with that work, and turns static constructions into manipulable or simulated experiences (`docs/VISION.md:41-71`).

**What exists.** Quickdraw ink plus 15 structured scientific object kinds in `src/canvas/model.ts:34-49` (atom, bond, molecule, equation, vector, force, measurement, graph, anatomy, concept, relationship, linked-note, linked-document, question, flashcard, mindmap). Persistence is revision-bound; a derived spatial scene graph exposes nearby/overlapping relations and text search through `get_canvas_scene` and `search_canvas_evidence` (`docs/ARCHITECTURE.md:34-38`). Canvas analysis, math OCR, physics/FBD rule diagnostics, a lab-notebook visual skin, and `author_board` practice generation are shipped (`docs/STATUS.md:10-17`).

**Connects well.** Boards are course/lesson scoped; linked-note and linked-document objects sit on the board; the scene graph feeds the Tutor and Studio grounding; `author_board` writes citation-contained content through the same one-revision, one-undo, one-approval path. This is the strongest realization of the vision.

**Disconnected or missing.**
- The scene graph is **spatial** (nearby, overlapping), not a semantic concept graph; "understands relationships between objects" is limited to geometry and labels.
- "Convert diagrams into more interactive or simulated experiences" is only partly met: a force editor exists, but math-workspace step interactivity and reaction-arrow semantics remain open (`docs/next.md:35`).
- `author_board` ignores `artifact.kind`; all five kinds compile to questions plus an optional figure, `graph` becomes an equation and `vector` a hardcoded `[1,0,0]`; no deterministic validator is wired in (`docs/next.md:18`).
- Generated artifacts are whole-object only; per-node editing is not implemented (`docs/STATUS.md:32`).

**Concrete usability gaps.**

- **Major — The Tutor reports geometry instead of describing the student's work**
  - **What happens:** Canvas context keeps raw IDs, positions, bounds, geometry and stroke summaries (`server/tutor-canvas-context.ts:3-39`); the project records responses that dump component arrays and `referenced canvas item-<uuid>` placeholders (`docs/next.md:8`).
  - **Why it matters:** A student who asked "is my free-body diagram right?" gets a machine description they must mentally translate back into their drawing — the opposite of "understands what I drew."
  - **Breaks:** match between system and real world; recognition rather than recall.
  - **Change:** Render the Tutor's canvas description as named objects and human relations ("the normal force points off the plane"), with source links, keeping raw geometry only inside the tool layer.

- **Major — Lewis structure construction does not work well enough**
  - **What happens:** The lab-notebook sidebar and radial actions shipped, but the project explicitly marks the overall Lewis flow as a fail and open work (`docs/next.md:5-7`).
  - **Why it matters:** Chemistry is named in the vision; a student chasing formal charges cannot complete the core task.
  - **Breaks:** task completion (the flow breaks at the construction step).
  - **Change:** Treat Lewis as an end-to-end task — build, validate, correct, persist — and verify it in the browser before exposing the UI as finished.

- **Major — Deep analysis has no visible progress and misses its own target**
  - **What happens:** Deep canvas analysis p95 is 15.3–17.8 s against a 15 s target, bounded by external providers (`docs/STATUS.md:29`). "Analyze board" becomes enabled only after a save (`docs/design.md:12`).
  - **Why it matters:** A long silent wait after a deliberate click makes students click again or assume it failed.
  - **Breaks:** visibility of system status.
  - **Change:** Show staged status near the board (capturing → reading → interpreting → ready) and keep it until the result or a recoverable partial result appears.

- **Minor — Generated content cannot be edited piece by piece**
  - **What happens:** `author_board` applies whole objects in one transaction; per-node editing is unavailable (`docs/STATUS.md:32`).
  - **Why it matters:** A student who wants to change one label in a generated mind map must redo the whole artifact.
  - **Breaks:** user control and freedom.
  - **Change:** Let a generated object be decomposed into editable parts while keeping the single-approval provenance boundary.

- **Cosmetic — Anatomy is a label, not an anatomical view**
  - **What happens:** Anatomy objects are an editable identifier and label with no new viewer (`docs/CANVAS_INTERACTION.md:43`).
  - **Why it matters:** The biology promise reads as a text stub next to rich chemistry and physics tools.
  - **Breaks:** match between system and real world.
  - **Change:** Either add a minimal labelled diagram surface or name the object honestly as an "anatomy note."

---

### 2. Tutor

**Vision role.** Grounded tutoring that understands the current work, answers from course materials, explains mistakes, and generates practice without the student re-explaining context (`docs/VISION.md:53-56, 81-84`).

**What exists.** LangGraphJS tutor behind CopilotKit (`src/App.tsx:391`), BYOK provider chain with Groq/Ollama and bounded context and requests (`docs/ARCHITECTURE.md:14-24`), course-scoped retrieval with openable citations, science and canvas tools, tool routing by query (`server/tutor-retrieval-policy.ts`), optional Google Fact Check, and a visible "AI can make mistakes" disclaimer.

**Connects well.** Course excerpts are distinguished from general knowledge in the response UI; cited pages open; canvas tools (scene, evidence, proposals, authoring) are available to the same conversation; uncertainty survives into the response.

**Disconnected or missing.**
- Retrieval is lexical FTS5 only — no embeddings or reranking (`docs/DOCUMENT_INTELLIGENCE.md:16`); embeddings are deliberately gated off (`docs/next.md:35`).
- Scanned PDFs, embedded images, charts and slide visuals are not extracted (`docs/ARCHITECTURE.md:30`), so a large part of lecture material is invisible to the Tutor.
- Canvas descriptions remain poor (see §1).
- Canvas mistakes do not update mastery: the misconception→BKT loop is explicitly open (`docs/next.md:35`, Phase 4.2).

**Concrete usability gaps.**

- **Major — The Tutor silently cannot see visual course material**
  - **What happens:** A lecture slide that is mostly a diagram contributes no text; the Tutor answers from what it can index, with no visible statement that the slide's image was skipped (`docs/DOCUMENT_INTELLIGENCE.md:12`).
  - **Why it matters:** The student believes the answer is grounded in the lecture when a key figure was never available — a false sense of grounding.
  - **Breaks:** visibility of system status; match between system and real world.
  - **Change:** Mark image-heavy and scanned sources as "not searchable" in the library and in retrieval results, and offer canvas OCR or manual description as the recovery path.

- **Minor — AI uncertainty is visible but not actionable**
  - **What happens:** Design requires observations and interpretations to be distinguished (`docs/design.md:6`), and facts are "evidence to review, not proof" (`docs/STATUS.md:26`), but there is no one-tap path from a doubtful claim to correct the board or add a reviewed question.
  - **Why it matters:** Students see a caveat and still have to work out what to do with it.
  - **Breaks:** help users recognize, diagnose and recover from errors.
  - **Change:** Pair each uncertain claim with a concrete next action: open source, propose a canvas correction, or register as a practice item.

---

### 3. Course materials

**Vision role.** One place to organize the entire learning workflow, without switching apps (`docs/VISION.md:13-15`).

**What exists.** Local-first courses, lessons, notes and documents in SQLite; a course tree in the sidebar with add-course and add-lesson actions; lesson-header and view switching (`src/App.tsx:355-379`). Everything downstream is scoped to the selected course and lesson.

**Connects well.** Course/lesson is the backbone for canvas boards, document retrieval, Studio grounding, question sources, progress and recommendations-by-mastery.

**Disconnected or missing.**
- No course export/import or portable package; data lives in one local database (`docs/ARCHITECTURE.md:12`).
- No cross-course concept linking, despite a concept table existing in the learning subsystem.
- No multi-user auth by design (`docs/ARCHITECTURE.md:26`) — acceptable for BYOK/local-first, but it bounds the vision's "central environment" to one machine.

**Concrete usability gaps.**

- **Major — Creating a course or lesson uses a bare browser prompt**
  - **What happens:** `addCourse` and `addLesson` call `window.prompt("Course name")` / `window.prompt("Lesson name")` and surface failures only in small sidebar text (`src/App.tsx:292-318`).
  - **Why it matters:** The first action a new student takes looks like a system dialog, not part of the product, and offers no validation or cancellation feedback in the app's own language.
  - **Breaks:** match between system and real world; error prevention.
  - **Change:** Replace prompts with an in-app create dialog that validates the name, shows success, and places the new item in the tree.

- **Minor — Three overlapping shells compete for the same lesson**
  - **What happens:** The top bar offers Studio, Study, Cards; the toolbar offers Activities, Notes, Chemistry; the sidebar offers Learning progress; and "Study this lesson" opens a fourth panel (`src/App.tsx:370-379`).
  - **Why it matters:** Students must learn which shell holds notes, which holds quizzes, and which holds the graph — fragmenting the "one environment" story at the navigation layer even though the data is connected.
  - **Breaks:** recognition rather than recall; aesthetic and minimalist design.
  - **Change:** Consolidate entry points around the lesson, with one labeled workspace plus task-oriented actions, and retire duplicate buttons.

---

### 4. Document intelligence

**Vision role.** Document and lecture understanding that grounds the Tutor and produces traceable citations (`docs/VISION.md:25, 81`; `docs/DOCUMENT_INTELLIGENCE.md`).

**What exists.** PDF (per page), DOCX (paragraphs), PPTX (slides), UTF-8 TXT; bounded imports (20 files, 50 MB batch, 20 MB file); FTS5 lexical search; a PDF viewer; source references with page/slide (`docs/DOCUMENT_INTELLIGENCE.md:5-27`).

**Connects well.** Retrieval feeds the Tutor; Studio requires `studyai://` refs; reviewed questions must quote an indexed excerpt; citations open the source. This is a genuine grounding spine.

**Disconnected or missing.** No OCR for scanned PDFs; no embedded images, visual meaning or presentation notes; no embeddings or reranking (`docs/ARCHITECTURE.md:30`, `docs/DOCUMENT_INTELLIGENCE.md:12,16`).

**Concrete usability gaps.**

- **Major — "Understanding" is text extraction, and the UI does not say so**
  - **What happens:** A diagram-heavy PPTX imports "successfully" but only its slide text is indexed; there is no per-item indication of what was extracted.
  - **Why it matters:** The student grounds a question in a figure the system never read, which is a correctness risk disguised as success.
  - **Breaks:** visibility of system status; match between system and real world.
  - **Change:** Show an extraction summary per document (pages read, images skipped, scanned pages detected) with a clear recovery action.

- **Minor — Limits are discovered after the fact**
  - **What happens:** File-size and batch limits live in the API/docs (`docs/DOCUMENT_INTELLIGENCE.md:12`), not in the import UI before selection.
  - **Why it matters:** A rejected batch wastes time and produces an error instead of preventing it.
  - **Breaks:** error prevention.
  - **Change:** State the limits next to the import control and validate the selection before upload.

- **Minor — A fresh database has no document tables until the data API runs**
  - **What happens:** `di_*` tables are created when the data API starts; a database that has not run it lacks them (`docs/DOCUMENT_INTELLIGENCE.md:16`).
  - **Why it matters:** First-run failure reads as a broken feature rather than an initialization step.
  - **Breaks:** help users recognize, diagnose and recover from errors.
  - **Change:** Detect missing tables and show a single "initialize local study data" action with a plain explanation.

---

### 5. Knowledge graph

**Vision role.** Interactive mind maps and knowledge graphs, connected to the canvas, Tutor and learning system (`docs/VISION.md:28, 79`).

**What exists.** A `mindmap` scientific object with ≤12 nodes and ≤16 edges, authorable by the Tutor through the approval-gated proposal path (`docs/STATUS.md:14`); a Studio mind-map artifact whose nodes can cite course sources or canvas scene refs (`src/studio/MindMapView.tsx`); `concept` and `relationship` canvas objects; a spatial scene graph (`docs/ARCHITECTURE.md:38`).

**Connects well.** Canvas concepts feed Studio grounding; mind-map nodes can open their cited source; the Tutor can author a mind map with the same review rules as any other board edit.

**Disconnected or missing.**
- The graph is **per-board and spatial**; there is no persistent semantic concept graph across lessons or the course.
- Learning concepts live in `learning_concepts` and mastery evidence, but are not rendered as graph nodes or linked to mind-map nodes.
- Per-node editing of mind-map artifacts is open (`docs/STATUS.md:32`).
- No graph interactions such as expanding prerequisites, filtering by mastery, or jumping from a node to practice.

**Concrete usability gaps.**

- **Major — A mind map is a picture, not an explorable knowledge graph**
  - **What happens:** The Studio mind map renders nodes and edges with source chips (`src/studio/MindMapView.tsx`), but nodes are an artifact's static content; there is no traversal, mastery overlay, or cross-lesson linking.
  - **Why it matters:** The vision promises an interactive graph that helps students see how ideas connect; the current object can only be read or moved as a whole.
  - **Breaks:** match between system and real world; user control and freedom.
  - **Change:** Promote concepts to first-class nodes with stable IDs, then let a student expand neighbors, see mastery, and open or practice a node.

- **Minor — Concepts in learning and concepts on the canvas are separate vocabularies**
  - **What happens:** `conceptId` is optional on canvas `concept`/`question`/`flashcard` objects (`src/canvas/model.ts:43,47,48`), while BKT mastery is keyed by `learning_concepts` (`server/progress.ts:25-31`).
  - **Why it matters:** A concept mastered in quizzes does not light up on the student's own map, so the two halves of the vision never meet.
  - **Breaks:** consistency and standards.
  - **Change:** Bind canvas and artifact concepts to the learning concept IDs and reflect mastery on the node.

---

### 6. Spaced repetition

**Vision role.** Flashcard generation and spaced repetition as part of the unified workflow (`docs/VISION.md:26`).

**What exists.** FSRS scheduling with fuzz disabled, rating `Again/Hard/Good/Easy`, `POST /api/study/reviews` and `/api/study/card-reviews`, due-card queries, idempotency keys, and resume state (`docs/ADAPTIVE_LEARNING.md:11-12`, `src/learning/FlashcardReview.tsx`).

**Connects well.** Studio practice can be imported by index into the real card deck and reviewed question table (`server/studio/service.ts:142-182`, `src/studio/PracticeView.tsx:22-38`), and due counts appear in progress (`server/progress.ts:33-43`). The loop from generated material to scheduled review is genuinely closed.

**Disconnected or missing.** No spacing across whole lessons or courses as a study plan; scheduling exists per card, but there is no "what should I review today across everything" surface beyond per-lesson due counts.

**Concrete usability gaps.**

- **Major — No single place to see and plan all due review**
  - **What happens:** Due cards are fetched per course/lesson (`src/learning/FlashcardReview.tsx:16`), and progress reports a course-wide count (`src/components/ProgressDialog.tsx:47`) that is not clickable into a review session.
  - **Why it matters:** A student with several courses cannot act on the due count they can see.
  - **Breaks:** recognition rather than recall; flexibility and efficiency of use.
  - **Change:** Make the due count a direct entry to a cross-course review queue, with lesson filters.

- **Minor — The rating step comes at different times in different panels**
  - **What happens:** `StudyPanel` rates after a question attempt (`src/learning/StudyPanel.tsx:52-56`); `FlashcardReview` rates after revealing a card; Studio import requires selecting card indices first.
  - **Why it matters:** The same FSRS action is reached through three different sequences, so students relearn the rhythm in each shell.
  - **Breaks:** consistency and standards.
  - **Change:** Use one review component and one rating interaction everywhere a card is scheduled.

---

### 7. Assessments

**Vision role.** Automatic quizzes and assessments, grounded in materials and feeding progress (`docs/VISION.md:27, 83`).

**What exists.** Reviewed questions registered via `POST /api/study/questions` with `reviewed: true`, course/lesson/document scope, quoted excerpt checks and versioning; `GET /api/study/ask` selects a due question from the lowest-mastery concept; deterministic grading with source evidence and BKT update in one transaction (`docs/ADAPTIVE_LEARNING.md:5-10`). Studio can generate quiz questions with citations and import them (`server/studio/service.ts:168-178`).

**Connects well.** Every question carries source evidence; attempts update mastery; answers stay behind a reveal pattern in generated boards (`docs/next.md:25`).

**Disconnected or missing.** Only single-choice reviewed questions are supported by the adaptive path; broader assessment types (short answer, multi-step, lab-style) rely on bounded activity checkers that may return unsupported (`docs/STATUS.md:28`). Canvas mistakes do not feed assessment selection yet (see §2).

**Concrete usability gaps.**

- **Major — Generating an assessable question requires a manual review gate the student must discover**
  - **What happens:** Studio practice questions are generated, then imported, but the adaptive path only accepts `reviewed: true` questions whose excerpt occurs in indexed chunks (`docs/ADAPTIVE_LEARNING.md:5`); the student is not guided through why a generated question might not qualify.
  - **Why it matters:** A promising auto-quiz feature quietly fails to enter the study loop, which reads as broken generation.
  - **Breaks:** visibility of system status; help users recognize, diagnose and recover from errors.
  - **Change:** Show import eligibility per generated item with a reason, and offer one-click "review and register" rather than a silent filter.

- **Minor — Lowest-mastery selection is invisible**
  - **What happens:** `GET /api/study/ask` chooses from the lowest-mastery concept (`docs/ADAPTIVE_LEARNING.md:9`), but the UI presents only "Ask a reviewed question" (`src/learning/StudyPanel.tsx:59`).
  - **Why it matters:** The personalization that exists is not legible, so it cannot build trust or guide attention.
  - **Breaks:** visibility of system status.
  - **Change:** Say why this question was chosen ("weakest concept: vectors") without exposing model internals.

---

### 8. Flashcards

**Vision role.** Flashcard generation and review inside the same environment (`docs/VISION.md:26`).

**What exists.** `flashcard` canvas objects (`src/canvas/model.ts:48`), Studio practice cards with mandatory source refs (`server/studio/service.ts:41-47`), import into FSRS cards (`server/studio/service.ts:158-166`), and a flip-and-rate review modal (`src/learning/FlashcardReview.tsx`).

**Connects well.** The path from grounded generation → add to study deck → spaced review is real and testable (`src/studio/PracticeView.tsx:37-38`). This is a concrete instance of the vision's interconnection.

**Disconnected or missing.** Canvas flashcard objects and learning cards are different representations; there is no documented path from a card drawn on the board into the review deck.

**Concrete usability gaps.**

- **Minor — There is no obvious "make flashcards from this lesson" entry point**
  - **What happens:** Cards are produced inside Studio → Practice → select indices → "Add to study deck" (`src/studio/PracticeView.tsx`), while the top bar's "Cards" button only opens review (`src/App.tsx:373`).
  - **Why it matters:** Students who want cards must discover Studio first; the feature exists but is hidden behind a different mental model.
  - **Breaks:** recognition rather than recall.
  - **Change:** Add a creation action next to review, defaulting to this lesson's sources and pointing at the same Studio generator.

- **Minor — A flashcard drawn on the canvas does not become a reviewable card**
  - **What happens:** `flashcard` is a canvas object shape with `front`/`back` and optional `conceptId` (`src/canvas/model.ts:48`), but review cards are registered through the learning service.
  - **Why it matters:** A student who authors cards while drawing reasonably expects them in the deck.
  - **Breaks:** consistency and standards.
  - **Change:** Offer "add to review deck" on a canvas flashcard object, using its concept ID and source link.

---

### 9. Progress

**Vision role.** Learning progress and mastery tracking that tells the student where they stand (`docs/VISION.md:30, 83`).

**What exists.** BKT mastery evidence, FSRS due counts, attempts and correct counts; a `Learning progress` modal with four headline stats and per-lesson mastery bars (`src/components/ProgressDialog.tsx:43-58`, `server/progress.ts`).

**Connects well.** Metrics come from real study attempts and local mastery records, not a mock; the modal states their provenance in plain language.

**Disconnected or missing.**
- No canvas activity in progress: object counts reach the Tutor context (`src/App.tsx:411`) but not progress.
- No misconception history or error taxonomy — the misconception→BKT loop is open (`docs/next.md:35`).
- Lesson mastery is an average of all concept evidence for the course, which blurs per-lesson meaning (`server/progress.ts:46-52`).

**Concrete usability gaps.**

- **Major — Progress cannot answer "what should I work on next?"**
  - **What happens:** The modal shows attempts, correct, mastered concepts and due reviews, plus per-lesson bars (`src/components/ProgressDialog.tsx`), but no weak concepts, no trend, and no action from any number.
  - **Why it matters:** A student sees a percentage without a next step, which fails the vision's "meaningful feedback" outcome.
  - **Breaks:** visibility of system status; recognition rather than recall.
  - **Change:** Add a short "next best actions" block — weakest concepts and due reviews — where each item opens the relevant study or canvas task.

- **Minor — "Concepts mastered" uses a bare 0.5 threshold with no explanation**
  - **What happens:** `conceptsMastered` counts mastery evidence above 0.5 (`server/progress.ts:55`).
  - **Why it matters:** A number that looks authoritative has an arbitrary meaning the student cannot interpret.
  - **Breaks:** match between system and real world.
  - **Change:** Define the threshold in visible copy and show mastery as a range with a short descriptor.

---

### 10. Recommendations

**Vision role.** Personalized learning recommendations, and mistakes informing future practice (`docs/VISION.md:31, 83`).

**What exists.** No recommendation surface was found. The closest mechanisms are lowest-mastery question selection (`docs/ADAPTIVE_LEARNING.md:9`), FSRS due ordering, and `recommendedToolsForQuery`, which is tool routing for the Tutor, not a learner recommendation (`server/tutor-retrieval-policy.ts:63`). "Recommendation" elsewhere refers to CLIP threshold calibration (`server/canvas-intelligence/recognition/calibration.ts`).

**Connects well.** The prerequisites exist: concept IDs, BKT mastery, FSRS due state, attempts, and canvas object types.

**Disconnected or missing.**
- No model or rule that turns mastery, errors and canvas work into a suggested next activity.
- No UI slot that presents a recommendation.
- The misconception→BKT loop that would make recommendations meaningful is open (`docs/next.md:35`).

**Concrete usability gaps.**

- **Critical — A named vision capability is entirely absent**
  - **What happens:** No file or endpoint implements personalized learner recommendations; the term in code refers to tool routing or model calibration, not study guidance.
  - **Why it matters:** One of the eleven capabilities in the stated goal is missing, and the "everything interconnected" claim loses its forward-looking half — nothing proposes the next reading, exercise or experiment.
  - **Breaks:** task completion for the "what next" goal; match between system and real world.
  - **Change:** Define one recommendation contract (concept state → suggested activity with a source and reason), surface it on the lesson home and in progress, and route into existing study/canvas/Studio actions.

- **Major — Canvas mistakes cannot influence future practice**
  - **What happens:** Physics diagnostics surface issues through scene evidence, but the documented misconception→BKT loop remains open (`docs/next.md:26,35`).
  - **Why it matters:** The differentiating promise that the Tutor's reading of student work improves later practice is not delivered.
  - **Breaks:** consistency and standards.
  - **Change:** Emit a structured misconception from canvas diagnostics and feed it into concept mastery and question selection.

---

### 11. Scientific tools

**Vision role.** Scientific and mathematical tools across math, physics, chemistry and biology, including interactive simulation where appropriate (`docs/VISION.md:32, 50-58, 71`).

**What exists.** Deterministic Tutor tools for expressions, formal charge, vectors, and OpenChemLib molecule validation (`server/science-tools.ts`); equation/graph objects with bounded Math.js evaluation and pointer tracing; physics/FBD rule diagnostics and a force editor (`docs/STATUS.md:15`); Lewis construction with bond orders and resonance (`docs/CANVAS_INTERACTION.md:23-30`); measurement, relationship, anatomy, and lab-notebook visual refinements (`docs/STATUS.md:17`).

**Connects well.** The same scientific objects are created by hand, inspected by the Tutor, validated by tools, and persisted with revision checks. Chemistry modal in the workspace toolbar gives direct access (`src/App.tsx:379`).

**Disconnected or missing.**
- Lewis flow fails end-to-end (`docs/next.md:7`).
- No simulations: diagrams stay diagrams; conversion to interactive/simulated experiences is aspirational.
- Math-workspace step interactivity and reaction-arrow semantics are open (`docs/next.md:35`).
- Duplicate physics rules exist in server and src, with cleanup debt (`docs/STATUS.md:31`).

**Concrete usability gaps.**

- **Major — The chemistry entry point does not match the chemistry workflow**
  - **What happens:** A "Chemistry" toolbar chip opens a science modal (`src/App.tsx:379,395`), while Lewis construction lives in a separate canvas sidebar/radial UI whose overall flow is recorded as failing (`docs/next.md:7`).
  - **Why it matters:** Students are sent to two different places for one subject and hit the known-broken one for structure work.
  - **Breaks:** consistency and standards; task completion.
  - **Change:** Make the canvas the single chemistry surface, with the modal reduced to a quick calculator, and fix the Lewis task before advertising it.

- **Minor — Scientific tools give no calibration or unit guidance**
  - **What happens:** New arrows are uncalibrated (one canvas unit = one component unit), no force unit is assigned automatically, and measurements use canvas units until calibrated (`docs/CANVAS_INTERACTION.md:14-16,37`).
  - **Why it matters:** A student can build a numerically plausible diagram whose numbers have no physical meaning, with only documentation to warn them.
  - **Breaks:** error prevention; match between system and real world.
  - **Change:** Prompt for units at creation time and label uncalibrated quantities visibly on the object.

---

### 12. Artifacts

**Vision role.** Students construct, manipulate and experiment on scientific representations; generated work becomes something they can act on, not a static answer (`docs/VISION.md:57-58, 96-100`).

**What exists.** A versioned `CanvasAnalysisResult` contract carries observations, OCR and interpretations with provenance and revision; `author_board` compiles one `ArtifactBrief` into a layout-planned, citation-contained board proposal applied in one transaction (`docs/STATUS.md:16`); `src/artifacts/*` provides package, provenance, validation and repair contracts; an Artifact Intelligence System that would add typed, deterministically validated, claim-grounded construction is **planned, nothing built** (`docs/STATUS.md:19-21`, `docs/next.md:10-18`).

**Connects well.** Provenance and approval boundaries are strong: generated objects are labelled `generated-unverified`, answers hide behind a reveal toggle, coordinates come from a layout solver, and stale proposals are rejected (`docs/STATUS.md:16`, `docs/ARCHITECTURE.md:36-38`).

**Disconnected or missing.**
- `artifact.kind` is ignored; `problem-set` repeats one prompt, `graph` compiles to an equation, `vector` to a hardcoded value, and no deterministic validator is wired in (`docs/next.md:18`).
- Per-node editing of generated artifacts is not implemented (`docs/STATUS.md:32`).
- The Artifact Intelligence System — the promised move from generation to construction — has no product code.

**Concrete usability gaps.**

- **Major — Generated artifacts do not deliver the kind the student asked for**
  - **What happens:** All five `artifact.kind` values compile to the same question-plus-figure shape; `graph` becomes an equation and `vector` a fixed vector (`docs/next.md:18`).
  - **Why it matters:** A request for "a graph of this function" returns something that is not a graph, which breaks trust in every generated artifact.
  - **Breaks:** match between system and real world; error prevention.
  - **Change:** Make `artifact.kind` drive both compilation and a deterministic validator, and refuse to propose an artifact that fails its kind's checks.

- **Minor — "Unverified" is a label with no verification workflow**
  - **What happens:** Generated objects carry `provenance.status = "generated-unverified"` and a reveal toggle (`docs/STATUS.md:16`).
  - **Why it matters:** Students cannot tell what to check, so the label becomes decoration rather than a path to confidence.
  - **Breaks:** help users recognize, diagnose and recover from errors.
  - **Change:** Attach a short verification checklist and a "mark as checked" action tied to the cited sources.

---

## Cross-cutting disconnections

1. **The interconnection is strong at the data layer and weak at the experience layer.** Course scope, citations and revision rules are shared, but students reach canvas, Tutor, Studio, Study and Cards through separate shells with overlapping buttons (`src/App.tsx:370-379`). The vision's "one intelligent environment" is not yet the felt experience.
2. **The differentiator is deeper than its surroundings.** Canvas intelligence is the most advanced subsystem; document understanding, recommendations and simulation are the least. A student can ask sophisticated questions about a drawn force diagram but cannot get a semantic concept graph or a suggested next exercise from the same system.
3. **Feedback is recorded, not returned.** Mistakes update BKT and FSRS, but the misconception→BKT loop is open, progress does not include canvas work, and no recommendation surface exists. "Meaningful feedback" is partially delivered as scores and citations, not as guidance.
4. **Two knowledge representations never meet.** The canvas scene graph is spatial; learning concepts are semantic. Without a bridge, "understands structure and meaning" stops at the board edge.
5. **Known failures are still exposed.** Lewis construction and robotic canvas descriptions are documented as open, yet both sit on primary paths (`docs/next.md:5-8`).

## Priority issues (ranked index)

1. **Critical** — Personalized recommendations are absent (§10).
2. **Major** — Tutor describes canvas work as geometry and UUIDs (§1, §2).
3. **Major** — Lewis structure flow fails (§1, §11).
4. **Major** — Canvas mistakes do not inform future practice (§2, §10, §9).
5. **Major** — Generated artifacts ignore `artifact.kind` (§12).
6. **Major** — Visual/scanned document content is silently unavailable (§2, §4).
7. **Major** — Progress cannot answer "what next?" (§9).
8. **Major** — Course and lesson creation use browser prompts (§3).
9. **Major** — Deep analysis lacks staged progress (§1).
10. **Minor/Medium** — Mind map is not an explorable graph; entry points overlap; due-review action is missing; units and calibration are unprompted (§5, §3, §6, §11).

## Positive findings (protect during redesign)

- **Revision discipline.** Stale analyses and proposals are rejected; edits require explicit approval; one transaction means one undo step and one review dialog (`docs/ARCHITECTURE.md:36-38`, `docs/STATUS.md:16`).
- **Grounding is enforced server-side.** Citations are rewritten from the server's own source map, so a model cannot invent a source (`server/studio/service.ts:62-88`).
- **Deterministic science over model guesswork.** Bounded Math.js, formal charge, and OpenChemLib validation give real verification inside an AI conversation (`server/science-tools.ts`).
- **A real retention loop.** FSRS scheduling, BKT mastery, idempotent attempts, and resumable state are implemented rather than mocked (`docs/ADAPTIVE_LEARNING.md`).
- **Honest limits are documented.** `STATUS.md` and `next.md` state latency, provider, and failure truths plainly — that honesty should carry into the product UI.

## Limits of this review

This is a static analysis of source and dated project docs; no live session, user testing, or quantitative task metrics were collected. It does not re-run the verification suite or validate the 2026-11-23 worktree changes beyond the files cited. Severity reflects the documented state of `4961dbb` plus the noted lab-notebook work, not a freshly measured build.

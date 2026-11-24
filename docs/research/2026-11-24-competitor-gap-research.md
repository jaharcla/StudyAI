# Competitor gap research

Date: 2026-11-24. Question: which capabilities do Gemini Notebook (formerly NotebookLM), StudyFetch, and Gauth offer that StudyAI does not, and which of those gaps should StudyAI close given its canvas-led differentiation?

Sources: official product pages, Google blogs (Oct 2025 – Oct 2026), DigitalOcean's NotebookLM guide, StudyFetch product pages and app-store listing, Gauth product/pricing/help pages plus third-party reviews (Scrutool, Litmus, 2026-10). StudyAI baseline taken from `docs/PRODUCT_ROADMAP.md` (vision coverage matrix) and `docs/STATUS.md`.

## 1. Competitor capability profiles

### Gemini Notebook (NotebookLM) — Google

Grounded RAG assistant over uploaded sources (PDF, Docs, Slides, URLs, YouTube, audio, images; up to 500k words / 200MB per source; 80+ languages). Studio outputs: Audio Overviews (Deep Dive / Brief / Critique / Debate, interactive mode to join the conversation), Video Overviews (Short ~60s with animations), Mind Maps, Reports (briefing doc, study guide, blog post, FAQ, timeline, custom), Flashcards, Quizzes (MCQ / short-answer / multi-select / fill-in-blank), Infographics, Slide Decks, Data Tables, Interactive Learning Overviews (weave summaries + studio outputs step by step). Learning Guide (Socratic, step-by-step). Voice: real-time conversation on mobile; audio recorder for lectures; photo capture of notes. Sharing/collaboration of notebooks. Deep Research / web source discovery. No canvas or structured scientific manipulation.

### StudyFetch

Upload-first suite over PDFs/slides/videos/YouTube/notes. Sparky AI tutor with persona switching (Socratic, Essay Coach, Visual Explainer), grounded answers, voice-to-voice tutoring, 24/7. Outputs: AI Notes (comprehensive/summarized, adjustable skill level, real chemistry structures), Flashcards (term/def, MCQ, fill-in-blank, audio, cloze; spaced repetition), Quizzes (5 formats, confidence tracking, missed-question return), Practice Tests, Study Guides, Cheat Sheets, Study Plans from syllabus + exam dates, Explainer Videos, Essay Grader (rubric), Tutor Me (Explore/Mastery modes, resume), Live Lecture recording + transcription + notes, Roleplay (interview/patient/customer scenarios), Arcade (gamified challenges), Plugins (custom tutor behavior), mobile apps, 20+ languages, progress/streaks/achievements.

### Gauth (ByteDance)

Scan-or-type homework solver across 30+ STEM subjects. Numbered step-by-step working with the rule/theorem named per step, LaTeX rendering, photo input (≤4.5MB), follow-up Q&A (paid), saved history, human tutors (tickets), AI voice + whiteboard Live Tutor, Academy mini-courses, essay writing. Monetization: 1 free question, then Plus ($11.99/mo). Strengths: speed, multi-subject, scan recognition. Weaknesses: accuracy at edges, hallucinated citations, no course grounding, no study loop.

## 2. Gap matrix (competitor feature → StudyAI status)

Status: **Have** (shipped), **Partial** (in progress / weaker), **Absent**.

| Feature | Competitor | StudyAI | Priority |
| --- | --- | --- | --- |
| Source-grounded Q&A with citations | NotebookLM, StudyFetch | Have (server-enforced citations) | — |
| Audio overview / narration | NotebookLM (4 formats + interactive), StudyFetch (explainer video) | Partial (canvas narration shipped; generic podcasts deferred) | Medium |
| Short video overview (~60s, animations) | NotebookLM | Absent | Low–Med |
| Interactive learning overview (weave summaries + studio outputs) | NotebookLM | Absent | Medium |
| Mind map | NotebookLM | Partial (spatial mind map + first semantic concept graph) | Medium |
| Reports (study guide, briefing, FAQ, timeline, custom) | NotebookLM | Partial (Studio artifact) | Medium |
| Flashcards (multi-format, spaced repetition) | StudyFetch, NotebookLM | Have (FSRS + BKT) | — |
| Quizzes (MCQ/short-answer/multi-select/fill-blank/free response) | NotebookLM, StudyFetch | Have (gated) | — |
| Infographics | NotebookLM | Absent (canvas objects only, no generator) | Medium |
| Slide decks (PPTX) | NotebookLM, StudyFetch (explainer) | Have (Presenton renderer + editable PPTX) | — |
| Data tables | NotebookLM | Absent | Low |
| Socratic / Learning Guide tutor | NotebookLM, StudyFetch (Socratic persona) | Have (tutor) | — |
| Voice tutoring (real-time conversation) | NotebookLM (mobile), StudyFetch (voice-to-voice), Gauth (voice+whiteboard) | Absent | High |
| Lecture recording / transcription → notes | StudyFetch | Absent | Medium |
| Essay grader / coach | StudyFetch (Essay Coach), Gauth (Academy/writing) | Absent | Medium |
| Study plan from syllabus + exam dates | StudyFetch | Partial (daily plans spec written) | High |
| Practice tests (exam-format) | StudyFetch | Partial (quizzes) | Medium |
| Roleplay / conversation practice | StudyFetch | Absent | Low |
| Gamification (streaks, achievements, arcade) | StudyFetch | Absent | Low |
| Tutor personality switching | StudyFetch | Absent | Low–Med |
| Mobile app | NotebookLM, StudyFetch, Gauth | Absent (web only) | Medium |
| Scan/photo homework solve (math/chem/physics) | Gauth | Absent (no image input; deterministic tools exist) | Medium |
| Step-by-step worked solution with rule names | Gauth | Partial (steppable worked examples) | Medium |
| Human tutors | Gauth | Absent | Low (cost) |
| Sharing / collaboration of notebooks | NotebookLM | Absent | Medium |
| Web / Deep Research source discovery | NotebookLM | Absent | Medium |
| Audio file ingestion | NotebookLM | Absent | Low–Med |
| YouTube URL ingestion | NotebookLM, StudyFetch | Absent | Medium |
| Google Drive / Docs / Slides import | NotebookLM | Absent (PDF/OCR only) | Low (local-first) |
| Photo capture of handwritten notes | NotebookLM | Absent (OCR regions exist) | Medium |
| Multi-language (80+) | NotebookLM, StudyFetch (20+) | Absent (English-focused) | Medium |
| Concept graph with mastery | StudyAI only (first semantic graph) | Have | — (wedge) |
| Interactive scientific canvas (15 kinds, physics diagnostics) | none | Have | — (wedge) |
| Deterministic scientific authority (Math.js, formal charge, vectors, OpenChemLib) | none | Have | — (wedge) |
| Reviewable AI proposals (apply/undo) | none | Have | — (wedge) |
| Local-first / BYOK | NotebookLM (hosted), StudyFetch (hosted) | Have | — (wedge) |
| Steppable worked examples (pause/step/manipulate/take over) | none | Have | — (wedge) |
| Canvas narration (grounded walkthrough) | none | Have | — (wedge) |

## 3. Top gaps to close (ranked, parity + wedge-aware)

1. **Voice tutoring (real-time conversation)** — High. Competitors all ship it; StudyAI has no TTS/STT learning flow. Candidate: browser Web Speech / speechSynthesis first (already used for canvas narration), then FunASR for transcription (noted in roadmap). Ties directly to "Tutor understands and manipulates canvas."

2. **Study plan from syllabus + exam dates** — High. StudyFetch's signature feature; StudyAI has a daily-plans spec but not implementation. Closes the Coach/recommendations loop.

3. **Infographics + interactive learning overview** — Medium. NotebookLM's differentiator for visual learners; StudyAI has canvas objects but no generator. Should be canvas-native (not a static image) to stay on wedge.

4. **Video overview (short, animated)** — Medium. NotebookLM's 60s Short Video Overview. StudyAI already has Remotion/Three.js video tooling in the repo (motion skills). Candidate for canvas-narration-driven video.

5. **YouTube URL + audio file ingestion** — Medium. Expands source types beyond PDF/text; cheap to add via existing document pipeline.

6. **Photo capture of handwritten notes / scan-and-solve** — Medium. NotebookLM and Gauth both do it; StudyAI has OCR regions. Extending to image-based problem solve (Gauth-style) is a real gap for STEM students.

7. **Sharing / collaboration of notebooks** — Medium. NotebookLM supports sharing; StudyAI is local-first, so this conflicts with principle 4. Propose: optional, explicit export/import (portable courses) already on the Later list, not live collab.

8. **Web / Deep Research source discovery** — Medium. NotebookLM can find sources. StudyAI is student-material-only (99.9% grounding). Intentionally out of scope unless labelled as general knowledge.

9. **Multi-language (80+)** — Medium. NotebookLM's reach; StudyAI is English-focused. Defer until core loop is solid.

10. **Mobile** — Medium. Competitors ship apps; StudyAI is desktop web. Responsive web first; native app is a later bet.

11. **Essay grader / coach** — Medium. StudyFetch ships it; StudyAI has no writing surface. Could be a Tutor persona (Essay Coach) with no new engine.

12. **Lecture recording → notes** — Medium. StudyFetch's live lecture feature; needs audio capture + transcription (FunASR).

## 4. Intentional non-gaps (do not chase)

- **Generic podcasts / audio lessons** — deferred behind canvas narration (roadmap decision); generic audio is not a wedge.
- **Human tutors** — cost model conflicts with local-first; keep AI-only.
- **Gamification (streaks/arcade)** — low leverage vs. canvas depth; skip unless retention data demands.
- **Tutor personality switching** — low; can be a single Tutor with mode (Socratic vs direct) rather than personas.
- **Roleplay** — low for core study loop.
- **Google Drive/Docs/Slides import** — conflicts with local-first; PDF/URL covers most cases.
- **Essay writing (Gauth Academy)** — academic-integrity risk; avoid "do the work" positioning.

## 5. Wedge summary (what StudyAI has that competitors don't)

No competitor ships a structured, manipulable scientific canvas with deterministic physics/chemistry authority, reviewable AI proposals, and a grounded retention loop (BKT+FSRS) tied to canvas constructions. NotebookLM is a document assistant; StudyFetch is a content converter + tutor; Gauth is a homework solver. StudyAI's defensible position is "the place where scientific thinking becomes visible and gradable." Parity work should feed that loop, not add disconnected features.

## 6. Recommended next moves

- Ship voice tutoring on top of existing canvas narration (browser speech first).
- Implement daily plans (spec already written) to close the study-plan gap.
- Add YouTube URL + audio file ingestion to the document pipeline.
- Build an infographic/interactive-overview artifact that is canvas-native, not a static image.
- Add an Essay Coach persona to the Tutor (no new engine).
- Defer mobile, collaboration, and generic podcasts until core loop metrics justify them.

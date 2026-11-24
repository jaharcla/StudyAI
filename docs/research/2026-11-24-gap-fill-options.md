# Gap fill options: which competitor gaps to close and in what order

Date: 2026-11-24. Follow-up to `docs/research/2026-11-24-competitor-gap-research.md`. That doc established the trust-and-friction failure modes; this doc turns the implication list into actionable, ranked options.

## Constraints (binding)

- Course-grounding rule: at least 99.9% of student-facing content traces to retrieved course material. No unlabelled generated claims.
- Local-first, BYOK. No hosted dependency for core study data. No billing/paywall without explicit approval.
- Canvas is the primary thinking surface; AI output is a proposal until applied.
- Deterministic tools (Math.js, KaTeX, formal charge, vector magnitude) stay authoritative; the model proposes, never computes.
- UI-visible features need a Playwright test asserting the DOM result.

## Ranking method

Each option scored on: (a) trust value to students, (b) fit with existing architecture, (c) effort, (d) risk of regressions. Options that conflict with local-first, BYOK, or the canvas wedge are excluded.

## Option A — Uncertainty signals (RECOMMENDED FIRST)

**What:** When the tutor or generator is unsure, say so. Label low-confidence outputs; refuse to fabricate when no course evidence exists.

**Current state:** Missing entirely. The course-grounding rule already requires "No course evidence" chips on canvas objects, but the tutor chat and artifact generators do not yet surface confidence or refusal.

**Why first:** Highest trust value per unit effort. Directly addresses Gauth's "silent wrong answers" and NotebookLM's trust breakage. Reinforces the wedge (groundedness) at near-zero risk.

**Effort:** Small. Add a confidence band to tutor responses and artifact generation; wire "I don't have course evidence for this" refusal path.

**Risk:** Low. No new data paths; presentation-only change like the grounding ADR.

## Option B — Voice tutoring (grounded)

**What:** Voice-to-voice tutoring that cites sources and refuses to fabricate. High-priority gap per competitor research; Gauth's voice tutor is popular but ungrounded.

**Current state:** Not started. Canvas narration exists (partial audio overview).

**Why second:** High demand (StudyFetch, Gauth, NotebookLM all ship voice). But must not ship without grounding — a voice tutor that fabricates is worse than none (Gauth's failure mode).

**Effort:** Medium-large. Needs STT + TTS pipeline, source-citation in voice output, refusal handling, and a benchmark gate for voice accuracy.

**Risk:** Medium. Voice hallucination is harder to catch than text. Requires eval harness before ship.

## Option C — Mobile responsiveness

**What:** Not a native app, but usable on a phone. Students study between classes.

**Current state:** Desktop-only web app. No responsive layout.

**Effort:** Medium. CSS/layout work across canvas, sidebar, tutor panel. Canvas interaction on touch is the hard part.

**Risk:** Medium. Canvas manipulation on small screens may be unusable; may need a read-only or simplified view.

## Option D — Study plan from syllabus

**What:** Generate a study plan from a syllabus or course outline, grounded in the student's material.

**Current state:** Partial spec exists (`docs/plans/` has no dedicated file; referenced in product vision as "Partial").

**Effort:** Medium. Needs syllabus parsing, plan generation, scheduling logic. Grounding is natural (plan items trace to course sources).

**Risk:** Low-medium. Plan quality depends on LLM; but plan is advisory, not authoritative.

## Option E — Audio/video overview (grounded)

**What:** Audio overview of course material, tied to the student's board. NotebookLM's Audio Overviews are loved; complaint is quality regression, not format.

**Current state:** Partial (canvas narration). Needs to be source-grounded and not theatrical.

**Effort:** Medium. Extend canvas narration to full-board overview; add grounding labels; avoid gimmick.

**Risk:** Low. Builds on existing narration pipeline.

## Option F — Mind map from course material

**What:** Auto-generate a mind map from the student's course library, grounded in sources.

**Current state:** Partial. Concept graph work exists (2026-11-24-concept-graph-brief.md).

**Effort:** Small-medium. Concept graph + rendering. Grounding is natural.

**Risk:** Low.

## Option G — Practice tests (grounded)

**What:** Generate practice tests from course material with answer keys and explanations.

**Current state:** Partial. Quiz generation exists; needs test-format output and grounding.

**Effort:** Small. Extend quiz generator to test format; cite sources per question.

**Risk:** Low.

## Option H — Step-by-step with rule names

**What:** Show solution steps with named rules/theorems, deterministic authority.

**Current state:** Partial (steppable). Needs rule-name integration and deterministic verification.

**Effort:** Medium. Needs rule registry + deterministic check.

**Risk:** Medium. Must not present LLM-generated steps as authoritative.

## Recommended execution order

1. **Option A** (uncertainty signals) — first, smallest, highest trust value.
2. **Option F** (mind map) — builds on concept graph work in progress; low effort, visible win.
3. **Option G** (practice tests) — extends existing quiz infra; low effort.
4. **Option E** (audio overview) — extends existing narration; low effort.
5. **Option D** (study plan) — needs spec work first.
6. **Option B** (voice tutoring) — needs eval harness first; highest effort but highest demand.
7. **Option C** (mobile) — needs design decisions on touch canvas.
8. **Option H** (step-by-step) — needs rule registry; medium effort.

## Excluded (conflicts with vision or constraints)

- Sharing/collab, web/deep research, YouTube ingestion, audio ingestion, multi-language, scan/photo solve, gamification, infographics, short video overview — these conflict with local-first, BYOK, canvas-first, or course-grounding. Revisit only if user demand is demonstrated.

## Next step

Start with Option A. It is the smallest change with the highest trust value and directly reinforces the course-grounding rule. No new data paths, no new dependencies, presentation-only.

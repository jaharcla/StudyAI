# One-drop start, progressive surfaces — design (2026-11-25)

## Intent and why

The user's direction: **"our app should feel as easy as these"** — three reference videos (Mindgrasp "Upload Anything. Learn Everything", NotebookLM in 13 minutes, StudyFetch Beginner's Guide) plus a fourth competitor, Thea.ai.

All four share one shape: **upload → instant grounded output → one obvious next step, with no setup and no decision fatigue.** Thea is the sharpest version: "In 10 seconds, you're actively studying", taken straight into Smart Study, which asks the student questions rather than handing them artifacts.

StudyAI today asks a student to create a course, create a lesson, add files, wait for indexing, then choose between Canvas, Study, Studio and Concepts, with an empty state at each step. The goal is to close that gap while keeping the Scientific Canvas and the Canvas-aware Tutor as the reason to stay.

The user confirmed the scope as **both**: the first minute must feel effortless, and the whole workspace must stay simple after the student goes deeper. They chose the **one-drop start, progressive surfaces** approach.

## Goals

1. A single drop zone creates the course, the lesson and the index from one student action, with visible progress and honest failure states.
2. The student lands directly in a grounded learning interaction on their own material, not a dashboard of generated artifacts that requires choosing.
3. Every surface after that has exactly one primary action, the same "ask your material" tutor drawer, and the same truthful loading / empty / error / retry states.
4. Canvas, Study, Studio and Concepts are revealed progressively as the student has something to do there, not offered as four simultaneous destinations.
5. Grounding is unchanged: at least 99.9% of student-facing substance comes from student-provided material; citations resolve to real source pages; unsupported questions abstain; nothing is fabricated.

## Non-goals

- No visual redesign of the token system. `DESIGN.md` stays the UI source of truth; this is a cohesion pass.
- No new dependency, paid service, API key, subscription or `.env` change. Local-first and BYOK stay.
- No change to provider or model routing, and no voice engine work in this change.
- No removal or dumbing-down of Canvas tools, deck/PPTX flow, or the Studio artifact routes.

## Anti-goals

- A guided tour over today's complex app. That is a tour, not a simple app, and does not meet "both".
- A Studio-first landing that makes Canvas opt-in. That removes the product's differentiator.
- A dashboard of auto-generated cards and quizzes that leaves the student to decide what to do next.
- Manufacturing a question, answer, citation or confidence number to make the flow feel instant.

## Constraints

- Cohesion, not redesign: reuse `DESIGN.md` tokens and existing components.
- TDD: every UI-visible change gets a Playwright DOM assertion and honest loading / empty / error / retry states. Never weaken a test.
- One worktree and branch per worker; no merges before `tsc -b`, Vitest and targeted Playwright pass.
- No subagents; native thread workers only. At most two workers plus the coordinator, one Playwright suite at a time, pause new work below 1 GB free RAM.
- Preserve all existing tests and features, including the uninterrupted J1–J7 journey proof.

## Approaches considered

**A — One-drop start, progressive surfaces (chosen).** Collapse intake into one drop, land directly in a grounded learning interaction, reveal later surfaces progressively. Matches all four references and keeps Canvas + Tutor central. Cost: touches intake, the landing, the top bar and the J1–J7 tests.

**B — Guided tour over the current app (rejected).** Fast, but complexity remains underneath; fails the "whole workspace stays simple" half.

**C — Studio-first (rejected).** Upload lands in auto-generated notes/cards/quiz and Canvas becomes opt-in; conflicts with the stated reason to stay.

Thea's addition did not change the choice. It sharpened goal 2: the post-upload landing must be an active interaction on the student's material, not a pile of outputs.

## The parts of the how that are decided

- **Intake.** One drop zone in the first-run surface accepts course files, creates the course and lesson, and indexes them in one action. Course and lesson naming should be inferred from the files with a single editable confirmation, never a multi-step wizard.
- **Landing.** After indexing, open the Tutor on the active lesson with one concrete, source-grounded starting question prepared from the indexed passages. The question is a suggestion the student sends; nothing is auto-generated as a fact or auto-sent as an answer. Fall back to an honest abstention when no supported question can be prepared.
- **Progressive reveal.** Keep the existing four top-bar destinations but de-emphasise Study, Studio and Concepts until there is a reviewed answer, an artifact or a concept to act on. Canvas is the home surface throughout.
- **Shared Tutor.** The right-hand tutor drawer stays mounted across surfaces, with the same lesson context, citation chips and failure/retry states. Canvas object context continues to flow into it.
- **Empty state.** The current "Select or create a course to create a canvas" / "Add a course to begin" empty states become the single drop zone. Course and lesson creation remain available in the sidebar for students who want them.
- **Evidence.** Keep the real KIN 120 and KIN 301 material flows intact; the existing 13-screenshot uninterrupted journey is the regression baseline and must still pass.

## What is left to the builder

- An implementation plan via `writing-plans`, split into the intake slice, the landing slice and the progressive-reveal slice, each with its own DOM assertion.
- Exact component boundaries and state ownership, to be decided from the code during planning.
- A measurement of the first-drop-to-first-answer time in the real browser, reported honestly rather than estimated.
- Final verification: `tsc -b`, Vitest, targeted Playwright, then the full `npm run verify` before any merge.

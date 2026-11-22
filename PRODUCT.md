# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students working through course material (lectures, slides, PDFs, worked problems) on a desktop web app. Their job is to understand a lesson by sketching and manipulating scientific objects on a canvas, then ask an AI tutor for explanations grounded in their own course sources.

*Inferred from app copy, demo data (`DEMO Motion` / `Vectors in equilibrium`), and the local-first architecture.*

## Product Purpose

StudyAI is a local-first study workspace that joins three things in one place: the student's course library, an interactive scientific canvas (math, chemistry, vectors, graphs, freehand), and a study tutor that answers with course excerpts and canvas context. Success means a student can move between reading, drawing, and asking without losing context, and can trust that AI suggestions are reviewable rather than silently applied.

## Positioning

The tutor distinguishes observations from model interpretations, cites the student's own pages and slides, and treats every canvas edit from AI as a reviewable proposal with an explicit Apply action. Work and model configuration stay local (local storage, Ollama models) rather than in a hosted service.

## Operating Context

Desktop web app with three views — Canvas, Lecture, Split. A course/lesson sidebar on the left, a canvas studio in the middle, and a tutor panel on the right. The canvas carries a tool palette, board selector, OCR/analyze/labels controls, and a Quickdraw dock. A document library handles PDFs and OCR. Dark mode is available. Local storage status and model availability are shown in the chrome.

## Capabilities and Constraints

- Every canvas mutation bumps `revision` and persists through `server/canvas-persistence`; `canvases.document` is never written directly.
- `CanvasDocument.version` changes only with a migration in `parseCanvasDocument` plus a test loading the previous shape.
- A new `ScientificObject` kind requires all six: model type, registry entry, validation rule, evidence mapping, e2e interaction test, benchmark fixture.
- OCR region caps, provider budgets, and recognition confidence thresholds may not be lowered without an ADR in `docs/decisions/`.
- Prompt/model/provider changes require `npm run benchmark:canvas` against the checked-in baseline.
- One authority per board interpretation: `server/canvas-intelligence/scene/` for whole-board work, `server/canvas-analysis/` for direct manipulation.
- Generated benchmark outputs are never committed.
- UI-visible features require a browser-level (Playwright) test asserting the DOM result. No `@ts-ignore` / `as any` to make types compile.
- Local-first: no hosted dependency for core study data.

## Brand Commitments

Product name is **studyai** (lowercase wordmark). No user-supplied visual constraints were given; the current interface was explicitly rejected as looking "vibecoded," which is a rejection of the incumbent look, not a commitment to a specific replacement.

## Evidence on Hand

- Demo course "DEMO Motion" with lesson "Vectors in equilibrium" and a saved "Demo board" (visible in the running app).
- `docs/DESIGN.md` — prior integration brief (functional Canvas/Tutor handoff), tied to an earlier task and explicitly superseded for this redesign.
- Captures under `.impeccable/review/` and `build-verification-*/`.

## Product Principles

1. The canvas is the primary thinking surface; reading and tutoring support it.
2. AI output is a proposal until the student applies it.
3. Answers are grounded in the student's own sources, with interpretations labelled.
4. Student data and model configuration stay local.
5. Changes to recognition or model behaviour are gated by benchmarks, not vibes.

## Accessibility & Inclusion

No product-specific accessibility requirement was confirmed. The repository's engineering rules require real DOM-level verification and prohibit type-suppression shortcuts.

> Note: this record was written from repository evidence and the user's explicit "go crazy, test all the possibilities" instruction to proceed without another interview. Product facts marked *inferred* above should be confirmed before they become binding.

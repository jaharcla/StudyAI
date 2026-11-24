# ADR: Startable, grounded practice from real course chunks

Date: 2026-11-24
Status: accepted
Branch: `work/fix-practice-flow-20261124`

## Context

In both real courses (`chem-120`, `kin-120`) `/api/study/ask` returned 404 because
no reviewed questions exist. The authoring form failed too: it read
`/api/documents`, which is backed by the `documents` table, but those courses
have their 821 indexed chunks in `di_documents`/`di_chunks`. The empty source id
surfaced as raw Zod JSON naming the hidden `sourceDocumentId` field. With no
question, grading, FSRS, mastery, progress, and Coach never ran.

## Decision

Reuse the existing `LearningService`, `createLearningHandler`, BKT and FSRS;
add no dependency and no model call.

1. Add a read-only, course-scoped indexed-source query to `server/learning/`
   that unions `document_chunks` and `di_chunks`, bounded to three excerpts per
   document and 60 excerpts total. Excerpts are exact slices of chunk text.
2. `/api/study/ask` stays 200 when there is no reviewed question: it returns the
   reason, one `nextAction`, and a suggested source from the course index.
   `/api/study/sources` exposes the same list for authoring.
3. The author form selects a source document and an exact excerpt from that
   list; the document id is derived from the visible selection, never a hidden
   field. Client validation plus a friendly server error prevent Zod JSON from
   reaching the student.
4. Zod failures are mapped to one plain-language sentence with human field
   labels. No paths, codes or internal names are returned.
5. Grading stays deterministic against `correct_choice`; mastery, FSRS cards and
   grading evidence are unchanged. Coach and Progress already project those
   tables, so no change to those subsystems is needed.

## Alternatives rejected

- Generating a reviewed question through Studio/artifact generation: those
  endpoints returned 502 in both real runs, and an unlabelled model question
  would breach the course-grounding rule.
- Auto-generating a cloze question locally: a third content authority and a
  new label to maintain; the brief allows a clear reason plus a working next
  action, which the excerpt picker provides.
- Reusing `/api/documents`: it cannot see `di_documents`, the real source of
  course text.

## Limits

- Chunks are course-scoped, not lesson-scoped; the UI names the course source
  it attaches rather than claiming a lesson-specific tie.
- The excerpt list is bounded and deterministic, not ranked by student need.
- No prompt, provider, canvas or artifact code is touched; no benchmark
  baseline update applies.

## Verification

`npm run verify` (tsc, Vitest, Playwright), a real-course loop script against a
copy of `data/studyai.sqlite`, and DOM/screenshot assertions in Playwright.
Provider-dependent failures, if any, are reported separately from local ones.

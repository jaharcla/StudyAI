# Local PPTX renderer replaces Presenton

Date: 2026-11-25

## Decision

Slide decks are exported by a deterministic local PPTX writer in `server/presentations/local-renderer.ts`. The app no longer calls Presenton for generation, inspection or download. Decks are also viewable in the app through a real presenter view (`src/studio/SlideDeckView.tsx`), not only as a static card grid.

## Reason

The user asked: "We shouldn't be reliant on presenton for presentations" and "Decks should also be viewable in site." The compiled deck is already course-grounded text produced by our own code; the external renderer was the only remaining service dependency and it also rephrased content and chose decorative imagery. Removing it keeps 99.9% of student-facing substance tied to student material and makes export work offline.

## What changed

- `renderLocalDeck` takes the compiled slide text and writes an OPC/PPTX package with `adm-zip` (already installed transitively; no new dependency). Slides are real editable text shapes, not full-slide images.
- `server/api.ts` wires the local renderer with `STUDYAI_ARTIFACTS_DIR`; there is no `PRESENTON_URL`, API key or inspection call.
- The existing extraction and validation path reads the generated PPTX back, so citation-containment checks still run on the delivered file.
- Degraded-path notices no longer tell the student to start a service; they say the `.pptx` could not be saved and to try again.
- The Studio deck detail keeps the slide grid and adds a **Present deck** button that opens the in-site presenter view with one slide at a time, arrow-key navigation, speaker notes and clickable citations.

## Constraints

- No new dependency, API key, paid service or `.env` change.
- No model call and no network call in the export path.
- Source labels come from `sourceLabel(ref)`; raw `studyai://` references never appear on a slide.

## Verification

- `tests/slide-deck-local-renderer.test.ts` proves the ZIP structure, real `<a:t>` text shapes, XML escaping and read-back through `extractDocument`.
- `tests/e2e/deck-local.spec.ts` proves the download link and the presenter view's navigation, notes, citations and close behavior.
- Existing deck unit and browser specs were updated only where they asserted Presenton-specific wording.

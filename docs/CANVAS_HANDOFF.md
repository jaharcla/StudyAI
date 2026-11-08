# Scientific Canvas Handoff

Historical branch handoff for `0ecf5033049ab2eeaaf827ff8a9c0c14cd9b7ed0`. Current integration contracts, verification, and remaining limitations are recorded in [INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md).

The subsequent direct-manipulation implementation and its verification are in [CANVAS_INTERACTION.md](CANVAS_INTERACTION.md); it supersedes this handoff's card interaction, equation and graph limitations.

## Implemented

- Quickdraw provides infinite pan/zoom, pen, shapes, arrows, text, selection, transforms, and drawing history.
- Canvas boards are separated by course and lesson, stored in SQLite, and can be added, switched, or deleted. Existing course drawings migrate into the first board.
- Scientific objects persist as structured JSON beside the Quickdraw snapshot. They can be moved, resized, edited, deleted, searched, undone, and redone.
- JSON canvas import/export and PNG export are available from the canvas toolbar.
- Lewis structures edit atoms, lone-pair electron counts, bond orders, formal charges, and resonance forms. OpenChemLib loads only when a structure is converted; the seed CO₂ structure converts to `O=C=O`.
- Vector/force magnitude, measurement, equation data, sampled `y = x²` graph data, anatomy identifiers, concepts, relationships, questions, flashcards, and linked note/document cards are represented as editable data.

## Libraries

- Quickdraw (`@quickdrawjs/react`) is the canvas input/rendering engine.
- OpenChemLib (`openchemlib`) converts structured molecular data and checks it through its molecule API.
- No package manifest or lockfile was changed. OpenChemLib is dynamically imported by the Lewis editor.
- tldraw was evaluated but not adopted. Its production SDK requires a license key; see [tldraw license](https://tldraw.dev/community/license).

## Verification

- `npm run build` — passed.
- `npm test` — 14 tests passed across 4 files.
- `npm run test:e2e -- tests/e2e/canvas.spec.ts` — passed: molecule conversion, save/reload, new board, and course separation.

## Integration files

- `src/canvas/` — canvas model, tool registry, editor UI, and chemistry adapter.
- `src/App.tsx`, `src/styles.css`, `src/overrides.css` — workspace wiring and styles.
- `server/api.ts`, `server/db.ts` — canvas/document listing endpoints and SQLite storage.
- `tests/canvas.test.ts`, `tests/db.test.ts`, `tests/e2e/canvas.spec.ts` — coverage.

## Incomplete

- The active lesson ID is currently `lesson-03`; connect the selector when lesson navigation is implemented.
- Equations are stored as editable expressions and variables but are not evaluated. Graph data currently samples only `y = x²`.
- Ketcher, MathLive, Mol*, Plotly, JSXGraph, XYFlow, Vanatome, and anatomy viewers are not integrated. Anatomy objects store identifiers and labels only.
- No AI canvas action adapter is connected. Freehand marks remain uninterpreted.
- Linked document cards use stored document metadata and course search; page-level citations are not rendered on the canvas.

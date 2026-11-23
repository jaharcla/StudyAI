# Lab-notebook canvas — verification (2026-11-23)

Branch `work/lab-notebook-canvas`, based on `main@9f3954a`. Design: `docs/superpowers/specs/2026-11-22-lab-notebook-canvas-design.md`; plan: `docs/superpowers/plans/2026-11-22-lab-notebook-canvas.md`.

## What shipped

1. `26d5109` — notebook paper tokens (warm dotted `.lab-paper` viewport + dark variant), transparent graph surface, borderless atom styling, Lewis/radial/editor CSS.
2. `bdd0cde` — Lewis second sidebar: single bond row expanding into literal line glyphs (1/1.5/2/3), scrollable element rows, CANVAS TOOLS panel grammar, testids `lewis-bond-row`, `lewis-bond-row-toggle`, `lewis-bond-*`, `lewis-element-row-*`, `lewis-inspect`, `lewis-finish`.
3. `15af88b` — icon-first radial actions in a 40px ring around a selected atom (lone pairs, element cycle, charge, remove, bond-from, bond order, resonance), all wired to existing molecule operations.
4. `ad25945` — notebook editor shell (`.canvas-object-editor.notebook-editor`) with every existing scientific field preserved.

## Unit + type checks

- `node node_modules/typescript/bin/tsc -b --pretty false` → exit 0.
- `node node_modules/vitest/vitest.mjs run` → **559 passed** (baseline 549 + 10 new: 3 visual tokens, 2 Lewis sidebar, 2 radial actions, 3 editor capability).
- Targeted runs during development: each new unit file RED→GREEN observed; Lewis sidebar, radial actions, notebook editor, lab-paper browser specs each passed individually on isolated ports (`WEB=5353 RUNTIME=8283 DATA=8284 AGENT=8203`, with `.env`'s `LANGGRAPH_DEPLOYMENT_URL` set to :8203).

## Full browser suite

- First full run after implementation: **41 passed / 9 failed / 3 skipped** — the new failures came from shared `tests/e2e/helpers.ts` still driving the removed molecule toolbar (`Placement element`, `Connect atoms`, `Place atoms`, `Remove lone pair`) and the sidebar covering the palette opener on repeat calls.
- Fixed in `f0b104b`: sidebar gained explicit Place/Connect buttons; helper and `direct-molecule.spec.ts` now use the sidebar's testids and radial lone-pair/bond-order actions; bond order applies to the selected bond or the selected atom's bond; radial group no longer duplicates `data-atom-id`.
- Second full run: **47 passed / 3 failed / 3 skipped** (`canvas-analysis:9`, `document-intelligence:5`, `integration:4`). Re-run alone: `canvas-analysis.spec.ts` **4/4 pass** (the full-run failure was a timing flake); the other two are the same live-tutor citation flakes already recorded on `main` (`document-intelligence` 5 s `Page 1 of 1`; `integration` 180 s citation). Final standing: **48/51 green, two pre-existing flakes**.
- All four new browser specs pass individually: `lab-notebook-visuals`, `lewis-sidebar`, `radial-atom-actions`, `notebook-editor`; the legacy `direct-molecule` spec also passes with the new sidebar.


## Merge seams (small, by design)

- `src/canvas/CanvasStudio.tsx`: one `lab-paper` viewport class + one `notebook-editor` editor class.
- `src/canvas/ScientificLayer.tsx`: render `{molecule.radial}` next to existing controls.
- `src/canvas/MoleculeInteraction.tsx`: replaced the old molecule toolbar JSX with `<LewisSidebar>` + radial callbacks; no mutation logic added.
- New files: `LewisSidebar.tsx`, `lewis-bonds.ts`, `RadialAtomActions.tsx`.
- `src/overrides.css`: appended tokens only (no existing rules rewritten except `.graph-surface` fill → transparent).

Nothing in `server/`, persistence, scene graph, provider config, or benchmark baselines changed.

## Known limits

- Mind map and non-molecule object editors keep their existing field sets; only the container skin changed. Inline chips are not yet implemented for graph/vector — the approved design's first pass lands the notebook language + Lewis flow; chips for other kinds are a follow-up.
- 1.5 bond order is rendered as a dotted `– · –` glyph; its physics semantics are unchanged from the existing model.
- `.env` in this worktree is an uncommitted local copy (never commit secrets).

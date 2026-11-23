# Design: lab-notebook scientific canvas (approved 2026-11-22)

## Intent

The visual layer of the scientific canvas should read as a student's lab notebook, not cards pasted on a whiteboard. Functionality stays unchanged where it already works (75–85% there); this change is about how objects are drawn, where controls appear, and how the Lewis construction tools are reached.

## Approved decisions (from the visual session)

- **Paper**: warm dotted notebook background for the canvas viewport; dark mode gets a dark-paper variant.
- **Graph**: transparent plot — axes in graphite, curve in green ink, no white rectangle. Selecting it reveals small scribble chips (expression, point readout, `edit…`); all existing graph fields remain behind `edit…`.
- **Molecule**: borderless ink atoms and bonds. The Lewis tool opens a **second left sidebar** using the exact CANVAS TOOLS panel grammar (white panel, 8px tracked header, × collapse, 21px icon chips, 10px DM Sans rows, `#f7f2ee` selected state). Its single top line expands into literal bond-order line glyphs (1/1.5/2/3); below it is a scrollable element list used to place atoms on paper.
- **Selected atom**: an icon-first radial menu in a tight ring around the atom (lone-pair +/−, element, charge, remove, bond-from, bond order, resonance). Chips/actions appear only for the selected object — never always-on.
- **Editors**: the full existing `ObjectEditor` field sets stay, restyled as a notebook page (paper tones, serif italic headings) instead of a generic modal. No capability is removed: molecule resonance/element/lone-pair/bond order/OpenChemLib, graph ranges, equation MathLive + parameters + verified steps + linked graph, measurement calibration, relationship endpoints, question/flashcard review actions, mind map.

## Non-goals

No changes to `CanvasDocument.version`, persistence, scene-graph authority, provider/budget config, or the benchmark baseline. No removal or rewriting of scientific field logic. No new dependencies.

## Constraints

One mutation authority (`server/canvas-persistence`), one scene authority, all UI changes need Playwright DOM assertions (`data-testid`), no `@ts-ignore`/`as any`, `tsc -b` + vitest green. Hot files (`CanvasStudio.tsx`, `SceneGlyph.tsx`, `overrides.css`) are being edited in other worktrees — keep seams small and mergeable.

## Approaches

- A: CSS-only skin — rejected: cannot deliver the Lewis sidebar/radial actions or transparent graph behavior.
- B: new focused components (`LewisSidebar`, `RadialActions`, notebook editor shell) + small seams in hot files + CSS tokens — **chosen**: keeps existing logic intact, small merge surface.
- C: rewrite `ObjectEditor` per-kind — rejected: loses capability and creates a large conflict surface.

## Builder scope (implemented as tasks in the plan)

1. Notebook tokens + transparent graph and molecule glyphs.
2. Lewis sidebar + bond row + element list (replacing the old top molecule toolbar only in the new panel; old toolbar still available as fallback? no — single path).
3. Radial actions for a selected atom, icon-first, wired to existing atom/bond operations.
4. Notebook editor shell (restyled container, all fields preserved) + regression tests for field presence.
5. Browser verification (DOM asserts) + merge-ready commit.

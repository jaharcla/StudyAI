# Lab-Notebook Scientific Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use executing-plans task-by-task. Steps use `- [ ]`.

**Goal:** reskin the scientific canvas as lab-notebook paper with transparent graph/molecule glyphs, a Lewis-specific second sidebar, icon-first radial atom actions, and notebook-styled editors that preserve every existing field.

**Architecture:** CSS tokens + small presentational components with narrow seams into the existing `CanvasStudio.tsx` / `MoleculeInteraction.tsx` / `SceneGlyph.tsx` logic. No schema/persistence changes.

**Tech Stack:** React 19.2.0, TypeScript 5.9.3, Vitest 3.2.7, Playwright 1.56.1, existing Quickdraw/editor APIs.

**Spec:** `docs/superpowers/specs/2026-11-22-lab-notebook-canvas-design.md`.

## Global Constraints

- No `CanvasDocument.version` change; no direct writes to `canvases.document`; no new dependency.
- No `@ts-ignore`/`as any`; DOM assertions with `data-testid` for every visible feature.
- Keep every existing scientific field/control reachable (molecule resonance, OpenChemLib, graph ranges, MathLive workspace, measurement calibration, etc.).
- Hot files stay mergeable: keep new UI in new files; seams in `CanvasStudio.tsx`/`MoleculeInteraction.tsx`/`SceneGlyph.tsx` only where needed.
- Run `node node_modules/typescript/bin/tsc -b` + `node node_modules/vitest/vitest.mjs run` before each commit; quote `npm run verify` output in the final handoff.

## Review Focus

1. Transparent graph default and dark mode contrast — pinned by CSS unit + browser DOM assertions.
2. Lewis sidebar grammar and bond-order glyphs (1/1.5/2/3) — pinned by component unit + browser test.
3. Radial atom actions proximity/icon-first and correct mutation wiring — pinned by unit tests on the operation callbacks + browser test.
4. No capability loss in editors — pinned by field-presence tests for molecule/graph/equation.
5. Parallel-agent merge seams — pinned by git diff showing small seams in hot files.

---

### Task 1: Notebook paper + transparent glyphs

**Files:** Modify `src/overrides.css`, `src/canvas/SceneGlyph.tsx`; Test `tests/lab-notebook-visuals.test.ts`, `tests/e2e/lab-notebook-visuals.spec.ts`.

- [ ] Step 1: write failing tests asserting `graph-surface` has no opaque fill in CSS text and `lab-paper` board class exists; plus CSS class presence for `radial-actions`, `lewis-sidebar`, `notebook-editor`. Run and observe failure.
- [ ] Step 2: add CSS tokens: `.canvas-viewport.lab-paper` warm dotted background, `.dark .canvas-viewport.lab-paper` dark variant, `.graph-surface{fill:transparent;stroke:...}`, `.scene-atom` borderless ink, `.radial-actions`, `.lewis-sidebar` matching palette grammar, `.notebook-editor` paper tones. Apply `lab-paper` class in CanvasStudio's viewport (one-line seam). Run tests + tsc.
- [ ] Step 3: commit.

### Task 2: Lewis sidebar and bond row

**Files:** Create `src/canvas/LewisSidebar.tsx`, `src/canvas/lewis-bonds.ts`; Modify `src/canvas/CanvasStudio.tsx` (render sidebar when molecule mode), `src/canvas/MoleculeInteraction.tsx` (hide old toolbar when sidebar active, keep callbacks); Test `tests/lewis-sidebar.test.tsx`, `tests/e2e/lewis-sidebar.spec.ts`.

- [ ] Step 1: failing tests for exported `bondOrderGlyph(order)` returning 1/2/3 lines and the 1.5 special glyph, and for the sidebar rendering the exact CANVAS TOOLS class names, header `LEWIS`, collapse button, `data-testid` on bond row and element rows. Observe failure.
- [ ] Step 2: implement `lewis-bonds.ts` + `LewisSidebar.tsx` with props `{ element, bondOrder, onElement, onBondOrder, onClose }`, scrollable element rows (H,C,N,O,F,P,S,Cl,Br,I), selected state matching palette, and a single-line expandable header rendering literal line glyphs. Wire into CanvasStudio in molecule mode; keep MoleculeInteraction's existing callbacks but suppress its toolbar via a prop when sidebar is shown. Run tests + tsc.
- [ ] Step 3: commit.

### Task 3: Radial atom actions

**Files:** Create `src/canvas/RadialAtomActions.tsx`; Modify `src/canvas/MoleculeInteraction.tsx` (render around selected atom); Test `tests/radial-atom-actions.test.tsx`, `tests/e2e/radial-atom-actions.spec.ts`.

- [ ] Step 1: failing tests: eight icon buttons with `data-testid` (`radial-add-pair`, `radial-remove-pair`, `radial-element`, `radial-charge`, `radial-remove`, `radial-bond-from`, `radial-bond-order`, `radial-resonance`), tight ring CSS class, callbacks invoked with selected atom id, no actions when nothing selected. Observe failure.
- [ ] Step 2: implement component with SVG/circular layout (40px ring, 11px buttons), icons via lucide symbols/text glyphs; wire to existing `updateAtom`, `removeAtom`, `connectAtoms`, resonance helpers (reuse callbacks passed from MoleculeInteraction, no new mutation logic). Run tests + tsc.
- [ ] Step 3: commit.

### Task 4: Notebook editor shell + capability preservation

**Files:** Modify `src/canvas/CanvasStudio.tsx` (editor container classes/heading styling only), `src/overrides.css`; Test `tests/editor-capability.test.ts`, `tests/e2e/notebook-editor.spec.ts`.

- [ ] Step 1: failing tests scanning `CanvasStudio.tsx` source for all existing field branches (molecule resonance/OpenChemLib, graph ranges, MathLive workspace, measurement calibration, mind map fields) and asserting the render still includes them after the restyle; plus DOM test that opening a molecule editor exposes `Resonance form`, `Add atom`, `Bond order`, `Convert with OpenChemLib` controls. Observe failure.
- [ ] Step 2: apply notebook classes/heading styling to `.canvas-object-editor` and its header; keep all JSX field branches byte-identical except container class names. Run tests + tsc.
- [ ] Step 3: commit.

### Task 5: Verification and handoff

**Files:** Create `docs/verification/2026-11-22-lab-notebook-canvas.md`; Modify `docs/STATUS.md`.

- [ ] Step 1: run full `tsc`, vitest, targeted Playwright on new specs (isolated ports), quote output. Run full `npm run verify` if feasible; if provider variance causes known flakes, report both runs.
- [ ] Step 2: write verification doc with exact counts, merge seams (`git diff main..HEAD --stat`), and known limits; update STATUS.
- [ ] Step 3: commit.

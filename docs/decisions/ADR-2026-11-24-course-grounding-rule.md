# ADR-2026-11-24 — 99.9% course-grounded student experience

Status: accepted (partner product rule, 2026-11-24).

## Decision

Most of StudyAI is LLM-driven. At least 99.9% of what a student sees must come from that student's own retrieved course material. Concretely:

1. **Every student-facing claim, artifact, question and canvas interpretation traces to retrieved course evidence.** Generated objects carry `ObjectProvenance` (`src/canvas/model.ts:30`) with `sourceRefs`; those refs must be shown where the object is seen, not only in the proposal dialog.
2. **General model knowledge is explicitly labelled.** A display name invented from a conventional dictionary (for example a generic anatomy label derived from `structureId`) is not course evidence and is marked `General label`.
3. **Deterministic scientific tools stay authoritative for calculations.** Math.js evaluation, KaTeX typesetting, `formalCharge`, `vectorMagnitude` and the physics diagnostics decide displayed numbers. The model proposes; it does not compute. The board and inspector therefore share one precision (`formatArrowLabel`, `toFixed(2)`).
4. **Missing evidence is stated, not invented.** A generated object with no `sourceRefs` shows `No course evidence` on the board and in the inspector.

## How this was applied to the Canvas user-readiness work

- `GroundingBadges` in `src/canvas/SceneGlyph.tsx` renders `Generated · not verified`, `No course evidence` and `General label` chips on board cards and in the object editor.
- The anatomy display-name map in `objectTitle` is now declared as general knowledge and surfaced through `isGeneralLabel`; course-authored `labels` remain the preferred source.
- The flashcard reveal, mindmap title/nodes/edges, bond and concept pickers render only object data or course-authored names; no raw IDs are presented as facts.
- Equation and graph glyphs route expressions through KaTeX; numeric results remain Math.js outputs. No new calculation path was introduced.

## Alternatives considered

- Hiding provenance on the board and showing it only in the inspector: rejected, because the board is the primary student surface and an unlabelled generated claim reads as course fact.
- Replacing general labels with silence: rejected, because a blank title is less usable than a clearly labelled conventional name.

## Limits

This ADR changes presentation, not retrieval. It does not weaken grounding enforcement, citations or provider budgets, and needs no `benchmark:canvas` run. Artifact Intelligence already enforces citations at generation time (`src/artifacts/provenance.ts`); this rule makes the same provenance visible on the Canvas.

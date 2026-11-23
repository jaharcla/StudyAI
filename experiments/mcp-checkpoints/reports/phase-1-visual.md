# Phase 1 — Visual correctness and screenshot feedback

Status: **partial — harness and one upstream artifact actually run; StudyAI bridge not run.**

## What was actually run

### Harness tests (RED → GREEN)

```
npx --yes vitest@3.2.7 run --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/visual.test.ts
```
- RED: `Cannot find module './visual'`.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- These validate the rubric scorer and A/B condition logic with synthetic observations. They are **not** evidence about either system's output.

### Upstream checkpoint: real artifacts and screenshots

Pinned clone `checkpoints/upstream/mcp_excalidraw` at `81720ac…`; `npm install --no-audit --no-fund` (585 packages) and `npm run build` succeeded. Canvas server started via CLI; elements created with `node dist/bin.js add`; headless PNGs rendered with `node dist/bin.js screenshot --out`.

Artifact: **signup-flow** (flowchart), from `fixtures/artifacts/tasks.json`. Expected 8 objects / 3 relationships.

| Stage | Command sequence | Screenshot (SHA-256) | Inspection result |
|---|---|---|---|
| A — generate, stop | `add` 7 elements, `describe`, `screenshot` | `signup-flow-A.png` `F3D014E7…77F7B856` | Clean layout, no overlaps/clipping, arrows bound correctly. Structural gap: 7 objects, decision has only "yes" branch. Missing "no" path. |
| B — first correction | `add` arrow check→input with bindings + "no" label | `signup-flow-B.png` `5CDD8A79…3C83E3A254` | Structural gap closed (8 objects), but correction introduced an overlapping double-arrow on the existing input→check line; "no" label rotated/overlapping. |
| B — second correction | `delete` bound arrow; `add` explicit 4-point waypoints | `signup-flow-B2.png` `D8F16C4D…548D629867FC` | Arrow routed around left but crossed the Start box; label readable. Still a visual defect. |
| B — third correction | `delete`; `add` explicit 5-point route above all elements | `signup-flow-B3.png` `9085B326…DF5671675BE` | No overlaps, no crossing, labels visible, 8 objects / 4 relationships. Defect-free by the extended rubric. |

All four PNGs are retained under `experiments/mcp-checkpoints/evidence/phase-1-visual/upstream-mcp_excalidraw/` (gitignored; hashes above).

### Manual rubric scores (upstream signup-flow, inspected from PNG)

| Check | A | B1 | B2 | B3 |
|---|---|---|---|---|
| textTruncation | 0 | 0 | 0 | 0 |
| overlap | 0 | 1 | 0 | 0 |
| arrowCrossing | 0 | 1 | 1 | 0 |
| arrowLabelOverlap | 0 | 1 | 0 | 0 |
| spacing | 0 | 0 | 0 | 0 |
| readability | 0 | 0 | 0 | 0 |
| zoneLabelPlacement | 0 | 0 | 0 | 0 |
| labelToElementAssociation | 0 | 0 | 0 | 0 |
| stemSymbolCorrectness | 0 | 0 | 0 | 0 |
| chemistryBondOrder | 0 | 0 | 0 | 0 |
| vectorArrowDirection | 0 | 0 | 0 | 0 |
| **Defect total** | **1** (structural) | **3** | **1** | **0** |
| Objects / expected | 7 / 8 | 8 / 8 | 8 / 8 | 8 / 8 |
| Relationships / expected | 3 / 3 | 4 / 3 | 4 / 3 | 4 / 3 |

A's single defect is a missing object, not one of the 11 rubric checks; it is recorded separately so the rubric total is not silently inflated. B1's correction traded a structural defect for three visual defects. B3 is clean.

### Concrete finding about the checkpoint

When an arrow is created with `startElementId`/`endElementId`, the upstream CLI **auto-routes and discards supplied waypoints** — the first correction produced a straight vertical arrow despite a 4-point path. Explicit routing requires omitting the bindings and supplying `points`. This is a reproducible behavior of the pinned version and is relevant to any adaptation of its arrow-binding approach.

## Live model-driven A/B (actually run)

After the human partner authorized model calls, I ran two artifact A/B loops with **opencode-go/beam-free** via `harness/live/visual-ab-live.ts`. The model emits a JSON scene, the script renders it through the pinned mcp_excalidraw CLI, I inspect the PNG, then the same session is continued with an explicit defect list for condition B. Full prompts, model output, token counters and PNGs are in `evidence/phase-1-live/` (committed).

| Artifact | Condition | Nodes / edges | Input+output+reasoning tokens | Time | Inspection result |
|---|---|---|---|---|---|
| signup-flow | A | 16 / 19 | 3,892 + 1,248 + 2,175 = **7,315** | 13.4 s | Clipped diamond text ("Pass word Valid?", "Term s Accept"), two shape overlaps, crossing retry arrows, clipped Welcome ellipse |
| signup-flow | B | 16 / 19 | 3,629 + 1,253 + 1,597 = **6,479** | 14.8 s | Shortened labels now fit, no overlaps, no crossing arrows, all text visible — major defects resolved; labels were semantically abbreviated ("Password Valid?" → "Pwd OK?") |
| force-incline | A | 6 / 4 | 8,343 + 895 + 3,997 = **13,235** | 22.7 s | Duplicated overlapping force labels, arrows hidden by text, incline-angle label overlapping its arrow, cramped spacing |
| force-incline | B | 7 / 5 | 6,183 + 967 + 4,939 = **12,089** | 34.5 s | Short labels, visible arrows from block, no overlaps or clipping — but introduced a **semantic STEM defect**: both "W" and "mg" gravity arrows are present, duplicating the same force |

Feedback round cost: ~6.5k–12k tokens and 15–35 s per correction. One round fixed all major *visual* defects in both artifacts. It did not guarantee semantic correctness, and it changed label wording to achieve the visual fix.

## StudyAI bridge — not run

Root dependencies are now installed, but there is still no `.env` with model credentials and no `data/studyai.sqlite` board. Conditions A and B were therefore **not** executed through the actual StudyAI tutor. The live A/B above used a standalone model + upstream renderer, not our bridge, so it cannot answer whether our bridge benefits from the same loop.

## Answer to the campaign question

**Partially answered.** With a capable model (beam-free), one screenshot-inspection round materially improved visual correctness on two different artifacts for roughly 6.5k–12k tokens and 15–35 s per round — so the feedback does appear worth its cost for visual defects. Two qualifications matter: (1) with the 0.8b model, hand-authored corrections needed three rounds and the first correction made things worse, so model capability dominates the result; (2) the correction round can trade semantic fidelity for visual neatness (abbreviated labels, duplicate gravity arrows), so the inspection rubric must include the STEM and label-association checks we added, not just the upstream seven-point checklist.

## To complete this phase

1. Provide StudyAI model credentials and a board in `data/studyai.sqlite`, then run the same A/B loop through the actual bridge adapter.
2. Add a semantic-diff check so a correction that shortens labels or duplicates a force is scored as a regression.
3. Re-run across all six artifact kinds before treating the cost estimate as stable.

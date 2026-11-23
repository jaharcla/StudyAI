# Artifact quality gate result — cycle 3, 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Earlier cycles: `docs/verification/2026-11-23-artifact-quality-gate-result.md`, `docs/verification/2026-11-23-artifact-quality-gate-result-cycle2.md`

Cycle 3 used only the opencode-go free tier with `hy4-flash-free`. Composer constraints were identical to cycle 2, so this cycle isolates the model.

## Scores

| Scenario | Intent 20 | Accuracy 25 | Grounding 20 | Pedagogy 20 | Visual 10 | Interaction 5 | Composite | C1 | C2 | C3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| documented request | 5 | 5 | 4 | 4 | 2 | 1 | 0.82 | 57 | 69 | 82 |
| ambiguous request | 4 | 5 | 3 | 4 | 3 | 1 | 0.76 | 35 | 76 | 76 |
| multi-component torque package | 4 | 4 | 4 | 3 | 2 | 2 | 0.70 | 54 | 64 | 70 |
| insufficient source | 4 | 4 | 5 | 2 | 1 | 0 | 0.66 | 27 | 66 | 66 |

## Frozen gate evaluation

- Overall pedagogy mean: **3.25 / 5** (required ≥ 4.0) — **fail**.
- Per-scenario floor: torque 3.0 and insufficient source 2.0 below 3.5; documented and ambiguous both 4.0 pass — **fail**.
- Critical-failure veto: none observed.
- Determinism: four packages passed five legality repeats each — **pass**.

**Result: NOT QUALIFIED.** Reduced review and Phase 4 auto-apply remain blocked.

## What changed

`hy4-flash-free` fixed the documented-request topic error and improved torque relations. The ambiguous scenario's physics is now fully self-consistent for a block at rest on a 30° incline. No critical failure occurred.

The remaining failures are pedagogical: the documented question is still nearly copyable from the explanation; the torque exercise gives away its own equation and is detached from the calculation question; the torque diagram has a pivot reaction but still no lever arms; and the honest-refusal case teaches nothing, as expected.

## Decision

No Phase 4. Thresholds stay frozen. A fourth cycle would need composer changes that target pedagogy rather than model choice: transfer questions instead of recall, a torque diagram with explicit lever arms, an exercise that requires inference rather than restating an equation, and a refusal case scored under a separately agreed rubric. Changing the rubric or thresholds now would retrofit the measurement to the result.

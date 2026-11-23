# Artifact quality gate result — cycle 4, 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Pre-registered protocol: `docs/decisions/ADR-2026-11-23-artifact-quality-refusal-rubric.md`

Cycle 4 added force application points, a first-class refusal outcome, transfer-oriented questions, connected exercises, two held-out prompts, and a seeded-shuffled sheet. The model was `opencode-go hy4-flash-free`.

## Gate-eligible scenarios

Per the pre-registered protocol, the refusal case and the two held-out cases are reported but excluded from the frozen pedagogy gate.

| Scenario | Pedagogy | Composite (diagnostic) |
|---|---:|---:|
| documented request | 3 | 0.78 |
| ambiguous request | 4 | 0.75 |
| multi-component torque package | 4 | 0.88 |

- Overall pedagogy mean: **3.67 / 5** (required ≥ 4.0) — **fail**.
- Per-scenario floor: documented request 3.0 below 3.5 — **fail**.
- Critical-failure veto: none observed.
- Determinism: five packages passed five legality repeats each; the refusal outcome is exempt — **pass**.

**Result: NOT QUALIFIED.** If documented-request pedagogy were 4 instead of 3, the mean would be exactly 4.0 and the floor would pass. The verdict therefore rests on one integer from one reviewer on one generation.

## Reported but not gated

| Scenario | Pedagogy | Composite |
|---|---:|---:|
| held-out graph reading | 4 | 0.81 |
| held-out pH | 4 | 0.80 |
| insufficient source | no numeric score | not computed |

The refusal case has no numeric labels because the reviewer could not see the registered rubric. Its narrative passes all three criteria — names missing material, no fabrication, concrete next step — with one gap: it does not offer to build a general study artifact from retrieved lessons. No score was inferred from that narrative.

## Interpretation

- Torque rose from 70 to 88, driven by force positions in the schema and transfer/procedure rules in the composer. This confirms the structural diagnosis.
- Held-out cases scored in line with fixed cases (80, 81), the strongest generalisation evidence so far, though one generation each.
- Documented-request pedagogy is the sole gate failure, and the reviewer flagged its own cycle-3 score of 4 on the same question as generous. Part of the 82→78 movement is recalibration, not regression.
- `generatedAt` from the model was invalid; the generator now stamps timestamps on the record, but cycle-4 generations were not regenerated after that fix, so no credit was given.

## Limitations

One reviewer who saw cycles 1–3 in order. Sheet order was shuffled and model identity withheld, but cross-cycle comparisons are not strictly blind. No second reviewer was available.

## Decision

No Phase 4. The reviewer's recommendation stands: obtain an independent second score for documented-request pedagogy before treating this single integer as decisive. Thresholds were fixed before cycle 1 and remain unchanged.

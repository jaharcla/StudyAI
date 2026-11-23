# Artifact quality gate result — cycle 4, 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Pre-registered protocol: `docs/decisions/ADR-2026-11-23-artifact-quality-refusal-rubric.md`

Cycle 4 added force application points, a first-class refusal outcome, transfer-oriented questions, connected exercises, two held-out prompts, and a seeded-shuffled sheet. The model was `opencode-go hy4-flash-free`.

## Gate-eligible scenarios

Per the pre-registered protocol, the refusal case and the two held-out cases are reported but excluded from the frozen pedagogy gate.

| Scenario | Pedagogy | Composite (diagnostic) |
|---|---:|---:|
| documented request | 2.00 (mean of 3 and 1) | 0.78 |
| ambiguous request | 4 | 0.75 |
| multi-component torque package | 4 | 0.88 |

- Overall pedagogy mean: **3.33 / 5** (required ≥ 4.0) — **fail**.
- Per-scenario floor: documented request 2.00 below 3.5 — **fail**.
- Critical-failure veto: none observed.
- Determinism: five packages passed five legality repeats each; the refusal outcome is exempt — **pass**.

**Result: NOT QUALIFIED.**

### Second reviewer

An independent reviewer scored documented-request pedagogy **1/5** from a single-case blind sheet with no case name, cycle, model or prior score. Their reasoning: the renamed angle and nouns are cosmetic; the answer restates the explanation with one symbol swapped; the question supplies the sliding direction, so no reasoning from motion to friction direction is required; and the package objective's "new ramp angle" is only a renamed variable.

The aggregation rule in `docs/decisions/ADR-2026-11-23-second-reviewer-rule.md` was committed before the score was seen. It takes the arithmetic mean of independent scores, so 3 and 1 become 2.00. Both scores are preserved in the baseline. The original reviewer had already flagged their own earlier 4 on the same question as generous; the second review supports that caveat. No further rubric or threshold change was made after seeing the score.

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

No Phase 4. The independent second score has now been obtained and applied under the pre-registered rule, and the failure is no longer marginal: both the mean and the per-case floor fail clearly. Thresholds were fixed before cycle 1 and remain unchanged. A future cycle must fix the transfer-question defect at the composer level rather than seek a more favourable reviewer.

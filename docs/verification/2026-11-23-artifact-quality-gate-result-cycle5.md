# Artifact quality gate result — cycle 5, 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Pre-registered protocol: `docs/decisions/ADR-2026-11-23-artifact-quality-refusal-rubric.md`
Integration source: `docs/research/2026-11-23-open-source-pedagogy-gap.md`

Cycle 5 integrated BloomAssessmentItemGeneration's scenario-first Application-level method directly into the TypeScript composer. The model was `opencode-go beam-free`.

## Gate-eligible scenarios

| Scenario | Pedagogy | Composite (diagnostic) |
|---|---:|---:|
| documented request | 4 | 0.78 |
| ambiguous request | 4 | 0.71 |
| multi-component torque package | 4 | 0.88 |

- Overall pedagogy mean: **4.00 / 5** (required ≥ 4.0) — **pass**.
- Per-scenario floor: all three at 4.0 (required ≥ 3.5) — **pass**.
- Critical-failure veto: none observed.
- Determinism: five packages passed five legality repeats each; the refusal outcome is exempt — **pass**.

**Result: QUALIFIED** under the frozen three-scenario gate.

## Reported but not gated

| Scenario | Pedagogy | Composite |
|---|---:|---:|
| held-out graph reading | 3 | 0.73 |
| held-out pH | 3 | 0.72 |
| insufficient source | no numeric score | not computed |

The two held-out cases average 3.6 and both fall below the 3.5 floor. They are excluded from the gate by the pre-registered protocol, but the 8-point drop from cycle 4 is the strongest evidence in this record that the composer may generalise less well than the fixed cases suggest. One generation per case means it could also be noise.

## Defect found and fixed during review

The reviewer noted that questions refer to data defined only in the `scenario` field. Compilation originally dropped that field, so a student would have seen an unanswerable question. Fixed by adding `scenario` to the artifact brief and question object, rendering it in the review dialog, and exposing it in the object editor. Verified with a unit test and browser-level assertions (authoring spec 3/3). The scores were given on JSON that contained the scenario; the shipped product now matches that input.

## Caveats

- One reviewer scored all cases; no second reviewer was available for cycle 5.
- Visual and interaction were inferred from JSON, not rendered output.
- Relations regressed to `explains` only, leaving several components orphaned. Not a frozen gate criterion, recorded as a composer regression.
- `bloomLevel: "application"` is a model-supplied label and was not credited as evidence. The "then X changes" twist was used in two of five question cases.
- Refusal passes its three narrative criteria but regressed on specificity and repeats the overbroad "no course material" claim.
- Course ID `chem-120` is a harness constant on physics and pH content.

## Decision

The frozen gate qualifies. Under the parent ADR, reduced review still applies only to additive, planner-placed, deterministically validated, fully reversible packages; anything touching student-made content still requires approval. Recommended before broad auto-apply: independent second scores for the two held-out cases and repeated generation to test whether the 3s are stable. Thresholds were not changed, and no rubric was retrofitted.

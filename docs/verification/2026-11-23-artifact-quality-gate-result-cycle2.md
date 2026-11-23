# Artifact quality gate result — cycle 2, 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Cycle 1 record: `docs/verification/2026-11-23-artifact-quality-gate-result.md`

## Scores

| Scenario | Intent 20 | Accuracy 25 | Grounding 20 | Pedagogy 20 | Visual 10 | Interaction 5 | Composite (diagnostic) | Cycle 1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| documented request | 4 | 4 | 4 | 3 | 2 | 1 | 0.69 | 0.57 |
| ambiguous request | 4 | 5 | 3 | 4 | 3 | 1 | 0.76 | 0.35 |
| multi-component torque package | 4 | 3 | 4 | 3 | 1 | 3 | 0.64 | 0.54 |
| insufficient source | 4 | 4 | 5 | 2 | 1 | 0 | 0.66 | 0.27 |

## Frozen gate evaluation

- Overall pedagogy mean: **3.00 / 5** (required ≥ 4.0) — **fail**.
- Per-scenario floor: documented 3.0, torque 3.0, insufficient source 2.0 all below 3.5; ambiguous 4.0 passes — **fail**.
- Critical-failure veto: none observed.
- Determinism: four packages passed five legality repeats each — **pass**.

**Result: NOT QUALIFIED.** Reduced review and Phase 4 auto-apply remain blocked.

## What improved and what did not

The composer constraints removed the cycle-1 defects: empty component citations, placeholder prose, wrong force vectors, a mismatched exercise, and a question that tested the wrong topic. Every component is now cited, the ambiguous scenario's vectors are physically correct, and the exercise matches its prompt.

Pedagogy is still the binding constraint. The documented-request question is copyable from the explanation rather than testing friction. The torque diagram has no pivot or lever arm, the exercise restates the question's answer, and the summary repeats the explanation. The honest-refusal case earns a high composite from accuracy and grounding but teaches nothing.

Composite scores are diagnostic only and were not tuned to pass the gate. Thresholds remain exactly as frozen before cycle 1.

## Rubric caveats raised by the reviewer

- The insufficient-source case scores highly on the current rubric because accuracy and grounding carry 45% of the weight. Separating "honest refusal" from "useful artifact" would be a rubric change and must be agreed and fixed before a future cycle, not retrofitted here.
- Course grounding was scored on citation presence, not verified chunk text.
- Torque relation directions are questionable; this is a schema/composer issue worth fixing in a later cycle.
- Course ID `chem-120` is a harness constant; provenance remains empty in every package.

## Decision

No Phase 4. A third qualification cycle would need composer changes targeted at pedagogy: questions that require transfer rather than recall, a torque diagram with pivot and lever arm, an exercise that is not a restatement, and relation directions that match their labels. Thresholds stay frozen.

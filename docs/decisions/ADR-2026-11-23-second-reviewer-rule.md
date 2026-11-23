# ADR — Second-reviewer rule for disputed pedagogy scores

Status: **accepted — pre-registered before any second reviewer score was seen**

## Context

Cycle 4 failed the frozen gate solely because documented-request pedagogy scored 3 (floor 3.5, mean 3.67 against 4.0). The reviewer noted that a 4 would make the mean exactly 4.0 and pass the floor, so the verdict rests on one integer from one reviewer. The reviewer also flagged their own cycle-3 score of 4 on the same question as generous, and recommended an independent second score.

The sheet instructs reviewers to keep disagreements rather than forcing consensus. The gate needs a deterministic number, so the aggregation rule must be fixed before the second score exists.

## Decision

1. A second independent reviewer scores documented-request pedagogy from a single-case sheet containing only the generation and its request — no cycle label, no prior score, no model identity, no other cases.
2. The scenario's gate input becomes the **arithmetic mean of all independent pedagogy scores** collected for it, rounded to two decimals. Both scores stay in the baseline; disagreement is preserved, not adjudicated away.
3. The frozen thresholds are unchanged: overall mean ≥ 4.0 across the three gate-eligible scenarios, no scenario below 3.5.
4. The rule is applied mechanically to whatever scores arrive. No further rubric, threshold or aggregation change may be made after the score is seen.

## Consequences

With the current three-scenario gate, if the second reviewer scores 4, documented-request becomes 3.50, the overall mean becomes 3.83, and the gate still fails. It would take a second score of 5 (documented 4.00, mean 4.00) to qualify. That is the honest implication of preserving both scores; this ADR is written before either value is known.

No Phase 4 work follows unless the gate computes as QUALIFIED under this rule.

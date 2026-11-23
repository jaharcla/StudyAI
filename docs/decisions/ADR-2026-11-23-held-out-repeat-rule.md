# ADR — Held-out repeat validation rule

Status: **accepted — pre-registered before repeat generation or scoring**

## Context

Cycle 5 qualified under the frozen three-scenario gate, but both held-out cases scored pedagogy 3 and fell below the 3.5 floor. The reviewer suggested repeated generation and a second reviewer to determine whether those scores are stable. This ADR fixes the rule before any repeat outputs or scores exist.

## Decision

1. Generate **three** independent outputs for each held-out scenario (`held-out-ph`, `held-out-graph-reading`) using the same composer and model as cycle 5.
2. A second reviewer scores pedagogy 0–5 for each of the six outputs from a shuffled, identity-free sheet. Previous cycle scores and case names are not shown in the sheet headings.
3. A held-out case's repeat score is the **arithmetic mean of all six case scores** (three repeats × one reviewer), rounded to two decimals. All individual scores are preserved in the record.
4. Held-out cases remain **excluded from the frozen gate** under the earlier pre-registration. Their repeat scores are generalisation evidence only; no threshold or gate rule changes.
5. The rule is applied mechanically to whatever scores arrive. No adjustment may be made after seeing them.

## Consequences

If the repeat means stay near 3, cycle 5's qualification is likely overfitted to the fixed prompts and broad auto-apply should remain blocked. If they rise to at least 3.5, the held-out drop is more consistent with sampling noise. Either way, the frozen gate result is unchanged.

# ADR — Artifact quality gate thresholds

Status: **proposed — owner approval required before any scores are seen**

## Context

The parent ADR (`docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`) fixes the *shape* of the Phase 4 review-reduction gate but not its numbers. The blind-review baseline now has four recorded generations (`docs/verification/artifact-generations.json`) and a review sheet with model identity withheld (`docs/verification/artifact-blind-review-sheet.md`). Scores have not been collected, so thresholds can still be set without hindsight bias.

## Proposed decision

1. **Pedagogy threshold:** mean human pedagogy score **≥ 4.0 / 5** across the four scenarios before any package becomes eligible for reduced review.
2. **Critical-failure veto:** any fabricated citation, fabricated instructor requirement, claimed save that did not occur, leaked identifier/secret, or ignored explicit interaction instruction blocks auto-apply regardless of other scores.
3. **Determinism gate:** the composition legality checks must be clean on repeated runs before the threshold is applied.
4. **Insufficient-source scenario:** the acknowledged-outcome generation is scored on honesty and grounding; it is not required to produce an artifact to pass.

## Alternatives considered

- **Set the threshold after seeing scores.** Rejected: it converts a measurement into a rationalisation and violates the parent ADR's requirement that the gate be fixed before Phase 4 numbers are seen.
- **Use a single model's self-rating as the pedagogy signal.** Rejected by the parent ADR; pedagogy requires human blind review.
- **Allow a critical failure to be offset by high visual/interaction scores.** Rejected by the owner's response-quality acceptance spec.

## Consequences

If approved unchanged, the owner should amend this status to `accepted`, then reviewers can score the blind sheet, labels can be written to `docs/verification/artifact-quality-baseline.json`, and `npm run benchmark:artifacts` can emit an overall score. If the owner wants different numbers, they must be written here **before** labels are filled.

## Verification

No scores, model identity, or provider names appear in this ADR. No cloud credits were spent for generation; local Ollama `qwen3:latest` was used with two bounded generation attempts per scenario.

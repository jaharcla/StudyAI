# ADR — Refusal rubric and cycle 4 measurement protocol

Status: **accepted — pre-registered 2026-11-23 before cycle 4 generation or scoring**

## Context

Three qualification cycles failed the frozen pedagogy gate. The owner's analysis identified structural limits: a torque diagram made only of force vectors cannot show a lever arm; a refusal forced into an `explanation` component has a low pedagogy ceiling; and torque pedagogy stayed at 3/5 across all three cycles while documented-request rose 2→3→4. The frozen thresholds in `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md` were not tuned and remain unchanged.

This ADR records measurement changes **before** cycle 4 results exist, so they cannot be accused ofmoving the goalposts.

## Decision

### 1. Separate refusal rubric

The insufficient-source case is scored on a separate three-part rubric, each 0–5:

- **Names what is missing** — identifies the specific course material that is absent.
- **Avoids fabrication** — invents no topics, dates, instructor requirements or citations.
- **Concrete next step** — tells the student what to supply or do next.

The refusal rubric is reported alongside, not averaged into, the pedagogy gate. The existing six-dimension composite remains diagnostic only. This change is pre-registered because the previous rubric rewarded honesty on accuracy and grounding while punishing the same case on pedagogy, which is close to unwinnable for a correct refusal.

### 2. Held-out prompts

Two held-out scenarios are added alongside the four fixed cases. They are scored and reported, but **excluded from the frozen gate**, whose denominator stays four scenarios. This keeps the original gate comparable across cycles and prevents tuning to the visible set.

### 3. Sheet order and reviewer limits

The cycle-4 review sheet presents generations in seeded shuffled order. Model identity stays in the meta file. Only one human reviewer is available in this session, and that reviewer has seen earlier cycles in order; cross-cycle comparisons remain non-blind and sampling noise with one generation per case is not eliminated. Those limits are reported with the result, not hidden.

### 4. Schema scope for cycle 4

Two additive, non-breaking changes are in scope:

- Optional `position` on diagram force entries, compiled to the existing `pointOfApplication` field on `force` objects, so a torque diagram can carry application points and lever arms. `CanvasDocument.version` stays 1.
- A first-class `outcome: { status: "insufficient-source", missing: string[], nextStep: string }` on `ArtifactPackage`, allowing a refusal with zero components without a dummy explanation component.

No new `ScientificObject` kind is introduced.

### 5. Composer pedagogy rules

Cycle 4 questions must require application or transfer, not recall. Exercise prompts must not state their own equation, and where an exercise accompanies a calculation question it must use that question's values. These are composer constraints, not threshold changes.

## Consequences

Cycle 4 can be compared with earlier cycles on the four fixed gate scenarios. The refusal result is interpreted under the new rubric, and held-out results are reported as generalisation evidence without changing the gate. Thresholds stay frozen.

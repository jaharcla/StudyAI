# Artifact quality gate result — 2026-11-23

Baseline: `docs/verification/artifact-quality-baseline.json`
Frozen thresholds: `docs/decisions/ADR-2026-11-23-artifact-quality-threshold.md`
Command: `npm run benchmark:artifacts`

## Scores (reviewer: owner, with Claude-assisted analysis)

| Scenario | Intent 20 | Accuracy 25 | Grounding 20 | Pedagogy 20 | Visual 10 | Interaction 5 | Composite (diagnostic) |
|---|---:|---:|---:|---:|---:|---:|---:|
| documented request | 3 | 4 | 3 | 2 | 2 | 1 | 0.57 |
| ambiguous request | 3 | 1 | 3 | 1 | 1 | 0 | 0.35 |
| multi-component torque package | 4 | 3 | 2 | 3 | 1 | 1 | 0.54 |
| insufficient source | 1 | 3 | 2 | 0 | 0 | 0 | 0.27 |

Visual and interaction were inferred from component data, not rendered output, and are low confidence. That caveat does not affect the gate, which is governed by pedagogy, the vetoes, and legality.

## Frozen gate evaluation

- Overall pedagogy mean: **1.50 / 5** (required ≥ 4.0) — **fail**.
- Per-scenario pedagogy floor: **all four scenarios below 3.5** (documented 2.0, ambiguous 1.0, torque 3.0, insufficient source 0.0) — **fail**.
- Critical-failure veto: **no defined critical failure observed** — no fabricated citation or instructor requirement, no false save claim, no leaked identifier or secret, no ignored interaction instruction.
- Determinism: **3 packages passed 5 repeats each**; insufficient-source exempt — **pass**.

**Result: NOT QUALIFIED.** Reduced review and Phase 4 auto-apply eligibility are blocked.

## What the scores say

- The composer does not reliably keep the question aligned to the requested topic (documented request tested normal force instead of friction).
- Force vectors are physically wrong on the ambiguous scenario; the diagram would teach an incorrect picture.
- Component-level citations are frequently empty even when the package has retrieved evidence.
- The torque exercise is mismatched to its own prompt, so interaction quality is low.
- The insufficient-source case fabricates nothing but fails to say that course material was missing.

These are composition-quality defects, not harness or persistence failures. The package schema, legality checks, preserve-list repair and five-repeat determinism all behaved as designed.

## Decision

Do not open Phase 4 on this evidence. A new qualification cycle requires regenerating with an improved composer, re-scoring under the same frozen thresholds, and re-running the gate. Thresholds stay unchanged; they were fixed before scores were seen and must not be tuned to this result.

Model identity was withheld during scoring and is now unsealed in `docs/verification/artifact-generation-meta.json`: local Ollama `qwen3:latest`, one scored generation per scenario.

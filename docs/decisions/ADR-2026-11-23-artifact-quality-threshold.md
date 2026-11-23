# ADR — Artifact quality gate thresholds

Status: **accepted — thresholds frozen 2026-11-23 before any blind-review scores were seen**

Owner approval: conditional approval received, with the five amendments below incorporated verbatim in substance before acceptance. No score, model identity, or per-generation rating was available to the owner when these numbers were fixed.

## Context

The parent ADR (`docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`) fixes the *shape* of the Phase 4 review-reduction gate but not its numbers. The blind-review baseline now has four recorded generations (`docs/verification/artifact-generations.json`), a review sheet with model identity withheld (`docs/verification/artifact-blind-review-sheet.md`), and identity in a separate meta file revealed only after scores are committed. This ADR makes the numbers explicit and final before scoring begins.

## Decision

### 1. Score unit and averaging

- The four scenarios are scored with **equal weight**: documented request, ambiguous request, multi-component torque package, insufficient source. Generating extra examples for one scenario cannot enlarge its influence.
- The two bounded generation attempts per scenario are **schema-validity retries only**. The first output that passes `parseArtifactPackage` becomes the single scored record; a failed attempt is never scored or averaged into a scenario.
- Two reviewers score each of the four records independently. A scenario's pedagogy score is the mean of the reviewers' pedagogy scores for that scenario's record. The overall pedagogy figure is the equal-weighted mean of the four scenario pedagogy scores.
- Reviewer disagreement is preserved in the baseline record; it is not forced to consensus.

### 2. Threshold values

- **Overall pedagogy mean ≥ 4.0 / 5.**
- **No individual scenario pedagogy mean below 3.5 / 5.** This is an owner-proposed safeguard against a strong average concealing a weak scenario; it is frozen here, not empirically derived.

Both conditions must hold. A system that meets the overall mean but misses the per-scenario floor does not qualify.

### 3. Critical-failure veto scope

Two distinct vetoes apply:

- **Package-level veto.** A generation containing a critical failure — a fabricated citation or instructor requirement, a claimed save that did not happen, a leaked identifier or secret, or an ignored explicit interaction instruction — can never be auto-applied as an artifact, regardless of its other scores.
- **System-level veto.** A critical failure in the qualification benchmark prevents the system from qualifying for reduced review at all until the failure is addressed and the qualification benchmark is rerun. A strong average never offsets a critical failure.

### 4. Repeated determinism testing

- Each recorded package is validated **five times**. All five runs must produce a clean legality report; one failure blocks qualification.
- Legality checks are: package schema validation (`parseArtifactPackage`), compiled object schema (`compilePackage`), the deterministic validation registry (`validateCompiled`), and byte-stable compiled output across repeats via `stableJson`.
- The `insufficient-evidence` record has no package, so it is exempt from legality repeats. It is still scored on honesty and course grounding, and a fabricated artifact there is a system-level critical failure.

### 5. Composite score is diagnostic only

The six weighted dimensions — intent 20, factual accuracy 25, course grounding 20, pedagogy 20, visual quality 10, interaction quality 5 — produce a composite used for diagnosis and tracking. It is **not** an additional auto-application gate. Only the pedagogy thresholds, the two vetoes, and the determinism gate govern reduced review.

## Phase 4 boundary (unchanged)

Reduced review applies only to packages that are additive, planner-placed, deterministically valid, and fully reversible. Anything touching student-made content still requires approval. StudyAI earns less supervision through demonstrated reliability, not through volume of artifacts or accumulated positive feedback.

## Alternatives considered

- **Set thresholds after seeing scores.** Rejected: it converts a measurement into a rationalisation.
- **Average two scored generations per scenario.** Rejected: the second attempt exists only to fix invalid JSON; scoring it would reward verbose retries.
- **Use one model's self-rating as the pedagogy signal.** Rejected by the parent ADR.
- **Let high visual or interaction scores offset a critical failure.** Rejected by the owner's response-quality acceptance spec.

## Consequences

Reviewers may now score `docs/verification/artifact-blind-review-sheet.md`. Labels are written to `docs/verification/artifact-quality-baseline.json`; `npm run benchmark:artifacts` then emits an overall score and evaluates the frozen gate. Model identity in `docs/verification/artifact-generation-meta.json` stays sealed until scores are committed.

## Verification

The numbers above were fixed before any labels, scores, or reviewer ratings existed. No cloud credits were spent for generation: local Ollama `qwen3:latest` was used, with at most two bounded attempts per scenario. The owner's caveat is noted: the referenced parent ADR and verification files exist in the local checkout but were not pushed to `origin/main` at review time, so the owner reviewed a diff preview rather than the remote branch.

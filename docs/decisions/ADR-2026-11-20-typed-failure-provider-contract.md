# ADR-2026-11-20 — Typed failure and provider contract for Canvas Intelligence

- Status: Accepted; first increment implemented
- Parent: [Canvas Intelligence Architecture Additions](2026-11-20-canvas-intelligence-architecture-additions.md)
- Schematic: [Typed Failure and Provider Contract](2026-11-20-typed-failure-provider-contract.md)

## Context

`CanvasUnderstanding` carried failures as strings (`partial`, `warnings`,
`omittedImageRegionIds`, `failedImageRegionIds`) and the producer wrote
`provider: "system"` for OCR, structure, and fusion even when a remote model had been
called. Provider resolution was split across four functions with no testable capability
model, so "this provider has no vision" was a filter side effect.

## Decision

Add an additive contract in `server/canvas-intelligence/failure-contract.ts`:

- `FailureKind`, `FailureDetail`, `CanvasFailure`, `StageId`, `Tier`,
  `ProviderCapabilities`, and `StageInvocation`.
- `mapFinishReason` treats only `stop` / `end_turn` as a whole answer; `length` /
  `max_tokens` become `truncated`, filter endings and missing reasons become `incomplete`.
- `mapHttpStatus` maps 401/403 → `auth`, 402 → `credit`, 404 → `model_missing`,
  400 → `unsupported`, 429 → `rate_limit`, 408/5xx → `network`. Only `rate_limit` and
  `network` are retryable.
- `resolveStageProviders` is one capability-aware facade over the existing resolvers. A
  provider with `vision: false` is never selected for an OCR stage. The existing
  resolvers were **not** edited (upstream impact on `resolveCompletionProviders` is HIGH:
  three processes).
- `provenanceForStage` replaces the `"system"` placeholder with the effective provider,
  model, and fallback list.

`CanvasUnderstanding` gains optional `stageInvocations` and `failures`. The producer uses
them for OCR/structure/fusion provenance; absence still yields `system` for backward
compatibility. `CanvasAnalysisProvenanceSchema.provider` is extended additively with
`opencode-go`, `openrouter`, `gemini`, and `openai-compatible` so real remote providers can
be named in persisted results.

## Reuse versus build

Reimplemented the observed NitroAI/PdfCraft patterns in StudyAI's own vocabulary. No
NitroAI (AGPL-3.0) or TurboGoo (all rights reserved) source was copied. No new dependency.
No second board-interpretation authority: `server/canvas-intelligence/scene/` remains the
only whole-board interpreter.

## Verification

- `tests/canvas-failure-contract.test.ts`: 14 tests, RED before the module existed, GREEN
  after — every finish reason, HTTP status, retry rule, capability filter, and provenance
  helper.
- `tests/canvas-analysis-producer.test.ts`: new test asserting real provider/model in OCR
  and fusion provenance, RED before the producer change, GREEN after; existing "no
  invocation → system" assertion still passes.
- Full verification and canvas benchmark results are in the handoff for this session.

## Limits / remaining work

- `mapFinishReason` and `mapHttpStatus` are pure, tested functions. Wiring them into every
  adapter call site in `server/canvas-intelligence/groq.ts` (which currently records string
  fallback events only) is still required before `partial: true` carries an adapter-origin
  typed failure end to end. Today `failures` is derived from existing warnings via
  `failureForWarning`.
- Per-stage provider is not yet surfaced in `CanvasStudio.tsx`, so no browser assertion
  for rendered provenance was added.
- Caps and budgets are unchanged; no OCR region cap, provider budget, or recognition
  threshold was lowered.

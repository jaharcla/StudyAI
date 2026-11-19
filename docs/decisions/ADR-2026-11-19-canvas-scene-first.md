# ADR: Scene-first canvas tutoring

Date: 2026-11-19

Status: accepted for implementation.

## Decision

The persisted canvas scene graph is the tutor's single representation of a board. OCR is no longer a pre-analysis dependency: it is an on-demand, revision-bound tool (`read_canvas_ink`) for specific freehand groups. OCR and recognition output are written back as unconfirmed scene nodes with confidence, source references, and conflict reasons, and every claim must cite a scene node ID.

## Context

The canvas already stores native objects, typed text, exact geometry, stable IDs, stroke groups, recognition candidates, OCR items, and provenance (`server/canvas-intelligence/scene/`). The tutor still received a legacy shape summary whose freehand channel was six sampled points, and the analysis path ran OCR before structure for every deep board. Measured local OCR models were substantially behind the hosted path, and no local model fixed the actual gap: the tutor could not distinguish native text from uncertain ink.

The scene graph already supports `ocr-item`, `recognition-candidate`, `model-observation`, `origin`, `verificationStatus`, `confidence`, `sourceRefs`, and `uncertaintyReasons`. The missing pieces were serialization, an on-demand read path, and a contract.

## Alternatives considered

- **Fine-tune a local OCR model on canvas crops.** Rejected for this change: it adds a model, optimizes transcription rather than canvas interpretation, and would still need a reasoning model alongside it on an 8 GB card.
- **Give the tutor the full stroke polylines.** Rejected as the default: information-complete but token-heavy and poorly interpreted by text models. Full points remain available through tools; prompts do not dump them.
- **Render the board for a multimodal tutor.** Deferred: the current agent is text-only. The scene context is the text-only mental image; a render tool is a follow-up when a vision-capable tutor is selected.
- **Keep OCR as a pre-analysis stage.** Rejected: it makes every board pay for transcription, and its output arrives as a transcript rather than evidence attached to a group.

## Consequences

- The tutor receives evidence, status, and uncertainty, not a confident caption.
- OCR runs only for groups the tutor asks about, after user-confirmed and confident recognition evidence.
- Typed text and user-confirmed labels always win conflicts; OCR items remain unconfirmed and are flagged.
- Analyze Board keeps full OCR (`ocrPolicy: "all"`); the tutor path does not depend on it.
- Handwriting remains ambiguous. The system surfaces "unreadable" or asks, rather than inventing a transcription.
- Photos and imported images without source strokes still require a vision path; this ADR does not solve them.

## Connection attachments

Native arrows and lines expose `labels`, `startAttached`, `endAttached`, and `unattached` in the shape projection sent with the scene. An attachment is a geometric target (a line with its nearest text label, a text, a geo, or a scientific object), distance, and confidence. It is not a semantic relation: the tutor must not infer “transition,” “force,” or “wire” from proximity alone. When a port is unattached or has competing attachments, the tutor asks one short question rather than asserting. This replaces the earlier energy-level special case.

Clarifications are conversational in this phase. Persisting user-confirmed connection feedback and board notes is deferred until repeated clarifications show it is needed; the existing recognition feedback store is the model to follow when that happens.

## Rollback

Point the tutor context back to the legacy `"Active Quickdraw board context"` shape, remove `read_canvas_ink` from the bridge and agent tools, and set the producer back to the previous OCR behavior. The scene graph and stored OCR nodes are additive and can remain.

## Evidence

- Unit tests for scene serialization, ink merge, revision checks, OCR policy, and claim scoring.
- `scripts/benchmark-tutor-claims.ts --dry-run` validates the 20-question fixture across the seven benchmark boards.
- The live A/B claim run is not yet recorded; see `docs/verification/2026-11-19-canvas-scene-first.md`.

# ADR: Source-linked canvas observation regions

Status: accepted for Phase 1.

## Decision

Use QuickDraw's existing `exportImage({ ids, background, scale, margin })` to render bounded crops of source ink without mutating the store. Derive stroke bounds from the same QuickDraw `pageBounds` geometry used by the exporter. Send each crop with its deterministic region ID, original QuickDraw stroke IDs, rendered dimensions, and pixel-to-world transform. Revalidate IDs and bounds against the persisted snapshot before OCR evidence is accepted.

Keep OCR confidence null when Groq does not provide calibrated confidence, retain only deterministic region bounds when item boxes are absent, and represent nearby objects as uncertain geometric candidates. Preserve the board document and existing user-approved edit path. Bound per-analysis OCR crops and report skipped or rate-limited regions as partial analysis.

## Reuse and alternatives

- Reuse pinned `@quickdrawjs/react` 0.1.0 / `@quickdrawjs/core` 0.1.0 (MIT), QuickDraw `pageBounds` and ID-filtered `exportImage`, plus StudyAI's existing stroke grouping, region localization, evidence, revision, and Tutor projection contracts. Add no dependency.
- Prefer source-linked crops over full-board OCR coordinates: Groq OCR currently removes model boxes and IDs; user-requested boxes would be model estimates, not verified geometry.
- Server-side image rendering would duplicate QuickDraw's renderer and require a browser canvas implementation. Defer it; the server validates submitted source IDs, bounds, dimensions, and transforms against the saved snapshot, but cannot authenticate client-rendered pixels.
- A full generalized scene graph is deferred. The new observation and association fields remain typed and source-scoped so later geometric recognizers can reuse them.

## Limits

Crop localization identifies the ink group, not individual characters. Submitted crop pixels are client-rendered, so validated bounds provide scoped provenance but not pixel authenticity. OCR readings remain unconfirmed observations and cannot overwrite authoritative science objects. Proximity is a candidate relationship, not user confirmation. OCR calls remain subject to Groq request limits; unprocessed regions must be reported.

## Verification

Add deterministic helper, validation, evidence, and Tutor projection tests; add Playwright flows using real mouse strokes with mocked OCR; add a separately gated live-Groq handwriting case. Run unit tests, TypeScript checks, production build, and targeted Playwright tests. Report live provider results separately from mocked results.

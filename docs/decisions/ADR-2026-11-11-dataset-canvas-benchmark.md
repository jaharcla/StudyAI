# ADR: Dataset-backed canvas benchmark

Date: 2026-11-11

## Decision

Use the pinned `@quickdrawjs/react` 0.1.0 (MIT) snapshot format and StudyAI `CanvasDocument` v1 for benchmark boards. Save them in a dedicated ignored database, then run them through the existing CanvasStudio save, render, capture, and analysis path. Keep source annotations and raw InkML in ignored benchmark data, outside every Tutor request.

Import each InkML trace as one editable QuickDraw `draw` shape with stable source-linked IDs. Preserve every source channel value, including exact X/Y, time, and pressure where present, in the local provenance sidecar. Apply one documented uniform fit transform to the board strokes; QuickDraw has no source timestamp channel. Do not stitch traces together. The parser accepts only bounded flat traces with one format and absolute coordinates; it rejects DTD/entity declarations, groups, views, contexts, multiple formats, and unbounded files, strokes, points, or text. It does not claim general InkML support.

Use MathWriting's public human-written test split for genuine stroke samples. Use PhysAlign development probes as image-only reconstruction targets: rebuild their diagrams with editable QuickDraw and scientific objects, and record each added/rebuilt component in a separate provenance and scoring manifest. Do not claim original stroke fidelity for PhysAlign. Prepare IAMonDo as a local InkML import source only after registered access and data-use terms are available.

## Reuse and alternatives

- Reuse the existing QuickDraw snapshot, canvas persistence, and canvas analysis contracts. Add no parallel canvas schema or runtime dependency.
- `@quickdrawjs/react` is already pinned at 0.1.0 under MIT; no XML parser exists in the installed dependency tree.
- Microsoft `InkMLjs` is Apache-2.0 but archived in 2024, depends on legacy jQuery, treats a third channel as force and ignores additional channels; it cannot preserve MathWriting's X/Y/T channels reliably. The Wacom `inkml-to-uim` Apache-2.0 repository is a Python/lxml sample with single-trace-group assumptions and converts to a different model. Neither fits this local TypeScript path. The small parser is limited to MathWriting's flat trace subset; IAMonDo needs a separate tested adapter if access is granted.
- PNG-only input was rejected for digital-ink data because it discards trace boundaries and coordinates.
- Copying source labels or scoring annotations into the canvas was rejected because it would leak expected answers into Tutor context.
- The PhysAlign GitHub repository's runnable sample is synthetic; it is useful for checking its probe structure, not as a substitute for its released source problems.

## Data terms and limits

- MathWriting 2024 excerpt: CC BY-NC-SA 4.0; the archive and converted examples stay in ignored local data and are not added to tracked files.
- IAMonDo v1.0: 941 online documents in InkML; the site requires registration and limits use to non-commercial research. Access and the format's richer document annotations still need review before importing.
- PhysAlign: Hugging Face lists license `other`; its card requires following each upstream dataset's terms and notes `human_reviewed=false`. Use its development split for integration, keep raw images local, and do not compare StudyAI scores with its paper baselines.

## Verification

Verify stable stroke IDs and exact X/Y transfer, source-channel retention in sidecars, canvas persistence/reload and editing in the real application, then capture and score live analysis outputs. Report calls, stage latency, and observed pipeline failures; report token and memory usage only if the provider exposes them reliably.

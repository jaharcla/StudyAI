# Revised Plan: Whole-Board Scene-Parser Feasibility Experiment

Status: Implemented and run once on the saved methane canvas on 2026-11-12. See [the feasibility results](2026-11-12-whole-board-scene-experiment-results.md). The one-run Groq budget is exhausted; the result note records the raw-artifact retention failure and scoring corrections.

## Goal and limits

Compare the current Analyze Board pipeline with three controlled whole-scene inputs on the existing saved methane canvas. Measure recognition, grouping, source grounding, relationships, and chemistry separately. This is a feasibility case study, not evidence of general accuracy and not a production integration.

Use the currently configured Groq provider only. Do not create synthetic drawings, expose gold answers to the model, write to the original database, add a provider/dependency, update Tutor context, or alter authoritative canvas state.

## Four experimental conditions

| Condition | Model input | Purpose |
|---|---|---|
| A — existing baseline | Existing Analyze Board input and pipeline, including its current crop selection and stages | Measure current behavior as implemented |
| B — image only | Complete rendered scene image; no stroke arrays, source IDs, or geometry features | Measure image-only recognition and visual relationship claims |
| C — image + ink | The exact same image as B plus every original stroke ID and saved x/y/pressure point | Measure the incremental value of raw stroke data |
| D — image + ink + geometry | Same image and complete raw stroke input as C, plus deterministic candidate groups and derived geometry features | Measure the incremental value of grouping/features |

For B–D, keep model ID/version, system prompt, task wording, output schema, image bytes/dimensions, decoding settings, output-token cap, and request options identical wherever the API supports them. Use the same fixed input envelope with absent fields empty for B and C. Use temperature 0; use the same seed if supported. Log effective model ID and all effective settings. Do not tell the model which condition it is in.

Condition A is intentionally not matched: it uses existing region crops, prompts, outputs, and potentially multiple OCR/structure/fusion calls. Treat A as the product baseline, not as a controlled ablation against B–D.

### Remaining uncontrolled variables

- A differs in image selection, prompt/task decomposition, output format, and number of calls.
- B–D differ in input payload size by design; this affects token use and may change attention even with matched settings.
- Provider-side model alias changes, nondeterminism, image token accounting, and caching may not be controllable. Record these when observable; do not claim statistical significance from one board or one run.
- A single saved chemistry drawing cannot establish performance on other handwriting styles or scientific domains.

## Shared B–D output and evidence rules

Use one versioned JSON schema for B–D. It should represent transcription/visual kind, response-local entity indexes, proposed relations between those indexes, an explicit ambiguous/unreadable state, and optional typed evidence references. Do not request model coordinates or model confidence. Every returned item remains a hypothesis.

- B has no source evidence references available. An empty evidence list is valid; a fabricated source ID is rejected.
- C may cite only the source stroke IDs supplied in its input.
- D may cite only supplied stroke IDs or server-created candidate-group IDs. The server expands groups to their exact stroke sets.
- Validate every reference against the frozen source map. A syntactically valid ID is not proof that it supports the claim.
- Do not allow the model to author pixel/world coordinates, confidence values, provenance, canvas edits, or confirmed relationships. Compute geometry from the saved source; keep semantic interpretations provisional.
- Convert A’s output to the common evaluation record offline only. Do not change the existing Analyze Board contract for this experiment.

## Ground truth and leakage controls

Create gold annotations only after inspecting the exact rendered saved canvas and its structured objects. Two reviewers should annotate independently; preserve disagreements as uncertain instead of forcing consensus. The gold fixture must remain outside prompts, request payloads, logs sent to Groq, and model-visible filenames/metadata.

Before inference, inspect the rendered image for visible answer leakage (for example a written molecule name or formula). Never erase information from the actual board. If the answer is visibly stated, label the result answer-assisted and exclude it from blinded recognition claims. Do not put methane, CH4, expected atom/bond counts, gold labels, gold IDs, or ground-truth fixture metadata in prompts.

Gold annotations must map each visible symbol/object and relation to exact original stroke IDs where visually supportable. Mark unreadable, overlapping, or disputed assignments uncertain. Do not infer a complete methane graph from the board name or prior AI output.

## Capture and rendering gate — before any Groq request

1. Open the source SQLite database read-only. Freeze board/course/lesson identifiers, revision, document hash, update timestamp, saved snapshot, and all source IDs. Record them in a manifest that contains no answer labels.
2. Use a test-only renderer with the saved snapshot; do not click the UI Analyze Board action, which calls `saveNow()` first. Run the existing producer against an in-memory copy of the frozen row. Never point the producer at the original database for writes.
3. Render the entire world extent, including both QuickDraw ink and the separate `ScientificLayer` SVG, under one recorded transform. Save the exact submitted image bytes, dimensions, world bounds, transform, and layer coverage.
4. Verify all relevant marks and structured objects are inside the image with margin. Check transform round trips and known overlay landmarks to within one output pixel. Confirm the science SVG and ink align.
5. Review the exact image at the resolution sent to Groq. Two reviewers must be able to read each gold label used for the whole-scene recognition comparison at native submitted resolution. Record label pixel bounds/height and legibility. If a label is clipped, misaligned, or illegible, stop that comparison and record a capture/rendering failure; do not call it an OCR failure.
6. Freeze baseline crop images, source IDs, crop transforms, selected and omitted regions using the existing capture path. Preserve the three-crop limit as the baseline behavior; report any omitted ink.

The present capture implementation needs a behavior-preserving extraction of `captureQuickdrawOCRRegions` so the harness can invoke the real crop path without the UI save side effect. Full-scene rendering must composite the separate SVG layer; QuickDraw `exportImage` alone is insufficient.

## Independent stroke-grouping evaluation

Manually annotate gold object membership for source strokes (for example each handwritten label, arrow, circle, bond, or unrelated mark). Do not pass gold memberships to condition D. Evaluate the deterministic candidate groups against these annotations independently from model output:

- **Object completeness / candidate recall:** fraction of gold objects represented by at least one candidate containing the complete gold stroke set.
- **Group purity / false merges:** fraction of each candidate’s strokes belonging to one gold object; report groups combining unrelated objects.
- **Split rate:** fraction of gold objects split across multiple candidates so no candidate contains the complete object.
- **Exact group match:** candidate source-ID set exactly equals a gold object’s source-ID set.
- **ID resolution integrity:** candidate IDs resolve to the exact frozen source IDs and document revision.

Report ID integrity separately from grouping correctness. Valid source IDs prove only that references resolve; they do not prove that the strokes form the claimed object. A group may contain valid IDs and still be a false merge or a split label.

## Evaluation metrics — report separately

- **Input coverage:** for each condition, fraction of gold-relevant ink/objects included in its input. For images, assess visible, unclipped marks at submitted resolution; for C/D, also report source-ID and point counts supplied. Do not merge image coverage with stroke-array coverage.
- **Recognition:** precision, recall, and exact transcription for legible gold symbols/text. Unrecognized and ambiguous items count as recognition misses, not successful coverage. Report capture-ineligible labels separately.
- **Candidate recall/grouping:** use the independent grouping metrics above. This is not OCR accuracy.
- **Source-grounding precision/recall:** among model claims tied to source strokes/groups, measure correctness against gold membership. Report rejected fabricated/unknown IDs separately. B has no source-grounding input and is N/A for stroke-level grounding.
- **Association precision/recall:** measure whether each proposed label-to-object or object-to-object relation matches the visually reviewed gold. Proximity alone is not a correct relation.
- **Geometric support:** report endpoint distance, intersection/overlap, and direction checks separately as supporting features. A candidate bond near two labels is geometry-supported, not confirmed as a chemical bond.
- **Scientific interpretation:** score atom/bond labels, connectivity, and derived formula separately against gold. Derive a formula only from a reviewed/validated graph. Correct CH4 with wrong stroke mapping is not a grounded success.
- **Uncertainty and unsupported claims:** count explicit ambiguity, unsupported relation claims, hallucinated entities, and unresolved gold items. Keep these separate from recognition misses and false associations.

Do not combine these into one accuracy number. Do not count unmatched strokes as recognized; use unmatched only as an accounting disposition for source coverage.

## Failure taxonomy

Assign a primary failure stage and optional secondary stage to each failed item/run:

1. **Capture** — source snapshot or crop/image omitted, clipped, or incomplete.
2. **Rendering** — layer absent, transform/scale incorrect, or image/strokes misaligned.
3. **Segmentation** — grouping merges unrelated marks or splits one object.
4. **Recognition** — visible legible content transcribed incorrectly or missed.
5. **Source-grounding** — claim maps to wrong original stroke IDs or fabricated/unresolvable IDs.
6. **Relationship reconstruction** — wrong or missing association despite recognized entities.
7. **Scientific interpretation** — incorrect domain label, topology, connectivity, or derived result.
8. **Unsupported evidence** — claim exceeds available visual, source, or geometric evidence, including treating proximity as proof.

Capture/rendering failures must not be scored as model recognition failures. Preserve raw outputs and the reason for every excluded item.

## Token, latency, and request budget

One complete A–D run is capped at **eight Groq requests**:

- A: up to five existing calls (up to three OCR crops, structure, and fusion); verify the current mode/stage count before implementation and lower the cap if the real path is smaller.
- B: one multimodal call.
- C: one multimodal call.
- D: one multimodal call.

No retries, hidden fallback, or additional model call is permitted in the benchmark run. Abort before exceeding the cap. If inspection shows the existing baseline can exceed five calls, recalculate and document a new hard cap before any live run.

Wrap the existing injectable Groq fetcher to record response usage without changing returned data. For every request record condition/stage, model, prompt/completion/total tokens where returned, request and response byte sizes, image dimensions/bytes, stroke point/ID counts, latency, HTTP/error result, and settings. Record token estimates separately from provider-reported usage. Compare B→C to assess raw-stroke input’s incremental value and token/runtime cost; compare C→D to assess geometry features’ incremental value and cost. Report cost only when exact model pricing and provider usage support a reproducible calculation; otherwise report usage and mark cost unavailable.

On this one board, “useful raw coordinates” is limited to an observed per-case metric change. It is not evidence of general utility. If C increases token/runtime cost without improving recognition, grounding, or relation metrics on this case, report that result without concluding coordinates never help.

## Implementation sequence and file-level changes

### Phase 0 — freeze baseline and make reuse decision

1. Before code changes, record the working tree and run the existing baseline test suite. Preserve unrelated dirty files. Identify the exact source DB and row; open it read-only and verify the methane snapshot/hash/revision against `tests/fixtures/canvas-grounding/preserved-quickdraw-sample.json`.
2. Add `docs/decisions/ADR-2026-11-11-whole-board-scene-experiment.md` describing reuse of the current canvas snapshot/types, producer, crop selector/export, Groq configuration/fetcher, and test stack. Record why no new recognizer dependency or production endpoint is being added, limits, licensing/reuse implications, privacy/cost bounds, and the experimental-only boundary.
3. Add `tests/fixtures/canvas-grounding/methane-scene-manifest.json` with source identity/hash/revision, render settings, and answer-free metadata, plus `tests/fixtures/canvas-grounding/methane-scene-ground-truth.json` for separately reviewed gold object/stroke/relation annotations and uncertainties.

### Phase 1 — safe capture and independent group scoring

4. Move the existing crop helper to `src/canvas/ocr-capture.ts`; update `src/canvas/CanvasStudio.tsx` to call it without changing crop selection, ordering, pixels, ID validation, or transforms. Add parity tests for existing crop behavior.
5. Add `tests/experiments/whole-board-scene/renderer.html`, `tests/experiments/whole-board-scene/renderer.tsx`, and `tests/experiments/whole-board-scene/runner.ts` to render the frozen snapshot without app save calls, composite QuickDraw plus `ScientificLayer`, and run the capture gate. Use `produceCanvasAnalysisForPersistedBoard` with an in-memory copy for A.
6. Add grouping construction in `server/canvas-intelligence/scene-experiment.ts` and independent scoring in `tests/experiments/whole-board-scene/evaluation.ts`, with tests in `tests/scene-experiment.test.ts`. Score completeness, merge/split, exact sets, and ID resolution against the withheld gold fixture. Keep gold data out of D’s payload.

### Phase 2 — matched experiments and report

7. Add strict experimental types/schema and validators in `server/canvas-intelligence/scene-experiment.ts`. Generate geometry groups/features deterministically from source strokes; model responses remain untrusted proposals.
8. Add an isolated Groq experiment adapter in `server/canvas-intelligence/groq.ts` or a dedicated `scene-experiment-groq.ts`. Preserve current OCR behavior and production provider selection. Implement one matched B–D call per condition, enforce output/token/time limits, validate evidence references, and capture usage/latency. Instrument A through the existing injected fetcher.
9. Add `tests/e2e/whole-board-scene-experiment.spec.ts` and `tests/experiments/whole-board-scene/evaluation.ts`. Run A–D on the same frozen row and exact image. Store raw responses, exact submitted assets, crops/omissions, inputs, metrics, errors, and request usage under ignored `.experiment-artifacts/whole-board-scene` artifacts, outside the dataset benchmark’s Playwright output directory. The runner must refuse prompts or payload metadata containing gold fixture content.

### Phase 3 — compatibility verification

10. Add regressions in the experiment and existing canvas suites for source immutability, crop parity, reference validation, and Tutor isolation. Run QuickDraw interaction, scientific object/SVG, undo/redo, persistence/revision, approved AI edit, and Tutor projection tests after changes.
11. Review the per-condition report and failure classifications before any separate proposal for production integration. No experiment output is promoted to Tutor or canvas state.

## Acceptance criteria

- The capture gate passes for the exact submitted image before any inference; full extents, QuickDraw ink, scientific SVG, scale, legibility, and alignment are recorded. A failed gate produces a capture/rendering result and no mislabeled OCR score.
- A–D all use the same frozen source document and revision. B–D share model/settings/prompt/schema/image; only the prescribed input slots differ. Uncontrolled differences are recorded.
- The model receives no expected name/count/labels/gold IDs/fixture metadata. Visible answer leakage in the image is identified and excluded from blinded claims.
- Grouping metrics independently expose complete groups, false merges, splits, exact group matches, and candidate ID resolution. Valid IDs alone do not pass grounding.
- Input coverage, recognition coverage/accuracy, candidate recall, source-grounding, relation association, geometric support, and scientific correctness are separately reported. Unmatched marks are not credited as recognized.
- A geometry-supported bond remains a hypothesis until scientific validation/user confirmation; proximity alone cannot confirm an edge.
- Any model-cited source/candidate reference resolves to the frozen snapshot and is scored for actual gold correctness. The model cannot add coordinates, confidence, timestamps, source IDs, or provenance.
- Original database row, document, revision, IDs, update timestamp, science objects, and undo/redo state remain unchanged. No production Tutor context or authoritative state changes.
- Maximum eight provider requests for a complete run, no retry/fallback, and provider usage/runtime are captured per stage when available.
- Results are reported as a single-board feasibility study. No aggregate general-accuracy claim is made from methane alone.

## Future validation set — required before general claims or Phase 2

Build a separate, human-reviewed set from genuine user-created canvases covering freehand chemistry, force diagrams, handwritten measurements, equations, and ambiguous spatial relationships. Include multiple writers, scale/density, mixed native objects and ink, legible and genuinely ambiguous examples, and explicit negative/unmatched marks. Keep train/development/evaluation canvases separate; publish annotation guidance and disagreement handling. Score the same metrics above by domain and condition. Use actual saved examples when available; any controlled new drawing requires separate explicit approval and must be labeled as such.

## Dependencies, risks, and stop conditions

- **Dependencies:** successful identification of the exact saved database row; baseline tests and clean capture metadata; existing Playwright/SQLite setup; behavior-preserving crop-helper extraction; a test renderer capable of compositing both layers; current Groq configuration and usage fields.
- **High risk:** incorrect layer composite or transform invalidates all whole-scene results. Stop before Groq if the capture gate fails.
- **High risk:** methane labels/bonds may not support unambiguous gold. Narrow the gold set and mark uncertainty; do not force the expected molecule graph.
- **Medium risk:** whole-scene downsampling may make labels illegible. Report resolution failure and do not blame recognition.
- **Medium risk:** single-run model variation and a single canvas limit conclusions. Do not claim significance or broad capability.
- **Medium risk:** raw point arrays can consume tokens while adding little semantic value. Use B/C/D deltas to make a per-case cost/benefit observation.
- **Stop:** original DB cannot be opened read-only, snapshot/hash does not match the fixture, source capture requires mutating the source, render coverage cannot be verified, provider/model/settings cannot be held sufficiently constant for B–D, or the hard request cap cannot be enforced.

## Explicit do-not-break list

- Existing Analyze Board request/response, OCR normalization, source-region contract, and provider policy.
- QuickDraw raw strokes, source IDs, coordinate transforms, draw/select/edit/camera interactions, and crop pixels/order.
- Native scientific objects and separate SVG rendering.
- Save revisions, persistence, undo/redo, stale-revision checks, and explicit approval for AI edits.
- Tutor projection boundaries and the rule that model interpretations do not become authoritative state.
- User database records, original canvas content, and saved worktree changes.

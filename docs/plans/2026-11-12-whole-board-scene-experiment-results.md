# Whole-board scene experiment — saved methane canvas

Run date: 2026-11-12  
Scope: one feasibility case study; not a mixed-canvas readiness benchmark.

## Frozen input and isolation

- Canvas: `preserved-quickdraw-sample`, revision 95; document SHA-256 `69e78fdf7e4adeebee4a3323cbf1593517568ad1e41af0660540d92919f90df5`.
- Capture: 2917×1794 PNG, 145111 bytes, 1.25 pixels/world unit. Full QuickDraw and scientific-layer extents were included; the saved capture passed its transform and coverage checks.
- Gold: five handwritten atom labels, 18 target ink strokes, three visually clear connections, and one uncertain left connector. One reviewer annotated the exact render; independent review is incomplete.
- No formula/name was visible in the target scene. A separate native QuickDraw molecule elsewhere on the board was a distractor.
- The run made exactly eight Groq requests: A=5, B=1, C=1, D=1. All eight returned HTTP 200 and provider token usage. No retries or provider changes.
- The original SQLite file hash remained `91f38e22ca9b5c15ba62c093f780bbe5e4fe71d873008c86eec8a9698af59ed6`; revision and update timestamp were unchanged. The experiment ran A through an in-memory database copy and did not call production Tutor or write authoritative canvas state.

## Conditions

Recognition precision is target-scoped: extra observations are claims outside the freehand target and are not necessarily false OCR of the rest of the canvas. “Exact labels” measures item-to-original-stroke localization, not merely whether an ID exists.

| Condition | Input | Requests / runtime | Text precision / recall | Exact label mappings | Clear relation precision / recall | Uncertain connector acknowledged | Formula and scene result |
|---|---|---:|---:|---:|---:|---:|---|
| A | Existing Analyze Board; three selected crops | 5 / 10.4 s | 45.5% / 100% | 1/5; four crop-ambiguous | N/A / 0% (0/3) | 0/1 | No formula claim; missed three clear relations. |
| B | Full-scene image only | 1 / 3.9 s | 100% / 100% | 0/5; source localization unavailable | 75% / 100% (3/3 clear) | 0/1 | CH4 matched, but was unqualified and had no stroke evidence. Not a grounded graph. |
| C | Same image plus source strokes, IDs, coordinates, and source objects | 1 / 12.9 s | 23.8% / 100% | 0/5; four partial, one mislocalized | 5.6% / 33.3% (1/3 clear) | 0/1 | CH4 matched but unqualified; only 66.7% of target strokes cited by formula claims. |
| D | C plus seven deterministic groups and geometry features | 1 / 12.1 s | 15.6% / 100% | 0/5; four partial, one mislocalized | 33.3% / 100% (3/3 clear) | 0/1 | CH4 matched; formula evidence covered 77.8% of target strokes. Full grounded graph failed. |

All B–D saw the identical 2917×1794 image and used `qwen/qwen3.8-27b`, temperature 0, and a 4096-token completion cap. A used that OCR model for three crops and `openai/gpt-oss-120b` for structure and fusion.

### Grounding and relationships

- A’s OCR cited crop-region source sets, not per-label strokes: region-only grounding precision was 13.2%, broad source-overlap recall was 100%, and only 1/5 labels mapped exactly. That 100% overlap recall is not exact spatial grounding.
- B had no source-ID input. The response nevertheless contained 23 source references; the validator rejected them as unavailable and retained no source grounding.
- C and D’s source references resolved to supplied IDs, but validity did not imply correctness. Each grounded only 4 of 14 expected target label strokes (28.6% stroke recall), with zero exact label mappings. C mislocalized the carbon to an unrelated mark; D assigned the left H to a bottom-H stroke.
- C proposed 17 false target associations. D proposed six false associations. D restored recall for the three clear connections but still missed explicit ambiguity on the visually uncertain left connector.
- The three clear relations are geometric/visual proposals only. Neither relation scores nor formula claims make a chemical bond authoritative.

### Independent grouping score

- Thirteen gold freehand components; seven candidate groups.
- Complete-object recall 100%; mean group purity 88.8%; one false merge; zero split objects; six exact source sets.
- Candidate source-ID resolution was 22/22 (100%). This is ID integrity, not correct segmentation or chemistry.
- Analyze Board selected all three available crops but omitted the left connector: 17/18 target strokes were covered.

### Tokens and latency

| Condition | Prompt tokens | Completion tokens | Total tokens | Request-level latency |
|---|---:|---:|---:|---:|
| A | 42,863 | 3,644 | 46,507 | 0.75–5.52 s per call; three OCR calls overlapped |
| B | 2,147 | 1,423 | 3,570 | 3.92 s |
| C | 28,652 | 3,250 | 31,902 | 12.85 s |
| D | 32,643 | 3,856 | 36,499 | 12.09 s |
| Total | 106,305 | 12,173 | 118,478 | 8 requests; the Playwright test completed in 47.6 s |

Raw stroke input increased B→C usage by 28,332 tokens without improving exact localization and while relation precision/recall fell. Geometry candidates increased C→D by 4,597 tokens; relation recall rose, but source localization remained zero exact labels and six false associations remained. This is a single-board result, not evidence that coordinates are generally unhelpful. Exact dollar cost was not calculated because no pinned, run-dated Groq price schedule was applied.

## Failures and corrections

- **A — capture and recognition:** the three-crop baseline omitted the uncertain connector and produced six extra target-scoped observations. **Relationship reconstruction:** 0/3 clear relations recovered.
- **B — source grounding and unsupported evidence:** 23 unavailable source references were rejected. **Relationship reconstruction:** the ambiguous edge was treated as a connection. **Scientific interpretation:** correct CH4 alone did not constitute scene understanding.
- **C — recognition, source grounding, relationship reconstruction, scientific interpretation:** correct target labels were present, but 16 extra target-scoped claims, zero exact label mappings, one mislocalized label, 17 false associations, and unqualified formula support remained.
- **D — segmentation, recognition, source grounding, relationship reconstruction, scientific interpretation, unsupported evidence:** one false candidate merge, 27 extra target-scoped claims, zero exact label mappings, one mislocalized label, six false associations, and no explicit acknowledgement of the uncertain edge.
- **Evaluation correction:** the first report marked D’s formula “conditionally qualified” because a broad `/left/` string check could match an unrelated “top-left sketch” ambiguity. The evaluator now requires a left/horizontal connector-specific uncertainty or a correctly matched ambiguous relation. The observed relation score was 0/1 for the uncertain connector, so the original conditional label is not accepted. The D proposal artifact was removed before it could be re-scored from disk.
- **Artifact-retention failure:** the first run stored its report and raw provider logs below Playwright’s shared `test-results` directory. A separate dataset-to-canvas Playwright run began afterward and cleaned that directory. Its run record confirms it used the same output directory. The metrics above are from the generated report captured before cleanup; the raw OCR/provider bodies are no longer available for independent replay. The experiment now writes run data under ignored `.experiment-artifacts/whole-board-scene/runs` and uses a separate Playwright output directory. The dataset benchmark configuration was not changed.
- **Measurement corrections:** the initial report omitted `documentHashAfter`, causing a false “document unchanged: false” line even though exact row equality, revision, update timestamp, and DB hash all passed. The report now includes both hashes. Baseline input coverage also incorrectly counted unsubmitted raw-stroke arrays; the count now reports zero for A. Base64 image byte accounting was two bytes high for the padded PNG; the logger now decodes and counts bytes exactly.

## Conclusion

This run supports only a feasibility comparison. Image-only recognition was strong on the five target labels, but source-grounded label attribution and explicit treatment of the uncertain relation failed. Raw coordinates consumed substantially more tokens without improving grounded recognition in this case. Geometry features helped recover clear relation recall, but did not deliver precise source mapping. No condition produced a fully grounded scientific graph.

The eight-request budget has been consumed. The overwritten raw provider files were not recreated; any future live run must be separately authorized and should use the isolated artifact path.

## Verification

- Baseline before implementation: 226 tests passed; one existing `tests/learning-api.test.ts` loopback test failed with sandbox `EACCES`.
- Post-change: 241 tests passed across 37 files when the authorized loopback test could bind; the targeted experiment/crop tests also passed.
- Production build: passed. Vite retained its existing large-chunk warning.
- The saved-board A–D Playwright case passed once in 47.6 s. It is not rerun because the eight-request live budget was consumed.
- No live Tutor call or non-experiment drawing/edit/undo/redo UI flow was run. Existing unit regressions for canvas persistence, AI approval/undo-redo, Tutor projection, and crop behavior passed.

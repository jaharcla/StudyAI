# Canvas dataset benchmark

## Prepared boards

`data/canvas-dataset-benchmark/` is ignored local data. It contains a dedicated SQLite database, six MathWriting test-split InkML documents imported as editable QuickDraw strokes, and one PhysAlign development diagram rebuilt as freehand ink plus a native unlabeled graph. The PhysAlign source is image-only, so that board is a documented approximation, not original ink.

MathWriting's 2024 excerpt is CC BY-NC-SA 4.0 and supplies human-written InkML with spatial coordinates and relative time. The converted boards keep one QuickDraw shape per trace. Raw channel values, annotations, and the fit transform live in `provenance/`; expected labels live only in `scoring/ground-truth.json` and are never sent to Canvas Intelligence.

These six examples come from MathWriting's test split. Keep them as a held-out regression set; use train/validation examples for iteration so tuning does not consume the final evaluation split. See the [official archive guidance](https://github.com/google-research/google-research/blob/master/mathwriting/archive_readme.md).

PhysAlign tests label OCR and diagram context for its development `T03-image` probe. Its released public input does not establish the owner scoring answer, so the benchmark records the expected reading `F/N` and leaves owner scoring pending human adjudication. The source image is not inserted into the canvas. Its external force arrow is omitted because the source says it is not shown.

IAMonDo is a strong follow-up for document layout: it contains online InkML with word-level truth, formulas, tables, diagrams, and markings. Download requires registration and use is limited to non-commercial research. The current importer intentionally rejects grouping/context features and is not an IAMonDo adapter; use registered sample files and inspect their annotations and terms before adding one.

## Prepare and run

Place the six selected MathWriting `.inkml` files in `data/canvas-dataset-benchmark/source/mathwriting/test/`, then seed or refresh the isolated database:

```powershell
npx tsx scripts/prepare-canvas-dataset-benchmark.ts
```

Run the real CanvasStudio capture and live Canvas Intelligence pipeline against that database:

```powershell
npx playwright test --config=playwright.dataset.config.ts tests/e2e/canvas-dataset-benchmark.spec.ts
```

The benchmark config starts a dedicated app on ports 5193/8201/8212/8134 with its own database. The run writes OCR evidence, interpretations, captured ink-region metadata, omissions, HTTP status, and exposed stage timings to `data/canvas-dataset-benchmark/runs/latest.json`. Token use and provider-internal model-call counts are not exposed by the current pipeline result.

## Initial live run — 2026-11-12

The Playwright harness completed all seven requests on a fresh server. Five MathWriting boards returned HTTP 200, all with partial analysis; the nested logistic sample returned HTTP 502 because Groq failed constrained JSON generation. PhysAlign returned HTTP 502 because provider/evidence validation failed. A passing harness run means all responses were recorded; it does not mean all analyses succeeded.

None of the five successful MathWriting responses recovered a complete expression. Two returned isolated symbols (`L`, `D`, `T`, `2`, `(`; and `F`, `1`); three returned no OCR text. Across those five boards, 45 stroke regions were omitted: 34 hit the crop limit and 11 failed OCR. The app captured only three OCR regions per board. The median exposed pipeline time for those five responses was 9.8 seconds.

No PhysAlign score is available from this run. The reconstruction contains editable freehand wall/spring/labels and text, plus a native graph; it does not preserve source ink because the source is image-only. The run provides concrete failure coverage for OCR-region selection, equation recognition, provider JSON reliability, and evidence validation. It does not yet cover native force vectors, native equations, explicit cross-tool relationships, or large multi-scene canvases.

CanvasStudio loaded each board and saved it before analysis. This run did not simulate a user edit followed by reload, so interactive editability and a full edit/save/reload round trip still need a separate acceptance check.

## Whole-expression math OCR run — 2026-11-18

The six MathWriting boards were re-run after adopting one whole-expression crop per pure-ink board and the LaTeX math OCR profile (`google/gemini-3.1-flash-lite` through OpenRouter). All six returned `partial=false`, used one OCR region, and omitted no stroke groups.

| Board | OCR result | Token overlap |
|---|---|---|
| bra-ket sum | `\sum_{x \in \{0,1\}^n} \|x\rangle \|f(x)\rangle` | 0.8 |
| exponential decay | `N(t)=N_0 2^{-t/T}` | 0.8 |
| gradient vector | `\nabla I = (I_x, I_y)` | 1.0 |
| indexed sum | `J_i = \sum_j L_{ij} \frac{\partial F_j}{\partial x_j}` | 1.0 |
| nested logistic | `x_i = \frac{1}{1+e^{-\frac{v_i-u_i}{\epsilon}}}` | 1.0 |
| partial derivative | `\partial_i = \frac{\partial}{\partial x^i} = \frac{\partial}{\partial \xi^i}` | 0.5 |

PhysAlign still uses grouped crops because it is a mixed ink/text/graph board. Its deep analysis recovered the wall, spring, points O/A, force labels, axes, and the empty graph object, but its OCR remains fragmentary (`F F AN F AN L`). Results and logs are under `data/canvas-template-test/`.



- Partial derivatives and nested fractions
- Indexed sums and derivative notation
- Nested logistic exponent and fraction
- Set notation and bra-ket expression
- Exponential decay with subscripts
- Nabla and vector components
- Spring diagram with force-versus-length graph, units, tick labels, dashed guides, and mixed QuickDraw/scientific graph objects
- Typed source text sharing a board with QuickDraw spring ink and a native scientific graph

## Reuse decision

The importer reuses pinned `@quickdrawjs/react` 0.1.0 (MIT) and StudyAI's existing document persistence. No XML dependency is installed. Microsoft [InkMLjs](https://github.com/microsoft/InkMLjs) is archived and has channel/feature gaps; Wacom's [InkML-to-UIM sample](https://github.com/Wacom-Developer/inkml-to-uim) uses Python/lxml and assumes a single trace group and trace. The custom parser is deliberately limited to the flat absolute InkML traces in the selected MathWriting samples. It enforces size and point limits, rejects DTD/entity declarations, and fails on unsupported grouping and context features.

## Sources

- [MathWriting dataset README](https://github.com/google-research/google-research/tree/master/mathwriting)
- [MathWriting archive format and split guidance](https://github.com/google-research/google-research/blob/master/mathwriting/archive_readme.md)
- [IAMonDo overview and terms](https://fki.tic.heia-fr.ch/databases/iam-online-document-database)
- [IAMonDo download and registration](https://fki.tic.heia-fr.ch/databases/download-the-iam-online-document-database)
- [PhysAlign benchmark and split guidance](https://github.com/HCPLab-SYSU/PhysAlign)
- [PhysAlign public data release](https://huggingface.co/datasets/Jetson888/PhysAlign)

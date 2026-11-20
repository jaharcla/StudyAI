# StudyAI canvas intelligence coordination

Date: 2026-11-12

## Coordinator decision

Keep the production canvas pipeline and Groq provider unchanged. The next model candidate is a time-agnostic, sparse heterogeneous graph with joint stroke-group, category, and relation heads. Compare it against a matched modular encoder-plus-graph-fusion baseline. Deterministic canvas facts, source IDs, revision hashes, and evidence validation remain authoritative.

Training an owned model is a primary project objective. Start a small supervised experiment as soon as a licensed, provenance-preserving development split and runnable matched comparison are ready; broader mixed-domain coverage can expand after measuring the first failures. Current provider experiments do not establish learned-model performance. Keep all predictions out of production Tutor until independent evaluation demonstrates improvement.

## Experimental foundation acceptance criteria

| Gate | Acceptance criteria |
|---|---|
| Isolation | New implementation stays in `.worktrees/joint-canvas-model-20261112`; earlier worktrees, benchmark data, database revisions, and results remain unchanged. No production Tutor or provider changes. |
| Reproducibility | Each run gets a unique non-overwriting directory, immutable raw inputs/outputs, SHA-256 hashes, seed, command, environment/device, dataset and split IDs, model revision, and pinned evaluator version. Classify data/setup/scorer/resource failures separately from completed model predictions that score poorly. |
| Data | License/terms and source version verified from primary source; retain source IDs, source hashes, transformations, split, and annotation provenance. Split by source expression/diagram and writer/template where available. The six existing MathWriting test samples remain inaccessible to training and tuning. |
| Model comparison | Sparse time-agnostic joint stroke/object/relation model has trainable grouping, category, and typed relation heads. Modular baseline uses the same examples, labels, candidate edges, feature inputs, split, and evaluation budget. Unlabeled pairs are masked rather than negative. |
| Ablations and metrics | Run geometry-only, visual-only, and combined features where labels/data support them. Report exact stroke-to-object attribution, grouping pairwise/B-cubed F1 plus purity/completeness, recognition, typed relation and candidate-edge recall, calibration/abstention, unsupported scientific claims, per-scene support, p50/p95 latency, and peak RAM/VRAM. |
| Initial training and review | Preserve the completed exploratory checkpoint and records. Correct parameter/compute matching and score independently before drawing an architecture conclusion. The next run must include scorer output and a resource gate. |

Current assignments: `/root/ml_review` owns CROHME train-only parsing and data validation under `experiments/joint_canvas/data/`; `/root/prototype_review` owns the corrected model comparison under `experiments/joint_canvas/model/`; `/root/evaluation_review` independently audits the run and builds a dataset-specific evaluator under `experiments/joint_canvas/evaluation/`. The coordinator owns integration, run isolation, resource gating, and this task board. All new implementation is confined to the isolated worktree.

### Current phase evidence

- `experiments/joint_canvas/repro/run.py` v0.1.6 creates unique run directories, byte-copies declared inputs/model/evaluator/recorder into immutable `sources/`, checks snapshot hashes, preserves raw logs and outputs, and separates pipeline from model-quality status. Failure-classification smokes passed. Runs `mw-v2-ab-20261112-01` and `-02` remain historical and unreplayable from their original code snapshots.
- Corrected MathWriting v2 provenance: official 2024 excerpt SHA-256 `cba038def001480a89962b25cb20a60df4c4145e94ef9d2af65f192cb82bc`, CC BY-NC-SA 4.0, research/non-commercial only. The train-only adapter resolves all 220 symbol groups to raw stroke IDs. Read-only validator passed on 80 train / 20 validation source expressions, 173 / 47 groups, 1,393 stroke nodes, zero source-family overlap, and zero relations. The source has no writer IDs, so writer-level separation cannot be tested. Train/validation JSONL SHA-256 values are recorded in run 02. The six existing held-out MathWriting samples remain untouched.
- The first CPU run used 100 SGD updates per candidate, seed 17, seven geometry features, 80 train scenes and 20 validation scenes. Joint loss: class 4.7623, group 0.6487; modular loss: class 4.7157, group 0.6050. Both had validation class accuracy/macro-F1 0.000 and grouping precision 0.2946, recall 1.0000, F1 0.4552. Of 70 labeled validation strokes, 48 (68.6%) had classes absent from training; all other 22 were misclassified. Relations are untrained/N/A because MathWriting has no relation annotation. This is a weak pilot, not an architecture win.
- The initial A/B was not properly matched: active parameters were 1,318 joint versus 1,150 modular (14.6% fewer), and the modular object encoder was inactive. The recorded comparison ties but is not an architecture result. Joint/modular times were 0.373s/0.332s, CPU-only, with 0/8,192 MiB GPU use; system RAM is not process RSS.
- Corrected MathWriting audit-only passed after schema/model changes: 80/20 scenes and source families, seven geometry features, 100 updates, seed 17, SGD 0.03, common config hash `6a11314f60cb2b5cce93e2a3678e8d154ac213488cb03d8b92711a97a49d0d2c`, schedule hash `90cecb2911b9f3ead5e7b5fa3979b8ae1e45d459306a795de0efbc90426ada8d`; exact 1,168 active/total parameters per candidate, no inactive parameters; caps pass at 26 nodes / 102 edges. Eighteen model tests and synthetic checkpoint smoke pass. Pre-fit RAM was 2,115 MiB and post-load RAM 2,123 MiB, above the 1,024 MiB gate. The model is geometry-only ink; it has no object nodes or relation labels in this dataset.
- Run `mw-v2-matched-20261112-03` completed both CPU fits and saved weights, but the scorer hit a macro-F1 edge case and the recorder correctly preserved it as `pipeline_failure`. Scorer v0.2.2 fixes zero-prediction and zero-support handling; an independent forensic replay of run 03 passed with the same metrics as run 04 below. The original failed run remains unchanged.
- Successful recorded run `mw-v2-matched-20261112-04`: 100 updates per candidate, identical train/validation hashes and schedule, 1,168 active parameters each, all matched/reference audits passed, zero source-family overlap, and no held-out test files opened. Compared with seeded initialization, 1,140/1,168 joint and 1,154/1,168 modular parameter values changed. Training class/group loss means were joint 4.73847/0.64903 and modular 4.72906/0.65961; relation loss N/A. Both validation class accuracy/macro-F1 were 0/0 (70 labels; 68.6% OOV). Group edge P/R/F1 were 0.29464/1.0/0.45517 over 224 labeled pairs; B-cubed F1 0.65249; exact group P/R 0.600/0.25532 over 47 groups. Class ECE: 0.01667/0.01289; group-edge ECE: 0.38253/0.37286. Relations and scientific claims N/A, support 0. Joint/modular fit wall 0.304/0.374s and CPU 0.297/0.375s. Inference-only latency p50/p95 was 2.724/3.944 ms joint and 2.530/3.685 ms modular over 20 scenes. Recorder min free RAM 1,841 MiB; fit minimum 1,896 MiB above the 1,024 MiB gate; GPU system snapshot 0/8,192 MiB. All 12 source snapshots and 19 artifacts rehashed cleanly; run 03/04 checkpoint hashes match exactly, proving deterministic replay for these settings. Decision remains `inconclusive`, with no production integration.
- CROHME v2 generic validation and source verifier passed all 2,259 allowlisted training InkML records: 1,808/451 scenes; 239/56 templates; zero expression, template, and source-family overlap; 44/59 writers overlap. All 26,672 typed relations are deterministic MathML projections with source paths/IDs; explicit pair labels and negatives are zero. No official test payloads were opened. V3 now exists separately with hashes `27f2c96a64afe8037c9e88b682be78e901d41e147cd5e5741cb7b0a57c724b88` / `b8ede85b86e58b18df620c3e9096af0e6f9c2cfa3303148c7cdb8d6dd3429`; all 28,194 groups are retained, missing MathML hrefs are omitted, and duplicate groups 36/37 remain with both source IDs and alias evidence. The canonical manifest still points to v2 until reconciliation. CROHME training waits on multi-membership model support and relation metric contract. V1 remains preserved and excluded (163/2,096 split).
- Update after run 04 snapshot: canonical manifest now selects CROHME v3, and independent generic plus source verifiers pass. Audit-only accepted 99/382 train and 45/165 validation max nodes/candidate edges, exact 1,048-parameter matching, and 87.04%/86.42% expanded relation stroke-pair candidate recall. Multi-membership and conditional relation objectives are implemented; the model suite passes 22/22 tests.
- CROHME relation facts are tagged `deterministic_mathml_projection`, with exact MathML paths/IDs and traceGroup endpoints. They are annotation-grounded structural projections, not explicit pairwise labels; unlabeled pairs stay unknown, so relation edge-existence precision is not estimable. The relation vocabulary is handwritten-math-specific. CROHME and MathWriting are research/non-commercial only; CROHME's exact Creative Commons version is unspecified.

## Reconciled state

### Repository and team

- Root checkout: branch codex/whole-board-scene-experiment at eb82419; local main points to the same commit. The current GitHub main and origin/main are 4c7f8c2, so this checkout is one commit ahead and not behind.
- The root is dirty: 27 tracked files are modified, with untracked research, benchmark, dataset, and experiment artifacts. The experiment and study changes remain uncommitted.
- Other dirty worktrees exist at canvas-live-fusion, dependency-integration-validation, integrated-document-canvas, main, pr1-accessibility, and reusable-learning-integration. They were left untouched.
- The Codex tasks Audit StudyAI scene architecture, Benchmark canvas analysis with datasets, and Research StudyAI canvas intelligence are idle. Their saved artifacts are in this checkout. New experimental work is owned by the active specialist tasks above; their files are confined to the isolated model worktree.
- The root has no AgenTeam config. Specialist work used the available Codex subagent functionality; no team setup files were generated.

### Available integrations

- GitHub confirmed main remains at 4c7f8c2.
- GitDiagram produced a public-repository diagram from its 2026-11-11 snapshot. Use it for broad code orientation, not as a diagram of this dirty branch: [StudyAI architecture diagram](https://gitdiagram.com/jaharcla/studyai).
- The root GitNexus index is dated 2026-11-11, has no commit recorded, and is missing its FTS index. Its searches returned no useful flows. Do not use it to approve impacts until it is refreshed from a controlled snapshot.
- Python 3.10.11 is already installed. PyTorch, TorchVision, Transformers, PyG, and DGL are absent. No dependency, checkpoint, dataset, or model was installed or downloaded.

### Experiment and verification evidence

| Work | Evidence | Limits |
|---|---|---|
| Methane scene A–D | Eight Groq calls: A used 5, B/C/D used 1 each. Source revision and database hash stayed unchanged. The Playwright case passed once in 47.6 seconds. | One board, five labels, 18 target strokes, three clear links, one uncertain link, one reviewer; independent review incomplete. All eight calls are spent. Raw provider bodies were lost when the earlier shared Playwright output directory was cleaned. |
| Seven-board dataset harness | Six MathWriting test samples plus one editable reconstruction of an image-only PhysAlign probe. Five requests returned HTTP 200 with partial analysis; two returned HTTP 502. The harness captured all seven results. | No successful MathWriting response recovered a complete expression. Forty-five regions were omitted. Median exposed time for the five successful boards was 9.8 seconds. PhysAlign has no adjudicated score. These are integration fixtures, not training data or a learned-model result. |
| Current unit suite | 241/241 tests passed across 37 files after allowing the existing loopback HTTP test. | The first sandboxed run failed only because that test could not connect to its ephemeral 127.0.0.1 port (EACCES). |
| Current production build | npm run build passed: TypeScript and Vite completed in 35.2 seconds. | Vite still warns about chunks above 500 kB. |

The dataset task reported a missing tests/experiments/whole-board-scene/evaluation.js import. That failure did not reproduce in the current build; the .js import resolves to the existing TypeScript module under the current bundler settings.

### Artifacts and provenance

- Methane results and corrections: docs/plans/2026-11-12-whole-board-scene-experiment-results.md.
- Seven-board results, manifest, scoring truth, provenance sidecars, and dedicated SQLite database: docs/CANVAS_DATASET_BENCHMARK.md and data/canvas-dataset-benchmark/.
- The six MathWriting items are from the test split and must stay held out. The PhysAlign board is reconstructed from an image and is not original digital ink.
- The current dataset Playwright config writes its reporter output to shared test-results, and the test overwrites runs/latest.json. Give any future run a unique output directory and immutable run record before another browser run.
- Existing experiment code is isolated from production routes. No database, source data, provenance, or saved run record was changed during this coordination pass.

## As-built pipeline

CanvasStudio saves the authoritative document and submits the saved revision, selected IDs, and OCR regions. The server normalizes QuickDraw records and typed scientific objects, creates evidence, runs OCR and structure inference, fuses hypotheses, and validates the result against source IDs and revision hashes. Model interpretations and relations remain explicitly unverified.

Useful source paths:

- UI and saved-board request: src/canvas/CanvasStudio.tsx
- Canvas normalization and deterministic geometry: server/canvas-intelligence/input.ts
- Evidence and source associations: server/canvas-intelligence/evidence.ts
- OCR region grouping: server/canvas-intelligence/regions.ts
- Analysis stages: server/canvas-intelligence/service.ts and server/canvas-analysis/producer.ts
- Result and provenance contract: server/canvas-analysis/contract.ts

The contract is a strong foundation for source IDs, evidence provenance, and stale-revision checks. It does not prove that a valid ID supports a claim. OCR associations currently inherit crop-level source IDs; exact per-symbol stroke grounding is unresolved. Client crop metadata is checked, but the pixels are not rendered from the authoritative saved document. The normalization path also forms all-pairs proximity candidates before an early record/edge bound. Keep these limits visible in the model interface and benchmark.

The methane scorer is still a pilot: recognition matches normalized text without checking symbol kind, exactTextAccuracy duplicates recall, relation scoring recognizes a narrow set of wording, and its formula check is methane-specific. Add reusable task-level scorers before comparing future broad-scene models.

## Unified architecture proposal

### Source ledger

For each saved revision, retain an immutable ledger of QuickDraw stroke IDs and point sequences, native object IDs and typed values, explicit links, geometry, and the revision/hash. Preserve optional pressure with a missingness mask. Do not synthesize cross-stroke timestamps. Candidate groups are hypotheses over original stroke IDs, never new authoritative objects.

### Matched alternatives

| Candidate | Representation | Role |
|---|---|---|
| Geometry-only | Deterministic source facts and bounded spatial candidates | Lower-bound control and candidate-edge recall check |
| A: modular | Specialist ink/object encoders, then a small relation or fusion graph | Required baseline; clearer component ablations |
| B+C: joint spatial graph | Stroke and typed native-object nodes; sparse geometry, alignment, containment, and cross-type edges; shared node, grouping, role, and typed-relation heads | Main hypothesis; time-agnostic SpaceGTN spatial construction with EGAT-style edge-aware shared prediction |
| Visual ablations | No raster, bounded per-stroke crops, then a small board/region image | Test which visual signal helps. Full-board image-only is not source grounding. |
| Unified VLM | Screenshot or multimodal token reasoning | Optional later control; weaker identity alignment and local-memory fit |

Use sparse spatial bins, nearest neighbors or line-of-sight, plus bounded cross-type candidates. A prediction cannot recover an edge absent from the candidate set, so measure candidate-edge recall separately. Treat unlabeled pairs as unknown, not negative. Provide unknown/abstain outputs and top alternatives for ambiguous scenes.

Only deterministic code owns source identity, stored values, units, geometry, explicit links, revisions, and edit application. Model outputs are hypotheses whose endpoints must resolve to the ledger and whose claims must cite claim-specific evidence. Keep model proposals separate from authoritative canvas state until user approval.

~~~mermaid
flowchart LR
  D[Saved canvas revision] --> L[Immutable source ledger]
  L --> X[Typed facts and bounded geometry candidates]
  L --> S[Time-agnostic stroke features]
  O[Specialist OCR or math recognizer] --> G[Candidate heterogeneous graph]
  X --> G
  S --> G
  G --> H[Joint grouping, category, role, and relation heads]
  H --> V[Evidence, ID, schema, and revision validation]
  X --> V
  V --> R[Unverified source-linked hypotheses]
  R --> U[User-approved edit]
~~~

### Research comparison

SpaceGTN is the best design reference for missing timestamps and edited/reordered ink. Its reported stroke and grouping results are on flowchart, mind-map, and automata data; no code, weights, or reusable license were verified. EGAT demonstrates shared stroke and edge supervision for math, including same-symbol grouping, but its published graph uses temporal adjacency and a math-only vocabulary. The named GitHub math_online_egat project is a separate symbol-level linker with no verified license/checkpoint. None is a drop-in mixed-tool STEM model.

A sparse 1–10M parameter graph head with cached features is a plausible local pilot, not a measured capacity result. The prior hardware audit recorded an 8 GiB laptop GPU and low free system RAM. Measure actual peak memory and end-to-end latency before choosing batch size. Keep the training environment isolated from the TypeScript app; first verify data rights, compatible Python/PyTorch versions, and available memory.

## Reproducible benchmark plan

### POC 1: timestamp-free ink structure

- Use CROHME structural labels and MathWriting training sources; keep official validation/test and the six current test samples untouched.
- Remove cross-stroke time features from every condition. Apply identical stroke reordering, translation, rotation, scale, and selected split/recombine transforms.
- Compare geometry-only, A with frozen or specialist ink features, and B+C joint grouping/category/relation heads.
- Split by writer and source expression. Keep transformed siblings together.

### POC 2: mixed-tool STEM grounding

- Author 50–100 source-truth scene templates and 500–2,000 generated boards; add at least 100 manually reviewed real or representative boards before any production claim.
- Mix genuine strokes with native vectors, forces, equations, graphs, measurements, chemistry, and freehand diagrams. Include moved labels, distractors, overlap, ambiguous associations, edited stroke order, and held-out tool combinations.
- Keep target IDs, relation labels, answers, annotations, and answer-bearing text out of model input. Store truth and provenance separately.
- Split by writer, source problem, parent diagram, generator/template, and transformation family. Adjudicate a real-board test set.
- Compare geometry-only, modular A, and joint B+C under the same scenes, labels, feature budget, inference budget, and local hardware.

### Required metrics

- Recognition: symbol precision/recall/F1, character error rate, normalized expression exact match; match by both text and symbol kind.
- Grounding: stroke/object precision/recall, exact source-set match, point-range overlap where available, unsupported and unmatched claim rate.
- Grouping: pairwise or B-cubed precision/recall/F1, one-to-one exact cluster match, merge count, split count. Keep complete-object recall as a secondary metric because it can reward a merged group.
- Relations: typed endpoint precision/recall/F1, exact scene graph match, exact evidence-set match, candidate-edge recall, ambiguity/abstention accuracy, unsupported-relation rate.
- Robustness: results by held-out writer, source family, template, object combination, discipline, scene size, overlap, and edit transformation.
- Operations: cold/warm p50 and p95 latency, peak RAM/VRAM, model/cache size, per-scene failures, local/cloud requests, tokens, and cost.

Current methane scoring gaps are in tests/experiments/whole-board-scene/evaluation.ts; the grouping complete-object recall caveat is in server/canvas-intelligence/scene-experiment.ts.

Report per-scene outcomes and bootstrap confidence intervals by independent source scene or expression, not by stroke. Preserve run-specific raw outputs and hashes. Do not treat a passing response-capture harness as a passing analysis.

### Provisional go/no-go gate

Advance B+C only if it improves cross-tool relation F1 over A by at least 5 absolute points on source-grouped holdouts, with a 95% bootstrap interval above zero; grounding precision drops by no more than 2 points; unsupported claims do not rise; ambiguity is handled through calibrated abstention; and p95 latency stays within a local budget chosen before the run. These are decision thresholds, not literature results. If the gain is limited to one task, use the joint model only for that task.

## Shared task board

| ID | Task | Depends on | Status |
|---|---|---|---|
| 0 | Preserve and reconcile the methane and seven-board evidence | — | Done with limits recorded |
| 1 | Isolate future benchmark artifacts and preserve raw outputs; legacy Playwright output isolation remains open | 0 | New run recorder implemented and smoke-checked; legacy harness is not rerun |
| 2 | Freeze a bounded scene schema, provenance, and sparse candidate-generation limits | 0 | MathWriting v2 and canonical CROHME v3 validators pass; v2/v1 remain preserved |
| 3 | Add reusable recognition, grouping, grounding, relation, calibration, claim-support, and OOD scoring | 0 | MathWriting scorer v0.2.2 verified; CROHME scorer v0.1.4 reports positive-only relation types, calibration, and unsupported-claim N/A; FULLPASS replay passed |
| 4 | Verify licensed training sources, real annotations, and source-grouped splits | 2 | MathWriting v2 and CROHME v3 source mappings pass; test payloads remain sealed; writer overlap reported |
| 5 | Build a trainable timestamp-free joint graph plus matched modular control | 2, 3, 4 | CROHME v3 and multi-membership objectives implemented; V1–V3 and FULLPASS-01 checkpoints preserved |
| 6 | Build mixed-tool scene generator and adjudicated source-grounded labels | 1, 2, 3, 4 | Open; required for broad STEM claims, not a blocker for the ink pilot |
| 7 | Run resource-capped training and matched evaluation with an independent review | 3, 4, 5 | Run 04 and V1–V3 independently audited; FULLPASS-01 hash, schedule, split, and raw/dedup scorer replay passed; model quality remains poor |
| 8 | Integrate an inference adapter behind an explicit feature flag | 7 passes | Gated; production path stays unchanged |
| 9 | Record each run with a unique immutable directory, input/source/evaluator hashes, raw logs, device snapshots, and separate pipeline/quality statuses | — | Recorder v0.1.6 preserved runs 03/04; FULLPASS-01 has exhaustive completion hashes and separate pipeline/quality status; `run.json.outputs` list caveat recorded below |
| 10 | Add and validate a time-agnostic stroke-trajectory sidecar; compare geometry-only, trajectory-only, and combined inputs | FULLPASS-01 plus licensed source adapter | Sidecar must map every source trace exactly, preserve v3 labels, and pass split/resource checks before a bounded six-fit run | Sidecar/prototype prep assigned; training waits for FULLPASS-01 independent replay |

~~~mermaid
flowchart TD
  E[Preserved experiment evidence] --> I[Run-scoped output and disposable DB]
  E --> S[Bounded source ledger and provenance]
  I --> M[Reusable metrics]
  S --> M
  S --> D[License-cleared train/validation data]
  M --> D
  D --> P1[Timestamp-free ink POC]
  D --> P2[Mixed-tool labeled scene corpus]
  M --> P1
  M --> P2
  P1 --> C[Matched A vs B+C comparison]
  P2 --> C
  C --> G{Pre-registered gate}
  G -->|pass| F[Feature-flagged integration]
  G -->|fail or inconclusive| R[Keep production pipeline; refine data or task]
~~~

## Next engineering decision

Do not interpret the MathWriting tie as an improvement: classification is 0/0, grouping is unchanged, and its relation head was untrained. Run 04 is independently audited, and CROHME v3 is canonical and source-verified. Multi-membership supervision and the positive-conditioned relation-type head are implemented and covered by the model suite; train-only V1–V3 are complete and independently audited. The next bounded step is the deduplicated full-train FULLPASS-01 comparison below. Keep production Tutor unchanged. No packages, external checkpoints, Groq credits, or provider changes are required for this CPU experiment.

## Failure diagnosis and controlled improvement (2026-11-12)

### Work packages and acceptance

| Owner | Work | Acceptance | Status |
|---|---|---|---|
| ML review | Audit split support, duplicate content, label provenance, and possible leakage | Preserve train-only evidence; report duplicate-aware support; never read held-out test | Data and model-failure audits complete; read-only |
| Prototype review / coordinator | Implement train-only fit diagnostics and bounded full-train comparison | Preserve all earlier outputs; identical train content/schedule/model budgets; never tune on validation; completion hashes and measured resource gates | V1–V3 complete; FULLPASS-01 implemented by coordinator after prototype assignment was interrupted before code delivery |
| Evaluation review | Independently verify decoding, raw/deduplicated validation, and train-only correction comparisons | Recompute fixed metrics and audit data/schedule/weight/checkpoint lineage; leave frozen runs unchanged | Run04/V1–V3 audits complete; FULLPASS-01 audit in progress |
| Coordinator | Preserve evidence, review methods, update this document, and decide next run | No production/provider change; no held-out test access; no new experiment without a bounded hypothesis and passing resource gate | Active |

### Evidence and current blocker

- Frozen run04 remains the baseline. Each model had 1,048 parameters and received 100 updates across 100 distinct scenes out of 1,808 (5.53%). Validation class accuracy was 18.7378%, equal to the `+` majority baseline; macro-F1 was 0.00574. Conditional typed-relation accuracy was 69.3257%, equal to the `next_in_row` majority prediction, with macro-F1 0.10236. Direct grouping edge F1 was 0 for joint and 0.00632 for modular. Candidate coverage was 98.4% for grouping edges and 89.71% of relation facts, so candidate recall alone does not explain the observed collapse. Run04 did not record gradient norms.
- Independent read-only audit ranks insufficient exposure as the strongest failure hypothesis: the schedule selected 100 distinct scenes from 1,808. It also found that the joint grouping loss (.34556) is near the constant-prior BCE entropy (.34518) with only about 10.9% positive candidate edges; the fixed 0.5 decoder predicts no joint edges. This supports testing optimization on a tiny set before changing loss weights. Classification equally collapses to `+`; its 75-class cross-entropy is unweighted. The representation is only seven handcrafted geometry features with hidden size 7 and 1,048 parameters. The relation head is positive-conditioned with no edge-existence task, so its score is not end-to-end relation recognition. These are evidence-backed hypotheses, not a confirmed single root cause.
- Independent decoder audit found no scorer, source-ID, class-order, or relation-pooling defect. All 451 raw and 264 deduplicated scenes align; prediction probabilities reproduce the saved scorer results. The audit artifact is `experiments/joint_canvas/evaluation/diagnostics/run04_decoder_audit.json` (SHA-256 `38e8ea63308cf89a9e55cdc771e32bbfa3f0078757064716389418f6521f9621`) with its reproducible script beside it. Deduplicated validation scores remain collapsed: class accuracy 17.717% (vs. 17.738% raw), macro-F1 0.00548 joint / 0.00548 modular; conditional relation accuracy 67.763% (vs. 69.326% raw), macro-F1 0.10098 / 0.10098. Every covered relation fact is decoded as `next_in_row`, matching the train majority. At 0.5, joint emits no group edges on either view; modular emits 30 raw edges (12 TP) and 15 deduplicated edges (6 TP). These are unchanged frozen model scores, not threshold-tuned results.
- The run04 input is geometry-only ink with seven features, a seven-dimensional hidden layer, and no pixels or native canvas objects. It supports handwritten mathematical symbols and MathML-derived relation projections only; it does not evaluate broad STEM interpretation.
- CROHME diagnostic evidence reports 734 exact duplicate pairs within 1,808 training rows and 187 within 451 validation rows, all duplicates between 2011/2012 archive editions and all within their respective split. There is no exact-content, source-family, or template overlap across train/validation; 44 writers overlap. Relations are MathML projections with zero explicit negatives. Validation metrics therefore also need a one-scene-per-content sensitivity view. CROHME use remains research/non-commercial; the exact CC version is unspecified.
- The train-only diagnostic is isolated at `experiments/joint_canvas/model/overfit_diagnostic.py` in the model worktree. It pins run04 inputs and checkpoints, fits the same eight source expressions with both models for at most 500 CPU updates each, logs per-head metrics and gradient/parameter norms, and writes only to a new versioned run directory. The probe has seven symbol labels, five candidate-supported relation types, 44 non-singleton groups, and one relation type (`fraction_pair`) whose positive facts have no candidate pairs. That type is reported as candidate-missed and not counted as a model prediction.
- V1 ran both candidates for 500 CPU updates on the eight train-only scenes; all internal 1 GiB gates passed, with minimum free RAM 1,133 MiB joint / 1,206 MiB modular, GPU 0 MiB, and runtime 17.39s / 22.73s. At step 500, joint/modular class accuracy was .488/.463 (macro-F1 .339/.314), relation-fact macro-F1 .796/.427 over 88 candidate-covered facts, and group precision/recall/F1 was 0/0/0 for both despite 100% grouping candidate recall. Recomputed supervision has 84 positive and 500 negative spatial candidate pairs (584 total; 14.38% positive), while the broader all-known set has 84/1,608 positives (5.22%). Group BCE decreased but both decoders produced no positive edges after update 10. Class loss declined 1.906→1.254 joint and 2.047→1.422 modular; finite nonzero gradients and parameter changes confirm updates occurred. The model learned multiple relation classes but did not meet the predeclared near-perfect memorization gates. Candidate imbalance remains a testable grouping mechanism, not a confirmed sole cause; class underfit remains unresolved.
- V1 checkpoints are preserved under `experiments/joint_canvas/model/runs/crohme-overfit-train-only-v1/`: joint SHA-256 `4de53540a6bacfdd56015ee62cc2e17bc1786bcf9e958fd1e30cecc8afafaa76`; modular `225885d7e2f15aeb1daa518429f63f4b9ae646cd514593a3595a37850a23b38d`; metrics `5f4200c53750a45806c556496238e69633598610d9eb49bfd092d4facea4afbd`. Independent review confirmed source/data hashes and computed output hashes, but V1's `run.json` lists outputs without hashing them and remains `prepared` while `metrics.json` says `completed`. V2 will use an exclusive completion sidecar with output hashes. V1 was not modified.
- V2 changes only supervised-candidate grouping BCE weights, with the corrected support of 84 positive / 500 negative / 584 candidate pairs (weights 3.47619/.584); the separate all-known set is 84/1,524/1,608. After 500 updates, joint grouping P/R/F1 is .302/.690/.420 (58 TP, 134 FP, 26 FN); modular is .204/.476/.286 (40 TP, 156 FP, 44 FN), both at 100% candidate recall. Against V1, joint/modular class accuracy and macro-F1 improve from .488/.339 and .463/.314 to .537/.402 and .512/.368. Relation-fact macro-F1 is .796 joint and .826 modular. Both models now emit positive group edges, but practical F1≥.50 and all strict overfit criteria still fail. The balanced group loss retains the same per-scene candidate-count normalization; its global class weights need not give each scene exactly equal positive/negative contribution.
- V2 used 500 CPU updates/model, 7.99s/8.32s wall time, no GPU, and minimum free RAM 2.57 GiB. Its run `crohme-overfit-train-only-v2-balanced-group-20261112/` includes raw logs, checkpoints, and a completion sidecar; every output hash independently verifies. Joint/modular checkpoint hashes are `ec117f23946ac036ad92fffda63fdb3179624fbacd216e51f4774aac1286b3f7` / `65642d4aaa97f5eedeb722196e96b10a81a668ef52d2ea978070d6a36b917774`; metrics hash is `5d146e86489a9129313de0005809e61ad6880d7c351fb09f9931d47bc7ecfe3a`. Independent evaluation recomputed the saved metrics exactly and confirmed V1/V2 data, initialization, parameter-count, seed, and schedule matching. The imported `train_cpu.py` hash is not repeated in V2 metadata but matches the run04-pinned source (`f05ede078d169e01315336bd10e32e39f0166475159289939e8a8740fecf5a3e`).
- The V2 grouping update's class/group/relation head gradients matched finite differences for both candidates (maximum absolute error <1.14e-10); the existing model suite passed 22/22 tests. V2 loss curves continued falling through update 500 (joint class 1.898→1.281, balanced group .688→.602, relation 1.261→.429; modular class 2.022→1.275, balanced group .730→.644, relation 1.560→.465). This motivates one bounded continuation to test optimization saturation; it does not establish generalization.
- Official source pages confirm MathWriting is CC BY-NC-SA 4.0 and CROHME is research/academic-only with no commercial use; CROHME's exact Creative Commons version remains unspecified. The official pages are `https://github.com/google-research/google-research/tree/master/mathwriting` and `https://www.isical.ac.in/~crohme/CROHME_data.html`. The current pilot is within those limits; keep source IDs, archive edition, transformations, and dataset hashes with every checkpoint.
- V3 is a train-only continuation from the verified V2 checkpoints for exactly 1,500 additional updates/model (2,000 total), with the same data, balanced candidate weights, schedule repeated deterministically, model, optimizer, LR, and threshold. The evaluator independently verified lineage, schedules, all output hashes, and final metrics. At step 2,000, joint class accuracy/macro-F1 is .732/.607, group P/R/F1 .376/.905/.531, and conditional relation macro-F1 1.000; modular is .829/.803, .548/.952/.696, and 1.000. Both models continue to improve through step 2,000 but miss strict class and grouping precision gates. The eight source rows contain only four unique exact-content expressions duplicated across CROHME editions; this is repeated-subset memorization evidence, not eight independent examples and not generalization evidence. Both candidate models have 441 parameters; CPU runtimes are 35.00/38.45s and minimum free RAM 2.70 GB; GPU use is zero. V1–V3 outputs remain immutable.

### Next bounded experiment: FULLPASS-01

- Hypothesis: the run04 collapse is at least partly due to seeing only 100/1,808 training rows; the tiny-set curves show trainability, while V2/V3 show candidate-balanced BCE can recover grouping predictions. Compare this against the unweighted objective over one source-deduplicated pass before changing representation or architecture.
- Prototype review owns only `experiments/joint_canvas/model/run_fullpass_01.py` and a new `runs/crohme-dedup-fullpass-20261112-01/` directory in the isolated model worktree. Evaluation review will independently verify it; the coordinator owns this document. No overlapping file edits.
- Four CPU-only fits: joint/modular models crossed with unweighted/balanced candidate-group objectives. Each receives the same 1,074 unique training contents, one deterministic shuffled pass (1,074 updates), seed 17, LR .03, model/features/parameter budget, and initialization within an objective arm. Balanced weights derive only from deduplicated train candidate labels. Preflight requires at least 1 GiB free RAM; no GPU or provider requests.
- Deduplicate train and validation independently with the pinned content signature, retaining lexicographically smallest scene ID. Evaluate validation once at the fixed 0.5 threshold on both raw 451 rows and 264 unique contents. Do not inspect test data, tune from validation, or select thresholds.
- Record per-class precision/recall/F1, accuracy/macro-F1/balanced accuracy, grouping pairwise scores and cluster purity/completeness when supported, conditional relation typing and candidate coverage, calibration, latency, RAM/VRAM, raw update logs, source/evaluator hashes, checkpoints, and completion hashes. Mark relation existence, general scientific claims, and OOD as unsupported by CROHME rather than implying coverage. Pipeline status and model quality status remain separate.
- Decision rule: if the balanced objective changes train grouping but fails to improve deduplicated validation macro-F1/group F1 or worsens group-edge calibration, preserve it as a train-only finding and move next to a geometry-versus-resampled-trajectory representation ablation on the same frozen split. No production integration from this run.

### FULLPASS-01 measured outcome (2026-11-12)

- Run directory: `experiments/joint_canvas/model/runs/crohme-dedup-fullpass-20261112-01/`; runner: `experiments/joint_canvas/model/run_fullpass_01.py`. Completion status is pipeline `completed`, model quality `pending_independent_review`. Coordinator verified all 15 output hashes in `completion.json`; no prior runs or production files were changed. Raw candidate-level predictions are preserved at approximately 52 MB per fit; the full artifact directory is 214,932,627 bytes. Total process wall time was 124 s; the four fits took 7.89, 7.95, 8.41, and 8.37 s. CPU only, 1,074 updates per fit, and at least 3,231,297,536 bytes free RAM observed. Peak process RSS is unavailable because `psutil` is not installed; no dependency was added.
- Exact-content split counts are 1,808→1,074 train and 451→264 validation. Train/validation exact content, source family, and expression template overlap are all zero; 44 writers overlap, so this is not writer-OOD evaluation. No official test records were opened. Every fit used the same 1,074-scene shuffled order, seed 17, LR .03, 1,048 active parameters, 75 train-derived classes, eight train-derived relation types, and seven geometry features. The joint and modular architectures matched parameter count exactly. Candidate-balanced group weights were derived from deduplicated train labels only: 7,294 positive / 64,143 negative of 71,437 candidates (10.21% positive), weights 4.89697/.55686.

| Fit | Dedup validation class acc / macro-F1 / balanced acc | Classes with recall / 55 | Group P / R / F1 | Conditional relation acc / macro-F1 | p50 / p95 latency |
|---|---:|---:|---:|---:|---:|
| Joint, unweighted | .1846 / .0151 / .0361 | 4 | undefined / .0000 / .0000 | .6979 / .2104 | 5.20 / 7.62 ms |
| Joint, balanced group | .1940 / .0170 / .0392 | 5 | .2255 / .6782 / .3385 | .6966 / .2064 | 5.42 / 7.65 ms |
| Modular, unweighted | .1905 / .0149 / .0364 | 3 | .2500 / .0005 / .0009 | .6970 / .2093 | 5.24 / 7.39 ms |
| Modular, balanced group | .1883 / .0142 / .0363 | 3 | .2127 / .8382 / .3393 | .6995 / .2157 | 5.27 / 7.57 ms |

- The training majority class is `+`. A constant-majority validation classifier scores .1772 accuracy, .00547 macro-F1, and .0182 balanced accuracy on the deduplicated view. Best trained class accuracy is only 1.69 points above that baseline; macro-F1 is still 0.0170, with only 5/55 labels recalled. Independent review found the models predict `x` for 59–74% and `-` for another 23–25% of strokes, rather than the train majority `+`; this is a wrong-class collapse, not evidence that prior frequency alone explains the failure. Recognition remains poor and does not meet the project success criterion.
- Candidate-balanced grouping changes validation edge F1 from 0/.00095 to .3385/.3393, with direct edge precision .2255/.2127 and recall .6782/.8382. It helps grouping beyond the run04 frozen 0/.00632 baseline but produces many false positive edges; group candidate ECE is .333–.377 and Brier .196–.226. Unweighted group ECE is only .012–.028 with direct F1 near zero; class ECE is .010–.031 despite wrong-class collapse. These scores show that calibration and useful recognition must be reported separately.
- The empty-edge unweighted systems still score B-cubed F1 .8055–.8057 (raw baseline .7972) because thousands of singleton clusters dominate this aggregation; direct pairwise edge F1 is 0/.00095. Aggregate exact-set scores are also lifted by singleton groups. B-cubed is secondary here and cannot be read alone as successful grouping. Balanced systems score B-cubed F1 .4989/.2741, mean cluster purity .7292/.5701, and mean gold-group completeness .9649/.9937. Direct candidate-edge P/R/F1 is primary; exact non-singleton member-set metrics are missing and should be added before the next broader benchmark.
- Conditional relation accuracy is .6966–.6995 and macro-F1 .2064–.2157 over 3,102 covered positive facts on deduplicated validation, compared with run04 deduplicated macro-F1 .10098. Candidate recall is .900 for any expanded pair and .865 for all expanded directional pairs; 344 positive relation facts lack any candidate pair and are excluded from type scoring. These are positive-only, teacher-forced MathML-projected relation types; relation existence and scientific-claim support remain N/A. CROHME still covers handwritten mathematical ink, not broad STEM canvas interpretation.
- Losses fall through the pass: first-100→last-100 mean class loss is 4.19→3.25 joint balanced and 4.19→3.33 modular balanced; relation loss is 1.28→.77 and 1.30→.79 respectively. Balanced group loss is weighted and therefore not directly comparable with unweighted BCE. The one-pass result cannot distinguish remaining undertraining from the seven-scalar geometry representation limit; a read-only data representation audit is assigned before the next bounded experiment.
- Contract note: `run.json` remains `prepared` and its `outputs` field lists only five summary files, while metrics/completion report `completed` and `completion.json.output_sha256` is the authoritative exhaustive list of 15 verified artifacts, including raw per-fit logs, checkpoints, and validation predictions. The independent evaluator confirms this is nonfatal because every artifact is hash-covered; keep the distinction explicit and do not rerun merely to rewrite these fields.

Independent evaluation passed: all deterministic metrics replayed with zero mismatches for four fits on raw and deduplicated validation; only timing fields vary. The scorer, schedule, split, weights, and checkpoint hashes also matched. Pipeline status is verified; model quality remains insufficient. Keep all checkpoints experimental and disconnected from Tutor.

### TRAJ-ABLATION-01 staging

- The read-only source audit found that official training InkML retains ordered trace tuples, but `prepare_crohme_train.ps1` reads only tuple fields 0 and 1 as x/y, computes seven scalar features, and drops the points. Prepared v3 nodes retain source trace IDs, bounds, and features; raw trajectories are absent. `<traceFormat>` is not interpreted, so pressure/time channels are unverified and will not be used. Group annotations remain linked to source trace IDs; relation labels remain deterministic MathML projections, and unlinked groups are not inferred.
- The next hypothesis is representational: the current seven scalars retain direction/shape summaries but omit trajectory shape. A new isolated sidecar will preserve v3 unchanged and key 16-point arclength-resampled x/y sequences by exact scene/source IDs. The same 39-D input shape will support geometry-only, trajectory-only, and combined masks, so the three input conditions share model size and schedule. Visual-only screenshots are not represented in CROHME and are deferred.
- Prototype review owns only the new trajectory-preparation/training scripts and `runs/crohme-trajectory-ablation-v1-20261112-01/`; no v3 file or production path may change. It will verify all trace IDs, labels, and split provenance, use the deduplicated source-level split, train the six matched joint/modular × feature-condition fits for three fixed passes with the same train-derived balanced grouping objective, then evaluate raw and deduplicated validation once at the fixed threshold. Test stays unopened; CPU/RAM and completion-hash gates remain active.
- The independent evaluation specialist audited TRAJ-ABLATION-01 before training: pinned source and sidecar hashes, exact scene/source trace-ID maps, finite 32-value vectors, and zero content/source-family/template overlap all pass; no test payload was opened. They approved an exploratory trajectory-feature ablation under a shared spatial scaffold. They rejected any claim of geometry-independent trajectory recognition or broad STEM generalization. The per-fit nominal parameter match is exact, but zero-masked feature channels have gradient-inactive input weights; report this limitation.
- Final preflight passed: 1,074 deduplicated train scenes, 264 unique validation scenes (451 raw), 3,222 updates per fit over the same shuffled order repeated for three epochs, 4,600 nominal parameters for both candidates, 99/382 maximum train nodes/candidate edges, and 45/165 validation maxima. CPU-only; free RAM measured 2.90–3.26 GB, free disk about 70.35 GB, estimated outputs 256 MiB plus a 64 MiB reserve. On the user's request to stop, the run ended with four completed fits (geometry-only and trajectory-feature/shared-scaffold, joint and modular; 3,222 updates each), one combined-joint fit partial at 2,000 updates without a checkpoint, and combined-modular not started. No validation scoring ran and no test data was accessed. Coordinator rehashed all 22 artifacts listed in `interrupted.json` with zero mismatches. This is an interrupted checkpoint, not a completed evaluation; resume only in a new versioned run from combined-joint update 1. Production Tutor and providers remain unchanged.
- Prototype source hashes at authorization: preparation `e96d3555…e4d94500`; trainer `9fbb3309…5a17e7a`. The preparation script sits under the existing `.gitignore` `data/` rule and is ignored; no ignore rule was changed. Preserve this state visibly during integration so the adapter is not lost while dataset artifacts remain ignored.

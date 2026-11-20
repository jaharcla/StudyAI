# StudyAI MK3 — Second-Pass Architecture Research: Joint Ink, Objects and Relationships

**Research snapshot:** 2026-11-12  
**Scope:** Read-only research and a new report. No application code, dependencies, checkpoints, benchmark data or model weights were changed, installed, downloaded or trained.

## Decision

The first report's modular recommendation is a sound baseline, but it should no longer be the only serious candidate. Research now supports a falsifiable joint-learning experiment: learn stroke grouping, stroke/object categories and relations from one sparse, edge-aware graph. SpaceGTN is the strongest published fit for the missing-timestamp and edited-board constraint; EGAT and structural HMER show that grouping, symbol classification and relation prediction can share graph features and losses.

**Recommended research candidate:** a spatial-first heterogeneous graph with stroke nodes, typed native-object nodes, sparse geometry-derived candidate edges, and joint heads for ink grouping, categories and relations. Use SpaceGTN's time-agnostic spatial graph construction and per-stroke visual feature path as optional components; use EGAT-style node/edge feature updates and shared losses. Keep deterministic object facts, IDs and source references outside model authority. Keep Architecture A as the matched control.

This does not justify replacing OCR, existing geometry or Tutor reasoning yet. The papers establish joint predictions in narrow handwritten-math or diagram domains, not arbitrary StudyAI STEM scenes. The best outcome may still be a hybrid where the model handles ambiguous perception and associations while deterministic code retains known canvas facts.

## What changed from the first report

The [first feasibility report](2026-11-11-custom-multimodal-canvas-feasibility.md) recommended separate ink/object encoders followed by a graph-fusion head. This pass adds three material findings:

1. **Joint grouping and classification are demonstrated.** SpaceGTN classifies strokes and predicts same-symbol edges without timestamps. EGAT jointly predicts stroke labels and edge labels, including the same-symbol grouping relation, although its published HMER graph also uses writing order.
2. **A complete source-linked symbol graph is practical in math.** CROHME and the structural-HMER work connect stroke groups to symbols and 2-D relations, which is closer to editable source evidence than a LaTeX-only answer.
3. **The joint models remain domain-specific.** SpaceGTN covers flowcharts, mind maps and automata; EGAT and structural HMER cover mathematical expressions. Neither has demonstrated typed native StudyAI objects, scientific roles, or cross-tool graph construction.

The first report correctly emphasized deterministic canvas data, source provenance, staged replacement, bounded local models and a modular control. The new research changes the next experiment, not those safety constraints.

## Current StudyAI workstreams

Both named Codex threads remain active. I inspected their current status snapshots and did not access or modify their files.

- **“Audit StudyAI scene architecture”** has completed the bounded methane A–D feasibility run: A current Analyze Board; B full-scene image; C image plus original strokes; D image, strokes and deterministic geometry. It used exactly eight Groq requests, and its source-immutability check passed. The task is extracting per-condition OCR/scene outputs and its evaluation record, then running a post-change regression suite and confirming the original database hash. Until those outputs are reviewed, no condition-level result is established. This is an architectural-input experiment on one board, not a benchmark of handwritten chemistry or mixed STEM readiness.
- **“Benchmark canvas analysis with datasets”** is driving seven editable canvases through the live analysis path: six MathWriting trace sources and one PhysAlign reconstruction. A preliminary MathWriting request returned HTTP 200 but only recognized “L”, “2” and “(”, omitted 13 regions, and interpreted equation strokes as generic shapes. That first timing was a 17 ms cache hit, so the task restarted the local app to clear in-memory recognition caches before a comparable cold run; it is also checking the next-canvas transition. These are current-pipeline observations, not training or learned-model results.

These results make a source-linked joint model worth testing, but they must not be mixed with its training data or treated as final scores. The seven seeded canvases are a small UI/pipeline harness, not enough data to train or claim generalization.

## 1. What the research demonstrates

### EGAT: joint stroke and edge prediction

The 2026 Pattern Recognition paper, [Local and Global Graph Modeling with Edge-weighted Graph Attention Network](https://doi.org/10.1016/j.patcog.2026.113410), represents each ink stroke as a graph node. Node features encode the stroke shape; sparse edges encode candidate spatial relationships based on line-of-sight between stroke convex hulls. Edge embeddings are updated along with node embeddings: attention uses edge information, node messages aggregate edge features, and edge messages use both endpoint nodes and the edge. Shared graph layers feed separate node and edge classification heads.

The HMER target is unusually useful for StudyAI: node classes are symbol labels; edge classes include mathematical relations, a “same symbol” relation and a “no edge” label. Thus stroke grouping and symbol classification can be predicted in the same forward pass as relations. A master node supplies global expression context. This is real joint multi-task learning, rather than separate recognition followed by a post-hoc linker.

The published model is still specialized:

- Its symbol vocabulary contains 101 CROHME classes and its relation set is mathematical, with six relation types. It has no generic “unknown object”, scientific role or typed native-object node.
- It treats relation direction partly through writing order. Its graph uses LOS+t: line-of-sight plus temporal adjacency. Relation orientation is mapped relative to stroke order. Historical StudyAI boards must not invent that order. A StudyAI version must remove temporal adjacency and derive relation direction from geometry or predict a symmetric candidate relation plus explicit endpoint roles.
- Candidate topology is a prior. The EGAT readout labels edges already present in its candidate graph. If the right pair is not proposed, the model cannot recover that relationship. Candidate-edge recall therefore needs its own metric.
- The model uses closed-set softmax classes. Ambiguity requires an explicit unknown/abstain option, calibrated scores and possibly multiple alternatives; ordinary softmax is not open-set recognition.
- CROHME results do not establish recognition of diagrams, equations mixed with native objects, or physical roles.

The paper reports GGM-EGAT exact expression recognition of 55.30% on CROHME-2023 test and 60.72% on CROHME-2019 test; its publisher summary reports 93.21% symbol detection and 93.45% relation classification on CROHME-2023. These are math-benchmark metrics, not canvas-scene accuracy. The training setup uses a single RTX 2080 Ti, PyTorch Lightning, 32 examples per batch, up to 16 strokes per local sub-expression and five 512-dimensional EGAT layers. The paper does not report parameter count or peak memory.

**Code and weights:** the 2026 paper says its implementation is public and the authors have a [GGM-EGAT GitLab project](https://gitlab.univ-nantes.fr/E19B516G/ggm). The project page is public, but its file contents and license were not exposed by the available public page fetch; no standalone pretrained checkpoint or weight-use terms were verified. The paper says data are available on request. Treat code reuse as uncleared until the actual repository license and model assets are inspected.

The GitHub repository named in the brief, [ntcuong2103/math_online_egat](https://github.com/ntcuong2103/math_online_egat), is **not the same implementation**: its README identifies a Nguyen et al. ICDAR-2024 paper. Its pipeline first uses a BLSTM to segment/classify symbols, constructs a symbol-level graph with a 2-D CYK parser and LOS, then uses EGAT to prune/recover symbol links. EGAT is not jointly learning raw-stroke grouping and recognition there. It requires prepared CROHME JSON, LG and InkML data; lists PyTorch, DGL, PyTorch Lightning, wandb and standard Python packages; and says Python 3.8+. The repository page exposes no LICENSE file or Releases/checkpoint. Do not copy it into StudyAI until licensing is resolved. It is useful as a separate link-prediction reference, not a ready model for the proposed joint system.

### SpaceGTN: strongest fit for time-agnostic ink

[SpaceGTN, AAAI 2024](https://doi.org/10.1609/aaai.v38i3.27994) explicitly removes timestamps from its model inputs. Each stroke is a node, with 2-D geometry features and a per-stroke raster/image feature channel. A dynamic spatial graph adds nearby and shape-similar connections, including strokes that are far apart. A PNA convolution aggregates geometry features; an attention convolution processes stroke images; spatial and edge encodings bias graph attention. The model predicts stroke classes, same-symbol versus different-symbol edges, and a diagram-level category. The same-symbol edge output provides grouping supervision.

This matches StudyAI's persisted-board problem better than a model whose neighbor graph relies on draw order. SpaceGTN's authors explicitly motivate its time-agnostic design with notes that have been edited, moved, erased and redrawn. Its output is still source-linkable because every graph node corresponds to an input stroke index; StudyAI would preserve the mapping from input index to immutable QuickDraw stroke ID.

Paper results: 98.13% stroke-classification accuracy on CASIA-OHFC and 99.78% on OHSD, with 95.54 symbol-recognition F1 on OHSD. These are not complete-scene or cross-tool scores. OHSD contains 10,000 free-drawn structural diagrams: 4,900 flowcharts, 3,100 mind maps and 2,000 automata. It annotates stroke category, symbol ID and stroke modifications; around 70% of diagrams have modified strokes. These data stress temporal reordering well, but do not cover physics, chemistry or math-rich mixed-tool boards.

SpaceGTN already uses both vector geometry and stroke image patches. Therefore “spatial-only” versus “visual” is not a clean split between the paper's architecture C and D. The useful StudyAI ablation is **which visual channel** helps: no raster features, small per-stroke crops, or a low-resolution whole-board/region image. Per-stroke images maintain source mapping; whole-board images supply layout and overlap cues but have weaker direct identity alignment.

**Code and weights:** the AAAI paper has no code/checkpoint URL or parameter count, and none was verified. It says OHSD will be publicly released; I did not verify an official download or license. Plan to reproduce the relevant spatial graph ideas and collect/license-check the dataset before depending on it.

### T-OHS: valuable spatial encoding, temporal dependency

[T-OHS, Pattern Recognition 2024](https://doi.org/10.1016/j.patcog.2023.110131) is a transformer for stroke classification on handwriting, diagrams and sketches. It models relative temporal order (RTE), coarse relative spatial layout (RCSE), and fine relative spatial layout (RFSE) using polar-coordinate regions. It evaluates five online datasets across document layout, diagram recognition and sketch segmentation.

The coarse/fine spatial encodings are candidates to test inside a StudyAI stroke encoder. Its temporal encoding cannot be used for persisted boards with missing or invalid cross-stroke chronology; simply deleting RTE is an unvalidated model change and needs retraining. T-OHS predicts stroke categories, not a full typed relation graph with explicit native object nodes. I found no official code or pretrained weights.

### Structural HMER: trace-linked output, with label and domain limits

[The Return of Structural Handwritten Mathematical Expression Recognition](https://arxiv.org/abs/2508.19773) turns raw traces into a Stroke Label Graph (SLG), mapping stroke groups to symbol classes and 2-D math relations. It combines graph-based trace sorting, a CNN/RNN symbol classifier, transformer correction and separate relation prediction. It also releases [CROHME+](https://doi.org/10.5281/zenodo.14968570) and [MathWriting+](https://doi.org/10.5281/zenodo.15091575), adding trace groups and MathML relations to parts of the underlying data.

Its main contribution for StudyAI is the source-linked representation and task-specific supervision, not a general heterogeneous architecture. The model's own paper lists a 1:1 trace-to-symbol assumption, difficulty with shared traces/cursive words, limited symbol coverage, and retraining needs for new symbol/relation types. It is mathematical notation, not a general semantic scene parser.

Use its results carefully. The paper reports 74.14% CROHME-2023 expression accuracy on the test comparison, but its validation table reports 82.77%; intermediate section results and that table also contain unreconciled metric differences. The data-labeling model is trained and filtered within the same CROHME label ecosystem, so pseudo-label quality should be independently audited before those labels are treated as ground truth. No official code or model checkpoint was verified.

The official [CROHME data page](https://www.isical.ac.in/~crohme/data2.html) is particularly valuable because InkML links raw traces, symbol-level trace groups, MathML and expression labels. However, the structural-HMER paper reports that much of CROHME-2023 training lacks MathML or reliable trace groups. CROHME+ extends the available structural labels but is auto-annotated data with non-commercial/share-alike terms.

### Other relevant methods

- [Graph-to-Graph HMER, AAAI 2021](https://doi.org/10.1609/aaai.v35i4.16399) jointly maps stroke primitives to a markup graph with subgraph attention and explicit segmentation. It supports the value of graph-to-graph source alignment, but the output ontology is math-specific; I did not verify reusable code or weights.
- [Edge Pooling Attention Networks](https://doi.org/10.1016/j.patcog.2021.107859) jointly train text/non-text stroke classification and text-line grouping as node classification plus clustering. They use temporal and spatial graph features on IAMonDo and Kondate. This is evidence that joint tasks can reduce sequential error accumulation, but its chronology dependence and document-layout classes do not solve StudyAI STEM relations.
- [Instance GNN](https://doi.org/10.1109/TMM.2021.3087000) jointly targets symbol segmentation/recognition in online diagrams with node and edge tasks. SpaceGTN compares against it and shows why a time-independent alternative matters for modified or timestampless drawings. No reusable code/checkpoint was verified here.
- [R-GCN](https://arxiv.org/abs/1703.06103) and [Heterogeneous Graph Transformer](https://arxiv.org/abs/2003.01332) provide established patterns for typed nodes and typed relations. They are generic graph encoders, not canvas recognizers. A full web-scale HGT is unnecessary; a small relation-aware message-passing layer is enough for a sparse scene graph.
- General sketch models from the first report (Sketchformer and Multi-Graph Transformer) remain possible frozen-embedding controls, but their category/retrieval objectives do not supply relation or source-grounding labels. No existing checkpoint spans arbitrary StudyAI handwriting and mixed STEM objects.

## 2. Architecture comparison

| Design | What it learns | Demonstrated fit | What StudyAI must add | Main risk |
|---|---|---|---|---|
| **A. Separate encoders + graph fusion** | Ink/text encoder and native-object encoder run separately; small graph model predicts associations and relations. | Most maintainable control; can reuse handwriting/math/sketch components and preserve clear ablations. | Source-linked stroke groups, candidate associations, uncertainty, cross-tool labels. | Recognition errors cascade; pre-trained encoders may not represent online traces or STEM writing. |
| **B. Joint heterogeneous EGAT-style graph** | Stroke and native-object nodes exchange edge-aware messages; shared features feed node, grouping and relation heads. | EGAT shows joint node/edge labels; R-GCN/HGT show typed graph patterns. | Time-independent candidate graph, object schemas, unknown classes, cross-tool labels and explicit ID mapping. | Sparse candidate misses and scarce relation labels; large ontology can overfit. |
| **C. SpaceGTN spatial stroke encoder + hetero fusion** | Time-agnostic stroke geometry and optional stroke raster features learn grouping/class labels; output feeds typed object fusion. | SpaceGTN directly demonstrates timestamp-free segmentation on modified diagrams. | Add native nodes and STEM relation heads; adapt from 3 diagram families. | No public weights/code verified; diagram labels do not transfer to physics or chemistry. |
| **D. Lightweight multimodal visual features** | Vector strokes, typed objects and selected raster evidence are jointly represented. | SpaceGTN shows stroke raster patches can complement geometry. | Pixel-to-source links, image/crop consistency, cache/bounds and additional mixed-scene labels. | Full-board raster loses direct stroke identity, costs more memory, and can duplicate already exact vector facts. |

### Capability and engineering assessment

- **Grouping:** B/C can predict same-object edge labels directly. A may group with a specialist recognizer or clustering head. None handles arbitrary shared-stroke membership automatically; model it as a set/assignment if labels require many-to-many membership.
- **Symbol recognition:** MathWriting/CROHME support equation symbols. SpaceGTN supports diagram symbol categories. Neither transfers a complete vocabulary of handwritten physics/chemistry marks. Keep an OCR/math specialist baseline until StudyAI-held-out results justify replacement.
- **Native object understanding:** all published ink models lack StudyAI object nodes. Native IDs, properties and graph samples should be deterministic node features. The model should learn which objects relate, not re-read stored values from pixels.
- **Relationships and scientific roles:** EGAT/HMER supports symbol-layout relations; SpaceGTN primarily classifies diagram symbol membership and categories; PhysAlign isolates physical-role association on images/text but not vector ink. Cross-tool role correctness must be StudyAI-labeled.
- **Source attribution:** strongest when node IDs are the original stroke/object references and every predicted edge carries those endpoints. Image regions must be rendered from the authoritative saved board and map back to IDs; user-supplied crops alone do not prove that mapping.
- **Ambiguity:** use top-k hypotheses, unknown/abstain outputs and calibrated confidence. Do not force the nearest known symbol/type. Relation constraints can rule out impossible edges but should not turn unobserved facts into truth.
- **Data and maintenance:** A can reuse narrow recognizers and freeze features; B/C need StudyAI-specific relation labels but share one graph authority. A small joint graph is cheaper to maintain than many independent rules only if source schemas and relation labels are versioned. D adds an encoder and rendering contract.
- **Recommendation:** compare A against **B+C**, where the second candidate is a time-agnostic spatial stroke encoder feeding a sparse heterogeneous edge-aware graph. Treat D as a per-stroke-image ablation within B+C, not the sole alternative.

## 3. Recommended StudyAI representation

Keep an immutable source ledger and create an inference graph for each saved revision.

### Source ledger

- Existing QuickDraw stroke ID, exact point sequence, optional pressure and current transformed coordinates.
- Native object ID, type, numeric/text fields, units, geometry and explicit anchors/links.
- Canvas revision/hash and transformations needed to prove the features belong to that board version.
- No synthesized timestamp. Point order inside one stroke may describe its curve, but it does not recover order between different strokes.

### Inference graph

- **Stroke nodes:** source stroke ID; bounded point samples; normalized geometry; shape descriptors; optional pressure with missingness mask; optional per-stroke raster crop.
- **Native nodes:** source object ID, schema/type, deterministic properties, unit features, bounds, rotation, z-order and explicit edges. Encode object types by descriptors plus an unknown type, not by reinterpreting raw JSON text.
- **Latent group nodes:** proposed groups refer to sets of original stroke IDs. They are ephemeral hypotheses, not authoritative canvas objects.
- **Candidate edges:** explicit native links; stroke proximity/alignment/overlap/containment; stroke-to-native-object association candidates; candidate group membership; label/annotation links. Include relative geometry, edge type and whether the edge was observed, deterministic or only proposed.
- **Global context:** a scene node or pooled summary gives long-range context without connecting every stroke to every other stroke.

Use sparse candidates: spatial bins, nearest neighbors/LOS and top-k feature similarity, plus selected cross-type candidates. Bound node counts, edge counts and feature arrays before model work. Measure candidate-recall separately; a classifier cannot predict an edge omitted from the candidate set.

A practical joint objective has masked losses for stroke category, same-group edges, typed relations, role labels and source-grounding. Unlabeled pairs are “unknown/unobserved”, not automatic negative relations. The output returns the saved revision, source IDs, candidate edge endpoints, type, confidence and evidence. Only deterministic data can create authoritative object identities; user confirmation is required before any model proposal edits the board.

## 4. Dataset and supervision plan

| Source | Useful supervision | Gaps and restrictions |
|---|---|---|
| **CROHME / CROHME+** | Raw online math traces, trace groups, symbol labels, MathML/SLG relations. Strong test bed for grouping and 2-D math structure. | Narrow math vocabulary; CROHME annotations are incomplete. CROHME+ includes auto-labels and is CC-BY-NC-SA 3.0; keep official tests isolated. |
| **MathWriting / MathWriting+** | Genuine vector math strokes with LaTeX; the official dataset is about 2.9 GB and offers a 1.5 MB excerpt. MathWriting+ adds structural trace groups/MathML for selected samples. | Original MathWriting does not give comprehensive symbol-group/relation labels. MathWriting data is CC-BY-NC-SA 4.0; MathWriting+ also has non-commercial/share-alike terms. Pseudo-labels need independent audits. |
| **OHSD / SpaceGTN** | Free-drawn modified diagrams, stroke categories, symbol IDs and edit noise; best stress source for time-agnostic grouping. | Flowcharts, mind maps and automata are not STEM scenes. Paper's dataset release promise is not a verified current download/license; no model checkpoint found. |
| **IAMonDo / IAM-OnDB** | Online pen traces and broad document stroke categories; IAMonDo has text, drawing, formula, table and list labels. | Layout categories do not encode physics roles or rich tool-to-tool relations; non-commercial research conditions apply. |
| **PhysAlign** | Localized text/image evidence and physical-role association probes. A useful evaluation template for “read it correctly, assign it to the right object.” | Not digital ink or stroke grouping. The paper site currently labels its code/data “coming soon”; the surfaced Hugging Face card uses a composite “other” license and says its release is not independently human-quality-certified. Resolve exact version and terms before supervised use. |
| **Quick, Draw!** | Large vector shape pretraining and geometric diversity. | Coarse prompted classes, no symbol groups or scene relations; archived dataset and license/terms should be checked for intended use. Not a STEM relation corpus. |

### Mixed-tool scene generation

Use real source traces and deterministic StudyAI objects in the same editable board. Each source relationship needs explicit provenance:

- Preserve original MathWriting/CROHME trace IDs and sample split in sidecar metadata. Map every canvas stroke back to its source trace ID and point range.
- Add real StudyAI object IDs for native arrows, vectors, graphs, equations, springs, atoms/bonds and measurements. Store exact values separately from rendered labels.
- Author scene graphs as source truth, then render the board. Do not place relation labels, target IDs, annotations or answer-bearing alt text in model-visible payloads.
- Transform geometry with relation-aware rules: rigid translation/rotation; scale with unit-aware value handling; independent repositioning that deliberately creates ambiguous label-to-object associations; overlap and occlusion; stroke reordering; move/erase/redraw edits; duplicated distractors; unseen type combinations.
- Make physically valid counterfactual pairs: e.g. same label moved from one vector to another, force arrow direction changed with its vector components, graph axes scaled with units, or a chemistry label detached from a bond. Compute or review changed truths instead of copying labels blindly.
- Split by writer, original source expression/problem, parent diagram, generator/template and transformation family. Keep an entire source family in one split. Hold out complete object combinations and at least one writer/template source.
- Keep inferred, auto-generated and human-reviewed labels distinct. Audit a stratified subset with STEM reviewers and retain disagreement/alternatives.

The seven canvases in the active dataset thread are useful integration fixtures, not training ground truth. The current MathWriting pipeline result already demonstrates why task-level tests need OCR, grouping, grounding and relation metrics separately.

## 5. Local feasibility

The previous hardware audit recorded an MSI Raider GE66, i9-12900H, 8 GiB RTX 3070 Ti Laptop GPU and 16 GiB RAM. Python 3.10.11 was already installed; PyTorch, TorchVision and Transformers were not. This task installed nothing.

These are planning envelopes, not measurements:

| Workload | Laptop outlook | Assumptions / limits |
|---|---|---|
| **Sparse graph head, 1–10M parameters** | Realistic for training and inference. | 2–4 layers, 128–256 hidden dimensions, <=500 nodes and <=10k candidate edges per scene, batches 1–8, cached/frozen features. Estimated ~1–3 GiB VRAM for the graph portion; CUDA/PyTorch overhead and visual features add headroom. Measure peak memory in a short pilot. |
| **Joint node/edge EGAT with per-stroke small CNN** | Plausible at small batches. | EGAT's published design trained on an RTX 2080 Ti with batch 32 and local subgraphs capped at 16 strokes; the global variant and StudyAI graph size differ. Use sparse candidate edges, batch 1–4 and bounded node/edge counts. Do not assume the paper's batch transfers to this laptop. |
| **Frozen stroke encoder + cached embeddings** | Best initial cost profile. | No SpaceGTN checkpoint was verified. Sketchformer/MGT from the first report can serve as controls only; test input compatibility and license first. Cache only versioned features tied to exact strokes. |
| **Fine-tune last layers of a small stroke/CNN encoder** | Likely feasible with short sequences/crops and batch 1–4. | No applicable pretrained encoder with verified weights was found. Start with a shallow per-stroke CNN or vector encoder; avoid training a large vision backbone from scratch. |
| **Selective raster features** | Feasible if restricted to stroke crops or bounded board tiles. | Use 32–128 pixel stroke crops or a 512-pixel scene thumbnail; cache image features. Full-resolution board encoding duplicates vector input and can raise activation memory. |
| **3B QLoRA VLM** | Borderline on 8 GiB; not needed for this model. | Previous audit estimated ~6–8 GiB at short context/batch 1. Vision tokens and activations can exceed the budget. |
| **7–8B QLoRA / 4B VLM fine-tuning** | Not a practical local target. | Previous audit found ~10–14 GiB for 7–8B QLoRA; vision adds more. Cloud is optional, not required for the graph experiment. |

Prefer cached stroke features plus a small sparse relation model. Avoid dense all-pairs attention: for N strokes it creates N² candidate pairs, while a bounded sparse graph is close to linear in strokes times neighbors. For a 10M-parameter model, weights alone are only about 40 MB in FP32; activations, optimizer state, edge tensors and framework allocations dominate training memory. No latency or peak-memory measurements were run in this research task. Current system RAM availability was low in the earlier hardware audit, so recheck before any future training run.

## 6. Two controlled proof-of-concepts

Compare **A** against **B+C**. Also report deterministic geometry-only and a small visual-feature ablation. Use identical source data, labels, train budget and inference budget. Do not use methane results as training or broad evaluation.

### POC 1 — Timestamp-free ink grouping and structural labels

**Question:** Does a joint spatial graph improve stroke grouping and symbol/relation output on edited or reordered ink, compared with a modular recognizer plus graph fusion?

- Train/validate on CROHME (and audited CROHME+ labels) plus MathWriting training sources. Preserve official validation/test. Add OHSD only if its data and terms are verified.
- Inputs are x/y geometry and optional per-stroke raster crops. Remove timestamps and writing order from every condition. Apply the same transformations to all systems: random stroke order, translate/rotate/scale the expression, and split/recombine selected multi-stroke components.
- Controls: geometry heuristic; Architecture A with frozen modular features; B joint edge-aware grouping/classification; B+C with SpaceGTN-style spatial graph construction and optional image crops.
- Primary metrics: source-stroke group pairwise F1 and exact group recovery; symbol macro-F1; CROHME expression/structure rate; candidate-edge recall; abstention risk/coverage; p50/p95 latency and peak VRAM/RAM.
- Hold out writers and source expressions. Bootstrap by source expression, not individual stroke.

**Reject B+C** if gains disappear on writer/source holdout, relation/grouping F1 fails to improve, the visual channel adds no grouping benefit, or source-stroke grounding/calibration falls. **Reject A as the preferred architecture** if B+C provides a reproducible held-out gain in grouping and structural accuracy without worse abstention or runtime.

This experiment can establish timestamp-free ink feasibility. It does not establish native-object or STEM-role understanding.

### POC 2 — Mixed-tool STEM source grounding

**Question:** Does one heterogeneous graph improve cross-tool association and scientific roles beyond modular recognition followed by graph fusion?

- Build a pilot of 500–2,000 generated mixed boards from 50–100 authored scene templates, plus at least 100 manually reviewed real boards. This is a prototype budget, not a claim that the corpus is large enough for production. Use real ink traces; combine them with native vectors/forces, spring/graph objects, equations, measurements and chemistry objects.
- Include multi-candidate ambiguity, moved/resized objects, overlap/occlusion, distractors, scale changes, rotated layouts, missing labels and unseen tool combinations. Generate scene truth from authoritative source data and verify physics/unit invariants.
- Controls: deterministic geometry only; A modular ink/object encoders plus a graph fusion head; B+C joint time-agnostic heterogeneous graph; B+C with per-stroke image features and, separately, a bounded whole-scene thumbnail.
- Group train/test by writer, source expression/problem, scene template, generator family and object combination. Keep generated siblings in the same split. Maintain a separately adjudicated real-board test set.
- Primary metrics: cross-tool relation precision/recall/F1; exact scene graph match; source-stroke/object grounding; scientific role accuracy; unsupported relation rate; group F1; macro symbol/value accuracy; calibration and abstention. Also report candidate-relation recall, cold/warm latency, peak VRAM/RAM and checkpoint size.
- Evaluate task splits: seen tools/novel combinations; novel writer/template; held-out tool type; modified/reordered historical-board simulation. Do not expose hidden target IDs, relation labels or answer fields to the model.

**Pre-register a go gate:** require at least a 5-point absolute gain in cross-tool relation F1 over A on source-grouped holdouts, with a 95% bootstrap interval excluding zero, no more than a 2-point drop in source-grounding precision, no increase in unsupported claims, and p95 inference under a chosen local latency budget. These are project decision thresholds, not literature results.

**Reject the joint model** if it only improves symbol recognition, loses on unseen combinations, fails to abstain on ambiguous scenes, or depends on dense candidates that exceed local bounds. **Reject the modular control** only when joint gains survive real-board review and held-out writer/template/tool splits. If neither wins clearly, keep A and use the joint representation only for the subtask that demonstrated improvement.

## 7. Direct answers

1. **Is a joint heterogeneous stroke-and-object model likely to help?** Yes, especially for grouping and label-to-object association, because node and relation predictions can share contextual features and avoid a hard recognition-then-link boundary. The benefit on StudyAI scenes is a hypothesis until measured against A on grouped mixed-tool holdouts.
2. **Can EGAT learn grouping, recognition and cross-tool relations together?** Technically yes: its node and edge heads train jointly, and same-symbol edges can encode grouping. The published EGAT is math-only and uses temporal ordering. StudyAI needs a time-agnostic candidate graph, new node/edge vocabularies, native object types, data and abstention; a narrow handwriting specialist may remain better for text/equations.
3. **Strongest existing foundation?** SpaceGTN's timestamp-free spatial stroke graph is the strongest fit for StudyAI ink. Combine it with EGAT-style shared node/edge prediction and a small typed hetero fusion layer. Neither paper provides a ready mixed-tool StudyAI model or a verified downloadable checkpoint.
4. **What fits an 8 GiB RTX 3070 Ti?** A sparse 1–10M parameter graph model with bounded scenes, cached features and batch 1–8 is realistic. A small per-stroke CNN is plausible; large VLM fine-tuning is not a reliable local plan. Measure memory and latency before selecting final sizes.
5. **Which two architectures to compare?** Architecture A versus a joint, time-agnostic B+C model. Include geometry-only as control and treat per-stroke/whole-board visual features as nested ablations.
6. **Could one model replace most OCR, grouping and scene reasoning?** Possibly after broad supervised data and separate validation gates, but not yet. A modular system will be more reliable during data scarcity and for exact native facts. Replace one stage at a time only when the joint model improves source-grounded scene metrics, calibration and latency on unseen tools and writers.

## References

- [EGAT / GGM-EGAT paper, Pattern Recognition 2026](https://doi.org/10.1016/j.patcog.2026.113410); [author PDF](https://www.cs.rit.edu/~rlaz/files/PR-graph-2026_R2.pdf); [author GitLab project](https://gitlab.univ-nantes.fr/E19B516G/ggm)
- [Separate Nguyen et al. EGAT link-prediction repository](https://github.com/ntcuong2103/math_online_egat)
- [SpaceGTN paper, AAAI 2024](https://doi.org/10.1609/aaai.v38i3.27994); [official PDF](https://ojs.aaai.org/index.php/AAAI/article/download/27994/28005)
- [T-OHS paper, Pattern Recognition 2024](https://doi.org/10.1016/j.patcog.2023.110131)
- [Structural HMER paper](https://arxiv.org/abs/2508.19773); [CROHME+](https://doi.org/10.5281/zenodo.14968570); [MathWriting+](https://doi.org/10.5281/zenodo.15091575)
- [CROHME official data page](https://www.isical.ac.in/~crohme/data2.html); [MathWriting official repo and license](https://github.com/google-research/google-research/tree/master/mathwriting)
- [PhysAlign project](https://physalign-lab.github.io/); [paper](https://arxiv.org/abs/2609.33319); [surfaced dataset card](https://huggingface.co/datasets/Jetson888/PhysAlign)
- [Graph-to-Graph HMER](https://doi.org/10.1609/aaai.v35i4.16399); [EPAT](https://doi.org/10.1016/j.patcog.2021.107859); [Instance GNN](https://doi.org/10.1109/TMM.2021.3087000)
- [R-GCN](https://arxiv.org/abs/1703.06103); [Heterogeneous Graph Transformer](https://arxiv.org/abs/2003.01332)


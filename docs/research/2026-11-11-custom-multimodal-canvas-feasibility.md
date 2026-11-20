# StudyAI MK3: Multimodal Canvas Intelligence Feasibility

**Research snapshot:** 2026-11-11  
**Scope:** Read-only architecture and model research. No application code, dependencies, checkpoints, services, or training runs were changed or started.

## Decision

**Yes, a small locally runnable model for StudyAI-specific scene understanding is realistic. Replacing most of the current pipeline is a longer, conditional goal.** The practical path is a hybrid system with a small graph-based fusion model trained on StudyAI scenes, supported by dedicated ink recognizers and deterministic canvas data. Do not train a single end-to-end model to rediscover native geometry, equations, force values, IDs, or chemistry graphs already stored in the board.

The feasible local target is a model that classifies ambiguous ink groups, links recognized labels to the correct native objects, predicts candidate scene relations, and attaches each claim to immutable source evidence. A small graph transformer or relational network can fit the laptop. A general STEM handwriting-and-diagram recognizer does not exist here as a reusable, licensed, downloadable pretrained component. Existing pretrained sketch and equation models are narrow and should be evaluated as components.

The strongest initial design is **Architecture E with a graph-first fusion core**:

1. Preserve authoritative canvas objects, stroke IDs, point sequences, geometry, and revision hashes deterministically.
2. Encode freehand stroke groups with a vector encoder; separately recognize handwriting or equations with a model suited to that task.
3. Convert native objects and recognized ink components into typed nodes and candidate relations.
4. Train a small relation model over this graph; return source-grounded claims with uncertainty and explicit abstention.
5. Keep OCR / generic vision-language reasoning as a fallback until benchmarks show the local model can replace a stage.

This is a recommendation for the next experiment, not an architecture commitment.

## The two active StudyAI tasks

At the time of inspection, both named Codex threads were active and writing against the shared StudyAI checkout.

- **“Audit StudyAI scene architecture”** has moved from its initial read-only audit into the user-authorized four-condition methane feasibility experiment. It is comparing A: current Analyze Board; B: full-scene image only; C: image plus original strokes; and D: image, strokes, and deterministic geometry. Its user-set limit is eight Groq requests, with separate metrics for recognition, grouping, source grounding, and scientific interpretation. Its current fixture has 22 freehand strokes and four native scientific objects; the methane labels and bonds are native QuickDraw text/lines, while a separate group contains 14 handwritten strokes. It is useful for checking experimental controls and basic input-value hypotheses. It does not establish recognition of handwritten chemistry or readiness for complex mixed-tool canvases.
- **“Benchmark canvas analysis with datasets”** is building a dataset-to-canvas benchmark, including an importer that retains genuine MathWriting stroke traces and an editable spring/graph reconstruction. Its latest messages describe source mappings and annotations, and investigating PhysAlign files. IAMonDo is pending registration and terms. This work can provide candidate data and import lessons; it is not yet a validated model-training corpus or a result from a learned model.

Keep the two efforts independent. Once their artifacts are reviewed, reuse suitable examples only with source-level train/validation/test separation. In particular, do not use the methane result as the general benchmark or place transformed copies of one source sample across train and test.

## 1. Current application architecture

The current code is an active, dirty worktree, not a clean release snapshot. File findings below refer to the inspected checkout.

### Data and supported canvas content

A saved StudyAI canvas is version-1 CanvasDocument: a QuickDraw snapshot plus a separate array of typed scientific and learning objects (src/canvas/model.ts:24-46). The pinned QuickDraw package stores a flat shape/image record store; supported record types include freehand draw and highlight, geometric shape, arrow, line, text, note, and image. Shape records contain stable IDs, type, position, rotation, z-order, and type-specific properties. Freehand points are coordinate sequences with pressure; the current capture path retains world coordinates and pressure when present (node_modules/@quickdrawjs/core/types/index.d.ts:32-73; server/canvas-intelligence/input.ts:103-109).

StudyAI's 15 typed object kinds cover:

- Chemistry: atoms, bonds, molecules, bond orders, electron counts, atom positions, and resonance forms.
- Math and physics: equations and math workspace state, graphs and equation links, vectors, forces, measurements, units, and point of application.
- General learning and annotation: anatomy, concepts, explicit relationships, linked notes and documents, questions, and flashcards.

Anchors can reference QuickDraw shapes, scientific objects, or a molecule atom and can follow normalized positions during transforms (src/canvas/scene.ts:23-84). This means IDs, structured values, many geometric facts, and some relations are already known. The model should not estimate them from a screenshot.

The saved document is a snapshot, not a full interaction log. InkML imported by the current untracked dataset work keeps original channel data in its source sidecar, but its canvas converter maps x/y into strokes with fixed pressure; inspect channel preservation before using that canvas conversion as a full-fidelity training representation.

### Persistence and interaction

The authoritative saved row is SQLite, scoped by board/course/lesson, with whole-document JSON and an optimistic integer revision. Saves reject stale revisions and only increment when content changes (server/db.ts:17-18; server/canvas-persistence/service.ts:24-65). The app maintains whole-document undo/redo stacks in memory; QuickDraw also has its own internal history. There is no persisted source event stream in the canvas path. The document parser validates StudyAI scientific objects but treats QuickDraw snapshot records largely as a cast and does not fully validate record or asset contents (src/canvas/model.ts:46-115).

### Current analysis and provider path

Analyze Board saves and rereads the authoritative document, captures selected handwriting regions, then sends the document, selection, revision, and regions to the local API (src/canvas/CanvasStudio.tsx:193-223). The server checks revision and scope, normalizes the saved scene, and runs OCR and structure inference concurrently. Deep analysis builds evidence, selects a bounded context, and calls a fusion stage (server/canvas-analysis/producer.ts:46-95; server/canvas-intelligence/service.ts:68-128). Results are validated again against the board revision. The Tutor receives a bounded context, including visible objects and simplified stroke samples; this is distinct from the richer Analyze Board request (src/canvas/ai/canvas-context.ts:64-95; server/agent.ts:65-74).

The OCR crop selector groups nearby freehand/highlight strokes heuristically and sends at most three regions. OCR sees crops as images, while structure inference sees serialized records and typed objects. OCR normalization currently returns no coordinates, source IDs, or calibrated confidence; association back to source strokes relies on crop-level grouping and geometry (src/canvas/ocr-regions.ts:9-20; server/canvas-intelligence/regions.ts:54; server/canvas-intelligence/groq.ts:97). The baseline may use up to five calls: three OCR crops, structure, and fusion.

The current .env selects Groq for both canvas inference and OCR. A local Ollama model is configured, and local manifests are present, but no Ollama process was running during the read-only check. Therefore the current configured analysis is not fully local. API credentials remain server-side.

### What is deterministic versus learned

| Already available deterministically | Still needs perception or semantic judgment |
|---|---|
| Persisted IDs, revision, native text/labels, typed scientific values, equation AST/workspace, graph samples, atom and bond records, vector components, shape type/style, object transforms, stroke points and pressure where captured, bounds, orientation, arrow geometry, distance, selected IDs, explicit anchors and source references | Meaning of unstructured strokes; segmentation/grouping of strokes into words, symbols, and diagram components; content of imported images; whether a nearby label applies to a force, graph, molecule, or another label; semantic relation types; scientific role such as force vs. velocity; whether geometry indicates an intended relation; interpretation of mixed tools as one scene |

The evidence builder exposes only a subset of stored scientific properties and uses geometric heuristics for candidate relationships (server/canvas-intelligence/evidence.ts:101-123; server/canvas-intelligence/input.ts:117-177). A typed encoder should first expose the reliable fields consistently and exclude image payloads from text encoding.

### Audit findings that affect future model safety

The specialist read-only audit found strong revision checks but several conditions a learned system must not weaken:

- A valid source ID or shared ID does not prove a particular claim is supported. Require claim-level links to eligible evidence; do not infer support from ID overlap or model-generated evidence.
- Client OCR crop pixels are not rendered or checked against the authoritative saved strokes. Server-render them from the saved snapshot, or label OCR claims as unverified.
- Canvas labels and imported text are untrusted data. Keep them structurally separate from system instructions passed to the Tutor.
- Current request-size handling continues buffering after exceeding the cap. Input parsing and pairwise relation generation also lack early record/point limits; large boards can incur quadratic work before prompt-size checks.
- Model schemas need independent limits on strings, arrays, response bytes, and generated tokens. Add bounded concurrency and cancellation before introducing a local model.
- Analysis results must stay separate from authoritative board data until user approval; preserve source IDs and stale-revision rejection.

The full code evidence is in server/canvas-analysis/producer.ts:120-130,207-247, server/canvas-analysis/contract.ts:102-104,249-268, server/agent.ts:108-123, server/canvas-intelligence/input.ts:15-34, and server/canvas-intelligence/types.ts:5-30.

## 2. Pretrained ink and sketch components

No candidate below already solves StudyAI's whole-scene problem. Published benchmark numbers are not expected StudyAI accuracy.

| Candidate | Input / useful output | Weights, size, parameters, license | Fit and limits |
|---|---|---|---|
| **Sketchformer** ([paper](https://arxiv.org/abs/2002.10381), [official repo](https://github.com/leosampaio/sketchformer)) | Vector sketch strokes; transformer embeddings for classification, retrieval, reconstruction, and interpolation | The repo links pretrained continuous and discretized checkpoints; exact checkpoint download, file size, parameter count, and weight license were not verifiable from the README. Code repo is MIT. TensorFlow 2.x | Useful as an embedding baseline for stroke groups. Trained on general QuickDraw sketches, not handwriting or STEM; no documented source-word grounding. |
| **Multi-Graph Transformer (MGT)** ([paper](https://arxiv.org/abs/1912.11258), [official repo](https://github.com/PengBoXiangShang/multigraph_transformer)) | Vector freehand sketch represented by multi-scale graphs; classification features | Official repo links trained checkpoints, including a 141 MB MGT #17 artifact with checksum; parameter count and separate checkpoint license are not stated. Code is MIT. PyTorch | Best graph-sketch baseline to inspect for local stroke features. Reported 72.8% QuickDraw classification is a dataset-specific result, not STEM scene accuracy. The old research code/data pipeline needs compatibility review; it does not provide OCR, mixed-tool fusion, or source-grounded relation labels. |
| **CoMER** ([ECCV paper](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136880389.pdf), [official repo](https://github.com/Green-Wood/CoMER)) | Image/raster of a handwritten mathematical expression to LaTeX/structure | Official repository contains a pretrained checkpoint. Exact parameter count and license terms for the checkpoint were not separately documented in the inspected README. Older training stack: Python 3.7, PyTorch 1.8.1, CUDA 11.1, Lightning 1.4.9, Perl. Training report: 7–8 hours on four RTX 2080 Ti GPUs. | Narrow math-expression recognizer, not a whole-board model; raster input loses original stroke identity and timing. Paper reports expression recognition rates around 59–63% on CROHME 2014/16/19. Do not treat those as label-association or mixed-scene scores. |
| **O3SLM** ([paper](https://arxiv.org/abs/2511.14368), [project](https://vcl-iisc.github.io/O3SLM/), [repo](https://github.com/vcl-iisc/O3SLM_code)) | Sketches, images, and text are encoded as image/text tokens for a vision-language model | Repo refers to LLaVA 7B/13B-based models; a usable O3SLM checkpoint was not verifiable—the download entry is a placeholder. Weight license unclear. | Not a digital-ink trajectory encoder and too large/uncertain for this laptop; useful as research direction, not an immediate local component. |
| **SketchRNN** ([official Magenta repo](https://github.com/magenta/magenta/tree/main/magenta/models/sketch_rnn)) | Stroke-3 vector sequences; generation and interpolation | Class-specific pretrained generation files are linked; exact counts and reusable encoder checkpoint/license not established here. | Mainly a generative baseline, not a robust general semantic or STEM scene encoder. |
| **Google ML Kit Digital Ink** ([Android docs](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android), [overview](https://developers.google.com/ml-kit/vision/digital-ink-recognition/)) | Genuine coordinate/time strokes to offline text and shape recognition | Managed proprietary SDK and language packs; no downloadable/exportable weights or custom fine-tuning path. Android/iOS centric. | Useful as a quality/latency reference if a supported native client is in scope. It is not a portable model for StudyAI's current Windows/web stack and does not fuse StudyAI objects. |

**Finding:** MGT and Sketchformer are the best open vector-sketch components to benchmark, but neither is a ready digital-ink STEM encoder. CoMER is a concrete pretrained math recognizer but image-based. No verified checkpoint combines original online strokes, arbitrary STEM notation, native objects, and relation grounding. Track exact checkpoint file hashes and licenses before any later download or reuse.

## 3. Structured canvas representation

A language model is not needed to understand StudyAI's JSON schema. Build typed, numerical node features from authoritative objects:

- Stable source reference, object kind, explicit labels/text, numeric values with units, and schema version.
- Normalized position, extent, angle, z-order, endpoint geometry, and explicit anchors as numeric features.
- Stroke-group embedding plus the exact list of source stroke IDs and point ranges.
- Edges for explicit links, attachments, containment, overlap, and candidate spatial relations. Distinguish computed geometry from learned semantic relations.
- Text embedding only for genuinely free-form labels, descriptions, or imported text. Keep raw source text outside instructions.

A small heterogeneous graph encoder can preserve provenance and represent new types through descriptor features plus an unknown-type fallback. A schema registry should describe units, fields, and relation constraints; adding an object type should not silently map it to a known category. This generalizes more safely than training a model on arbitrary literal JSON strings.

| Encoding option | Cost / editability | Provenance and new types | Recommendation |
|---|---|---|---|
| Literal JSON tokens to an LLM | High token and latency cost; easy prompt iteration | IDs can be included but the model may ignore or hallucinate them; schema drift is fragile | Keep only as a fallback reasoning interface |
| Typed object embeddings plus geometry | Low and deterministic for native facts; requires feature code | Excellent if IDs/fields remain attached to each embedding; unknown types can use descriptor fallback | Use as baseline |
| GNN / graph transformer | Low-to-moderate inference for small scenes; learns edges and roles; explicit graph nodes remain editable | Strong source grounding if outputs reference original nodes and model never owns IDs | Preferred learned fusion core |
| Unified transformer over all tokens | More flexible with text and variable modalities; harder to constrain and ground | Provenance can be carried as metadata but is not inherently enforced | Later comparison, not first implementation |

## 4. Fusion architectures ranked

1. **Hybrid graph-first fusion (E + C) — recommended.** Deterministic extraction and validation surround a graph model; the model predicts semantic relation candidates and ambiguous labels. Explicit edges stay facts; learned edges stay hypotheses with confidence and evidence references. Best local fit and most editable.
2. **Dual encoder plus small fusion network (A) — useful implementation detail.** Reuse a stroke encoder only if a benchmark shows useful embeddings, pair it with typed object embeddings, and train cross-attention or edge classification. It gives clear ablations and can cache frozen features.
3. **Unified multimodal transformer (B) — research option.** Common token space can handle mixed sequences, but raster/image tokens, points, and typed records require careful encoding and grounding. More complex data requirements and less transparent than the graph approach.
4. **Fine-tuned vision-language model (D) — weak local default.** Image models can describe scenes but do not naturally preserve source stroke identity, and compact VLM adaptation competes with the laptop's 8 GB VRAM. Better as teacher/benchmark or optional fallback.
5. **End-to-end OCR replacement — not supported as a first design.** It would conflate recognition, grouping, linking, and scientific reasoning; errors become hard to locate and validate.

The model should learn only ambiguous tasks: stroke segmentation/recognition, label-to-object association, physical role classification, and semantic relations. Deterministic validators should own IDs, coordinates, units, native graph structure, allowed object kinds, revisions, and edit application.

## 5. Training frameworks and installed tooling

- **PyTorch custom training loop:** Best fit for a small GNN/fusion model. Native PyTorch handles arbitrary nn.Module components and task losses without pretending the graph is a language model. Current app is TypeScript and has no PyTorch dependency installed.
- **Hugging Face PEFT / LoRA / QLoRA:** Good when the target is a supported Hugging Face transformer and only adapters should train. PEFT custom-model integration requires explicit target module mapping ([custom models](https://huggingface.co/docs/peft/developer_guides/custom_models), [LoRA API](https://huggingface.co/docs/peft/en/package_reference/lora)). It does not itself provide a graph-fusion architecture.
- **TRL:** Trainer layer for language-model fine-tuning objectives; not a drop-in trainer for a heterogeneous canvas graph ([TRL PEFT integration](https://huggingface.co/docs/trl/peft_integration)).
- **Unsloth:** Current documentation supports Windows and selected language/vision models; Windows installation requires a compatible PyTorch stack and supported model family ([Windows guide](https://unsloth.ai/docs/get-started/install/windows-installation), [requirements](https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements)). It is valuable only if adapting a supported LM/VLM, not a custom graph model.
- **Axolotl:** Configurable LM/VLM fine-tuning with model-specific support and custom integration hooks; its docs recommend WSL2 or Docker on Windows and flag multimodal support as limited ([support matrix](https://docs.axolotl.ai/docs/support-matrix.html), [custom integrations](https://docs.axolotl.ai/docs/custom_integrations.html), [installation](https://docs.axolotl.ai/docs/installation.html)).
- **bitsandbytes:** Can reduce transformer memory for 4/8-bit adapter training, but backend/compiler/version compatibility must be checked; it adds no value for a tiny graph head.
- **Distillation:** Useful after a teacher reliably annotates complex scenes. It does not remove the need for clean labels or independent held-out evaluation.

No installed training framework or matching fine-tuning plugin was found in the inspected environment; Python has pip/setuptools only, with no Torch/Transformers. No installed Codex plugin meaningfully trains a custom graph model. Prefer a small isolated Python 3.12+ environment later; keep it outside the app runtime and pin dependencies. The current Python 3.10.11 is past upstream EOL, and PyTorch 2.15 has dropped Python 3.10 wheels, despite older/general installation pages still listing it ([PyTorch install selector](https://pytorch.org/get-started/locally/), [PyTorch release note](https://dev-discuss.pytorch.org/t/notice-python-3-10-support-is-being-removed-from-pytorch-2-15-2-14-is-the-last-release-with-3-10-wheels/3440)).

## 6. Laptop feasibility

Read-only inspection found:

| Component | Observed |
|---|---|
| Laptop / CPU | MSI Raider GE66 12UGS; Intel Core i9-12900H |
| GPU | NVIDIA GeForce RTX 3070 Ti Laptop GPU, 8 GiB VRAM; driver 617.14; GPU idle during check |
| System RAM | 15.7 GiB total; only 2.4 GiB available during inspection (84% used; transient) |
| Disk | 59.1 GiB free on C: |
| Python / training stack | Python 3.10.11; no PyTorch, TorchVision, or Transformers; no nvcc/CUDA Toolkit compiler |
| WSL | wsl --status was access denied; no configuration changed |
| Ollama | Model manifests present; no Ollama process running during inspection |
| Current provider | .env selects Groq for canvas OCR and inference; an API key is configured server-side |

Local model manifests show stored weight layers of approximately 1.69 GiB for glm-ocr Q8, 3.11 GiB for qwen3-vl:4b, 4.87 GiB for qwen3:8b, and 6.10 GiB for a custom Qwen3.5 9B Q4 variant. These are disk layer sizes, not peak runtime memory. KV cache, context length, framework, and GPU reservation add memory. The 8B/9B models are not a safe assumption for full-GPU use on an 8 GiB card.

| Workload | Assessment on this laptop |
|---|---|
| Train 1–10M parameter relation/fusion head on cached features | Feasible after freeing system RAM and setting up a separate, compatible environment; estimated peak about 2–4 GiB VRAM at small batch sizes, theoretical and unmeasured |
| Fine-tune a small stroke encoder | Potentially feasible if the model and sequence lengths are modest; benchmark memory first, freeze most layers initially |
| QLoRA 1–3B text model | Borderline but possible at short contexts and batch 1; Axolotl estimates 6–8 GiB for 1–3B QLoRA. 8 GiB leaves little practical headroom ([hardware guide](https://docs.axolotl.ai/docs/choosing_method.html)) |
| QLoRA 7–8B | Not practical: Axolotl estimates 10–14 GiB at short context/batch 1–2 |
| Train 4B VLM or 7B/13B image model | Not recommended locally; vision activations and high RAM use add overhead |
| Quantized local inference | Small models likely possible with short contexts and careful GPU offload; measure actual peak VRAM/RAM and p95 latency |
| 27B quantized local inference | The existing 16.5 GiB stored layer total already exceeds dedicated VRAM; CPU/RAM offload would be slow and current free RAM is low |

Unsloth documents lower *absolute minimum* QLoRA memory numbers than Axolotl's practical short-context estimates, so use the conservative table for planning. Low-rank adapters reduce trainable and optimizer memory but do not make the frozen base weights, vision tower, activation cache, or long contexts disappear ([Unsloth memory table](https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements); [Axolotl guide](https://docs.axolotl.ai/docs/choosing_method.html)).

**Training time and latency are not measured.** For a 1–10M parameter graph head with cached features and 1,000–100,000 generated/labeled scenes, a planning band of **minutes to several hours per training run** is reasonable; parsing, rendering, and label quality will likely dominate. Budget an initial 100–500 step profile, not a full run, to measure throughput and peak memory. For deployment, set a **target** of under 100 ms median and under 300 ms p95 for a scene of up to roughly 200 nodes after model load; this is an acceptance target, not a benchmark. Include preprocessing and stroke encoding in the measured end-to-end result.

Native Windows is the best first environment for the custom PyTorch head because PyTorch officially supports Windows, WSL is currently inaccessible, and no CUDA toolkit is required for use of a matching prebuilt wheel ([PyTorch Windows install](https://pytorch.org/get-started/locally/)). Do not install until the research is approved. If later training an LM/VLM, validate Unsloth's Windows path against the exact model and package versions; Axolotl is smoother in WSL/Docker, but that needs separate WSL access.

### Optional external compute

Google Colab's free GPU is useful for a short benchmark but resources are not guaranteed; new Colab Pro for Education sign-ups are currently unavailable. Existing verified subscriptions last to their one-year mark under Google's FAQ ([Colab FAQ](https://research.google.com/colaboratory/intl/en-GB/faq.html)).

For a concrete price reference, Google Cloud lists a T4 GPU at **$0.35 USD/GPU-hour**; the accelerator-optimized A100 1-GPU VM is listed around **$3.67/hour** in the cited pricing table. These exclude or vary with VM, storage, network, region, tax, and billing configuration; a 10-hour run is roughly $3.50 of T4 GPU charge or $36.70 of A100 VM time before those additions ([GPU price table](https://cloud.google.com/products/compute/gpus-pricing?hl=en), [accelerator VM pricing](https://cloud.google.com/products/compute/pricing/accelerator-optimized?hl=en)). External compute is unnecessary for the proposed fusion-head proof of concept. Use it only if a later benchmark justifies full VLM/encoder adaptation.

## 7. Dataset and label strategy

Use the public data for the task it actually supervises:

- **MathWriting** ([Google Research repo](https://github.com/google-research/google-research/tree/master/mathwriting)): full dataset is 2.9 GB; the small excerpt is 1.5 MB. Human train/validation/test are 229,864 / 15,674 / 7,644; synthetic is 396,014. InkML provides original strokes with spatial and relative-time information; selected glyph examples map source stroke indices. Dataset CC BY-NC-SA 4.0; code Apache-2.0. Good for online handwritten equation recognition, not mixed scenes. Keep its official held-out test split untouched.
- **IAM-OnDB / IAMonDo:** Online traces and writer/word/character metadata are valuable, but access is registration-based and non-commercial research only ([IAM-OnDB terms](https://fki.tic.heia-fr.ch/databases/download-the-iam-on-line-handwriting-database), [format](https://fki.tic.heia-fr.ch/DBs/iamOnDB/data.html)). Confirm terms for the exact dataset before use or redistribution.
- **PhysAlign** ([repo](https://github.com/HCPLab-SYSU/PhysAlign), [dataset card](https://huggingface.co/datasets/Jetson888/PhysAlign)): helpful for physical roles and text-to-diagram grounding. Its card reports 3,341 localized probes across 986 parent problems, but labels have not been independently human-reviewed and the composite license is “other”; inspect its license/notices and sample provenance. Use for exploratory evaluation, not as unquestioned ground truth.
- **Quick, Draw!** ([repo/data](https://github.com/googlecreativelab/quickdraw-dataset)): 50 million timestamped vector drawings across 345 prompted categories, CC BY 4.0; repository is archived. Useful for general vector-sketch pretraining, with weak STEM coverage and possible content noise.

Build a mixed-scene corpus from actual StudyAI snapshots and generated scenes. Each annotation should identify:

- Source stroke IDs and point ranges for every ink component.
- Native object IDs and which stored fields support each fact.
- Alternative groupings or readings for ambiguous overlaps.
- Entity label, source-supported location, semantic relation, and scientific role.
- Whether a claim is deterministically observed, model inferred, user confirmed, or unresolved.

Generate controlled combinations of handwritten values, native arrows/vectors, graph labels, equations, molecular structures, and freehand diagrams. Perturb layout, scale, rotation, overlap, missing strokes, and label placement. Keep template-generated scenes grouped by template/seed and real data grouped by writer/problem/source diagram when splitting. The synthetic corpus can teach controlled relations but does not prove generalization. Hold out whole generators, writers, source problems, and scientific combinations; manually inspect a small real-scene test set.

## 8. Output contract and deterministic checks

Use a versioned, compact scene graph result rather than a screenshot caption or prose-only answer. This is a proposal for later review:

- entities: source references, typed category, optional recognized text/value, bounded geometry, confidence, status.
- relations: source and target entity refs, relation type, claim-specific evidence refs, confidence, status.
- alternatives: competing grouping/recognition/relation hypotheses with reasons and uncertainty.
- provenance: model and schema versions, source canvas revision/hash, task and transform metadata.

Never generate authoritative canvas IDs. Model entities should point back to quickdraw or science IDs, plus stroke indices/point ranges where needed. Validate all refs against the saved revision; reject unknown IDs, out-of-range coordinates, invalid units, duplicate entities, forbidden relation types, excessive arrays/text, and stale outputs. Keep observed/inferred/user-confirmed claims distinct. Require explicit human confirmation before any proposed edit becomes authoritative.

## 9. Benchmark and staged implementation plan

### Add to the existing A–D comparison

After the methane experiment completes and its artifacts are reviewed, keep its results separate. For a general evaluation, add E: local graph-fusion model, using exactly the same persisted scene, source image, strokes, geometry candidates, and task prompt as A–D. Add ablations: no strokes, no geometry, no pretrained stroke encoder, and no semantic-edge training. Do not let E use a different label budget or a hidden cloud call.

Measure separately:

- Recognition: character/word error, symbol/expression exact match.
- Grouping: pairwise F1 or adjusted Rand index over stroke groups.
- Grounding: entity-to-source-stroke/object precision, recall, F1, and point-range IoU.
- Relations: typed edge precision/recall/F1 and exact scene-graph match.
- Domain interpretation: expert-scored correctness for physical role, math linkage, and molecular topology.
- Uncertainty: calibration/Brier score, abstention coverage vs. risk, and contradiction rate.
- Robustness: performance by scene size, overlap, object count, tool mixture, and unseen discipline/template.
- Performance/cost: cold/warm latency p50/p95, peak RAM/VRAM, model/cache size, number of local/cloud requests, and tokens.

Split by entire writers, source drawings/problems, generation templates, and model training sources. Preserve official public test splits. Report confidence intervals; a few cherry-picked boards cannot establish superiority.

### Smallest useful proof of concept

1. Pick one narrowly verifiable task: associate a handwritten numeric label with one of multiple native vectors/graphs, while preserving the exact source strokes and object ID.
2. Reuse one native-only scene and several authentic MathWriting traces as recognition inputs, then create 100–500 controlled mixed scenes. Add 30–50 manually checked real or representative scenes for a small held-out sanity set.
3. Build deterministic typed features first; compare geometry-only, MGT/Sketchformer frozen stroke features, and a 1–2 layer graph model. Do not train an LLM.
4. Compare against current OCR/association and the A–D inputs with a fixed local-only budget. Keep board IDs, crop pixels, model claims, and source references independently checked.
5. Stop if the model only learns layout templates, fails writer/template holdouts, cannot ground claims, or improves labels without improving correct object links.

This experiment can establish whether the representation and local relation model are useful. It cannot establish broad STEM coverage.

### Roadmap

1. **Representation audit:** Freeze a canonical schema for raw strokes, point ranges, typed objects, explicit links, and versioned provenance. Bound records/points/text and exclude image data URLs from text prompts.
2. **Ink baseline:** Benchmark MGT and Sketchformer as stroke-group embeddings; benchmark CoMER or a newly trained online HME recognizer on MathWriting. Track preprocessing and checkpoint licenses.
3. **Typed encoder:** Encode existing native fields and deterministic geometry; test unknown object-type fallback.
4. **Small fusion POC:** Train and evaluate the label-to-object relation task with frozen encoders and a graph model.
5. **Source-grounding gate:** Require claim-level evidence references, authoritative board rendering, schema limits, and unchanged revision before accepting outputs.
6. **Expand data and domains:** Add reviewed physics/chemistry/maths scenes and human correction provenance; no synthetic-only go decision.
7. **Local deployment gate:** Measure end-to-end latency, peak memory, quantization drift, offline behavior, and zero cloud use.
8. **Replace stages individually:** Replace a heuristic or OCR stage only after held-out results improve the target metric without lowering grounding or calibration.

## Risks and unknowns

- No verified pretrained vector-ink model is broad enough for arbitrary STEM handwriting and diagrams.
- Several public checkpoints have unclear weight licenses, old dependencies, or unverified direct download artifacts.
- Current source crops are heuristic and client-supplied; noisy labels would train incorrect associations.
- The importer preserves source InkML separately but current canvas strokes do not preserve every source channel.
- Synthetic scenes can reward template recognition rather than visual reasoning.
- Eight GiB VRAM and currently low available system RAM constrain 3B+ fine-tuning; inference can still fit smaller models.
- Current canvas analysis defaults to Groq, so local inference is not yet the configured behavior.
- A language model may produce fluent but unsupported science; keeping claim-level evidence and deterministic checks is mandatory.

## Final answer

A specialized StudyAI model is realistically achievable on the MSI laptop if its scope is a small local graph-fusion model trained to resolve ambiguous ink-to-object and object-to-object relations. Reuse deterministic native canvas data, benchmark available sketch encoders, and use a narrow handwriting/math recognizer only where actual freehand interpretation is needed. The model should emit evidence-linked hypotheses; deterministic code should retain control of identity, geometry, physics/math constraints, board revisions, and edits.

The laptop can support a small fusion head and local quantized inference after RAM pressure is reduced and a compatible Python environment is established. It is not a reliable target for 7B+ fine-tuning or broad VLM adaptation. This can eventually replace parts of OCR and ad hoc scene inference, but only after mixed-tool, source-held-out benchmarks show improved recognition and grounding. The smallest proof is the controlled handwritten-label-to-native-object association task above.


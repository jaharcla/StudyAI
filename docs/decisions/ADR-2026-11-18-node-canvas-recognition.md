# ADR: Node-native canvas recognition adapter

Status: accepted for implementation.

## Decision

Ship learned ink recognition inside the existing Node runtime. The first adapter uses ONNX CLIP through pinned `@huggingface/transformers` 4.3.2 (Apache-2.0), `onnxruntime-node` 1.30.0 (MIT), and `sharp` 0.35.4 (Apache-2.0). The model is `onnx-community/CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX` (MIT), loaded at int8 precision.

Recognition is a derived, unconfirmed observation layer:

- A deterministic geometry baseline is always available.
- CLIP supplies zero-shot candidates and few-shot prototypes.
- Few-shot examples are stored per course in SQLite; adding a class never retrains a model.
- Candidates carry source stroke IDs, bounds, confidence, alternatives, and explicit uncertainty.
- Candidates enter the evidence bundle with origin `recognition`, never as model interpretations and never as verified labels.
- Recognition cannot mutate the canvas. Canvas edits remain proposal-only with user approval.

Server-side rendering from the persisted snapshot is the single renderer for recognition and few-shot examples. Client-supplied crops are not used.

## Why Node, not Python

- The shipped product is local-first and `npm ci` is the install contract. A Python sidecar adds a second runtime, a second health surface, and a 2.5–5 GB install that is not required to load a canvas.
- ONNX Runtime in Node runs the same CLIP weights used by the reference prototype, with no CUDA, no Python version skew, and no cross-process protocol.
- Model downloads are optional and explicit. The repository code default is `baseline`; `.env.example` enables `auto`.
- A Python bench remains the right place for training. It exports ONNX and places artifacts behind the same adapter interface; it is never required at runtime.

## Why CLIP first

- It works on rendered rasters, which the app can produce deterministically from persisted strokes.
- Zero-shot prompt ensembles plus few-shot prototypes add user classes with no retraining.
- It is MIT licensed, small at int8 (152.7 MB), and CPU-viable.
- It is a baseline, not the final word. Abstract doodles will be weaker; the abstain threshold and the deterministic baseline cover that.

Rejected first adapters:

- `Xenova/quickdraw-mobilevit-small` (5.9 MB): excellent size, but the repository declares no weight license tag. Use only for evaluation until the license is resolved.
- `onnx-community/Florence-2-base-ft` (MIT): strong OCR/caption candidate, but autoregressive decode is slower and its sketch-handwriting quality is unmeasured. It is the next adapter to benchmark for text and region captioning, not the first.
- `onnx-community/LFM2.5-VL-450M-ONNX`: license `other`; not adopted without legal review.
- Hosted multimodal LLMs: already used for structure/fusion, but they cannot learn custom classes, cannot run offline, and are rate-limited. They stay as the reasoning layer, not the recognizer.

## Relationship to prior decisions

This ADR supersedes only the phrase "Do not add ... ONNX Runtime ..." in the global constraints of `docs/superpowers/plans/2026-11-18-spatial-canvas-intelligence.md`, and only for the recognition adapter. The rest of that plan is unchanged: deterministic capture, scene graph, FTS5 retrieval, bounded CopilotKit context, and approval-gated mutation.

`ADR-2026-11-18-spatial-canvas-scene.md` remains accepted. Its `CanvasRecognitionAdapter` boundary is implemented here; the baseline and CLIP adapters sit behind it.

## Supabase

Supabase is not in the canvas intelligence runtime path. This application is local-first and stores canvas, evidence, and prototypes in SQLite. No canvas content, embeddings, or user drawings are sent to Supabase by this change. The configured Supabase MCP server was unavailable (`Unauthorized`) during implementation, so no project state was read or written. Any future sync must be an explicit, opt-in adapter with its own ADR and user consent.

## Limits

- Maximum 24 recognized stroke groups per analysis.
- 224 × 224 black-on-white raster, 16 px padding, 6 px stroke; identical preprocessing for queries and few-shot examples.
- At most 2 candidates per group, confidence ≥ 0.18, margin over the runner-up ≥ 0.03; otherwise abstain.
- 8,000 ms adapter timeout; failures fall back to the baseline with a warning.
- 60 labels per zero-shot set; labels are trimmed to 80 characters.
- Maximum 64 source IDs per group result; maximum 16 uncertainty reasons.
- Model cache lives under `data/models` by default and can be overridden with `CANVAS_MODEL_CACHE`.
- No recognition output is written into `CanvasDocument`.

## Verification

- Unit tests for deterministic rendering, baseline classification, adapter validation, abstain behavior, evidence origin, and fallback.
- `npm test` and `npm run build`.
- Live CLIP quality and latency are measured separately against Quick Draw samples, MathWriting strokes, and owner drawings; no accuracy claim is made by this ADR.

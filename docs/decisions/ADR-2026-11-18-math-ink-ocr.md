# ADR: Whole-expression OCR for pure-ink math boards

Status: accepted for implementation.

## Decision

Pure-ink math canvases are recognized as one expression crop, not as gap-based stroke groups. A canvas is "math ink" when it has at least one freehand stroke and no native non-ink records and no scientific objects.

- `groupCanvasInkStrokesForOCR` returns one `stroke-group:expression:<sorted ids>` group for math ink, with the union of all stroke bounds.
- The client and server both use this grouping, so the existing source-region validation remains exact.
- Math ink uses a LaTeX OCR profile. Default provider order: `gemini` (Google AI Studio, if `GOOGLE_AI_API_KEY` is set) → `openrouter` → `groq`. OpenCode Go is available only when explicitly configured, because its vision OCR is slow and weak for equations.
- Default math model: `gemini-3.1-flash-lite` on Google AI Studio, or `google/gemini-3.1-flash-lite` on OpenRouter.
- Mixed/diagram boards use a diagram OCR profile with the same provider order and grouped crops.
- `CANVAS_OCR_MAX_REGIONS` (default 3, max 8) and `VITE_CANVAS_OCR_MAX_REGIONS` bound mixed-board crops.
- CLIP's default labels include math notation: sum, integral, fraction, partial derivative, nabla, equals sign, parenthesis, square root, subscript, superscript, vector, set notation, matrix, sigma.
- Pure-ink boards use `STRUCTURE_INK_SYSTEM_PROMPT`, which asks for symbol/group candidates and layout relations and receives a bounded OCR summary.

## Evidence

Before this change, the six MathWriting boards returned fragments such as `Σ x∈ {0, ( x ) K > K >` and `i 3 7 3 7 J . (`, with 1–13 freehand regions omitted per board. After this change:

| Board | OCR after | Token overlap |
|---|---|---|
| bra-ket sum | `\sum_{x \in \{0,1\}^n} \|x\rangle \|f(x)\rangle` | 0.8 |
| exponential decay | `N(t)=N_0 2^{-t/T}` | 0.8 |
| gradient vector | `\nabla I = (I_x, I_y)` | 1.0 |
| indexed sum | `J_i = \sum_j L_{ij} \frac{\partial F_j}{\partial x_j}` | 1.0 |
| nested logistic | `x_i = \frac{1}{1+e^{-\frac{v_i-u_i}{\epsilon}}}` | 1.0 |
| partial derivative | `\partial_i = \frac{\partial}{\partial x^i} = \frac{\partial}{\partial \xi^i}` | 0.5 |

All six returned `partial=false` with one region and no omitted-region warnings. The production run uses the Google AI Studio free tier (`gemini-3.1-flash-lite`), which handled all six math boards plus three diagram crops without OpenRouter or OpenCode usage. Free-tier limits are 15 requests/minute and 500/day; the client serializes and retries 429/503 responses.

`npm run benchmark:canvas` records deep-mode OCR, structure, latency, cost, provider usage, and regressions. The committed baseline is a clean Gemini run: 4/6 exact math boards, 0.91 average math F1, 0.75 PhysAlign concept coverage, 0 hard failures, and $0 provider cost. The gate refuses to record a new baseline when a provider-caused failure lowers it.

## Benchmark gate

- `npm run benchmark:canvas` runs the seven prepared boards in deep mode.
- It scores normalized LaTeX match/token F1, PhysAlign concept coverage, hard failures, latency, and cost.
- It writes `data/canvas-benchmark/latest.json` and compares with `docs/verification/canvas-benchmark-baseline.json`.
- `--update-baseline` records a new floor.
- The gate fails on additional hard failures, a drop of more than one exact math board, a math F1 drop above 0.1, or a PhysAlign coverage drop above 0.15.

## Rejected alternatives

- **Keep 3–6 grouped crops.** Structurally splits one equation into fragments; the VLM reads isolated symbols.
- **Use Groq's general OCR model for math.** It reads fragments, not LaTeX.
- **Use `qwen/qwen2.5-vl-72b-instruct` via OpenRouter.** It produced `\nabla I = (I \times J)` on the same crop where Gemini Flash-Lite produced the exact `\nabla I = (I_x, I_y)`.
- **Train a dedicated equation recognizer now.** Still the long-term option, but the hosted LaTeX OCR path is already accurate and cheap (~$0.0003 per board) without a training pipeline.

## Limits

- One expression crop loses line-level grouping for multi-line derivations; mixed boards still use grouped crops.
- Very long expressions at 224 px can lose small sub/superscripts; the client export uses its own scale, and this remains an evaluation item.
- Gemini Flash-Lite is a hosted service; the math path is unavailable offline. The deterministic and local CLIP layers still run.
- The OCR result is still `uncertain: true` and is never treated as verified.

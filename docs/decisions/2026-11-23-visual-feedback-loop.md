# ADR 2026-11-23 — Bounded visual self-correction for the Quickdraw AI Bridge

## Context

The MCP checkpoint campaign measured the cost and effect of screenshot-based feedback. Evidence in `experiments/mcp-checkpoints/reports/phase-1-visual.md` and `phase-5-tools.md`:

- Two capable models (`opencode-go/beam-free`, `opencode-go/hy4-flash-free`) each fixed all major **visual** defects in one feedback round on two artifact kinds, for roughly 6.5k–12k tokens and 15–35 s per correction.
- With `qwen3.5:0.8b`, a first correction made visual quality worse and three hand-authored rounds were needed — model capability dominates the loop.
- Corrections introduced **semantic regressions**: abbreviated scientific labels ("Password Valid?" → "Pwd OK?") and a duplicate gravity force (`W` and `mg`) in a force diagram.
- Live tool-surface comparison: the current 10-tool review-gated surface completed 2/6 artifacts at 51.9k tokens; a granular surface 0/6 at 61.0k; a batched surface 0/6 at 27.5k.
- The bridge already has the right integrity primitives: one mutation path (`approveCanvasProposal`), revision + fingerprint checks, and review gating. Static and unit evidence supports these; live multi-actor proof is still missing.

The campaign did **not** run this loop through the StudyAI tutor itself, so production cost figures remain unmeasured.

## Decision

Add a **bounded, opt-in visual self-correction loop** to the bridge, without adding a second mutation authority or growing the registered tool surface:

1. Render `propose_canvas_action` proposals as a **preview-only ghost overlay** (progressive reveal in action order). It never writes `canvases.document` and never bumps `revision`.
2. Extend the existing read-only `describe_canvas` tool with an optional `includeScreenshot` field. When true, return a bounded PNG plus a defect list using the campaign rubric: the upstream seven-point checklist plus label-to-element association, STEM symbol correctness, chemistry bond order and vector arrow direction. No new tool is registered.
3. A correction is a **new proposal**, not an edit to the previous one: it gets a new proposal ID, must be built against the refreshed board revision and fingerprint, and must be approved before it changes the board.
4. Add a pure `compareProposalSemantics(previous, next)` guard that flags shortened/renamed labels, removed labels and duplicated relationship types (e.g. two gravity arrows) as regressions requiring explicit confirmation. This is proposal comparison, not a third board-interpretation authority.
5. Keep the current 10-tool surface. Do not add a granular primitive set or collapse authoring into one composite tool.
6. Do not switch the recognition provider or add default Excalidraw export as part of this change.

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| Adopt the Excalidraw MCP renderer wholesale | Different canvas engine; its byte-identical PNG result is not a requirement for StudyAI. Reuse the screenshot-loop *pattern*, not the renderer. |
| Add a separate `inspect_canvas` tool | Would grow the surface to 11 tools; the live experiment favoured keeping the current abstraction. Extend `describe_canvas` instead. |
| Granular or batched tool surfaces | Both scored 0/6 live successes; granular cost more tokens, batched produced the weakest artifacts. |
| Auto-apply model corrections | Violates the review-and-apply gate and the single mutation path. |
| Swap recognition provider now | No labelled corpus; no evidence of a quality gain. |

## Versions and licenses of referenced checkpoints

- `yctimlin/mcp_excalidraw` — commit `81720ac…`, v2.2.0, MIT. Pattern only; no code copied.
- `excalidraw/excalidraw-mcp` — commit `157aa23…`, v0.3.2, MIT. Runtime-claim and metadata negative examples only.
- `vcmf/dim0` — commit `1bf00bae…`, v0.3.103, MIT. Single-mutation-path reference only.
- PaddleOCR `mcp_server` — package 0.8.5, Apache-2.0. Not changed by this ADR.
- Handwriting OCR MCP — v0.1.0, no LICENSE in repo. Not contacted.

## Limits

- Feedback cost figures come from an OpenCode-CLI harness; ~31k cached input tokens per turn were not counted. They are not production tutor costs.
- Only signup-flow and force-incline were run with the capable models; all six artifact kinds still need coverage.
- No live StudyAI tutor session was involved; the A/B loop used an external renderer.

## Verification required before implementation is called done

- Playwright browser-level test asserting the ghost overlay renders and that `describe_canvas` with `includeScreenshot` actually returns a PNG and a defect list.
- Unit tests for `compareProposalSemantics`, including the two observed regressions (abbreviated label, duplicate force).
- `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json` with all four gate numbers quoted — this change touches prompts/context.
- `npm run verify` with quoted output, and `/canvas-verify` before claiming canvas work complete.
- No `@ts-ignore`, `@ts-nocheck`, `as any` or `as never`; no new persistence authority.

## Consequences

Positive: visual quality can improve in one reviewed round at modest cost; semantic regressions are surfaced rather than silently applied; the review gate and single mutation path stay intact.

Negative: screenshots add latency and context size to the agent turn; the semantic guard may produce false positives that need user confirmation; benchmark and browser-test work is mandatory before shipping.

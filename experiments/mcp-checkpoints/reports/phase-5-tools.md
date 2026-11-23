# Phase 5 — Tool efficiency and context consumption

Status: **partial — harness, static counts, and live model-driven task runs all executed; results are indicative only (tiny model, simulated execution).**

## What was actually run

### Harness metrics (RED → GREEN)

```
npm test -- --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/tools.test.ts
```
- RED: `Cannot find module './tools'`.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- Metrics are reported per successful task and return `null` rather than dividing by zero for failed tasks, so failed orchestrations cannot masquerade as cheap ones.

### Static tool-surface counts (measured from pinned source)

| System | Tools | Source of count |
|---|---|---|
| StudyAI bridge (current) | **10** | 9 `name:` entries in `src/canvas/ai/canvas-bridge.ts:48-142` plus `propose_scientific_object` in `src/canvas/CanvasStudio.tsx:105` |
| mcp_excalidraw (checkpoint, large surface) | **27** | 27 `name:` entries in pinned `src/core/mcp-tools.ts` |
| excalidraw-mcp (checkpoint, minimal surface) | **5** | 5 `registerTool`/`registerAppTool` calls in pinned `src/server.ts` |

Note: `docs/QUICKDRAW_AI_BRIDGE.md` lists only some of these tools; the current registerable surface is larger than the doc claims.

The three candidate arrangements are defined in `fixtures/tools/tasks.json`: current, granular (hypothesis: one primitive per tool) and batched (hypothesis: one composite authoring tool). Only the current arrangement exists in code.

## Live model-driven runs (actually executed)

After the human partner authorized local model calls, I ran all six artifact tasks through all three surfaces with **qwen3.5:0.8b** via Ollama. Tool schemas in `harness/live/tool-efficiency-live.ts` are faithful JSON-Schema versions of the registered tool interfaces; execution is an in-memory board accumulator, **not** the full StudyAI app. Full per-run traces are in `evidence/phase-5/phase-5-live/` (gitignored raw JSON).

| Surface | Successful tasks | Calls | Calls/success | Tokens | Tokens/success | Invalid calls | Repeated calls | Model retries | Quality | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| current (10 tools) | **2/6** | 25 | 12.5 | 51,921 | 25,961 | 0 | 1 | 21 | 0.58 | 204 s |
| granular (10 primitives) | 0/6 | 40 | n/a | 60,958 | n/a | 0 | 0 | 26 | 0.49 | 245 s |
| batched (2 tools) | 0/6 | 27 | n/a | 27,549 | n/a | 0 | 1 | 24 | 0.23 | 259 s |

"Model retries" are whole chat retries caused by Ollama rejecting malformed XML in the 0.8b model's tool-call output; they are a runtime-reliability confound, not tool-surface failures. "Successful" means object and relationship counts were both within 10% of the fixture's expected values; it is structural, not screenshot-verified.

Observation: the current surface produced the only two structurally successful artifacts (vector-addition and signup-flow) at roughly half the tokens of the granular surface. The batched surface was cheapest in tokens but produced the weakest artifacts (one task had zero objects). This does **not** establish that our current surface is optimal — a 0.8b model with a ~3–4 retries per run is a poor proxy for the production tutor, and the simulated executor does not prove rendering correctness.

## Answer to the campaign question

**Indicative answer, not production-grade:** on this fixture set and model, the current surface completed the most tasks with fewer tokens than the granular arrangement; the batched arrangement minimized tokens but failed every task. That supports keeping the current, review-gated proposal abstraction rather than exploding it into primitives or collapsing it into one giant tool — but the result must be re-run with a capable model and the real app before it drives a design decision.

## To complete this phase

1. Re-run the same 18 live tasks with a production-capable tutor model and the real CopilotKit bridge.
2. Add screenshot-verified artifact quality instead of object-count proximity.
3. Separate model/runtime retry cost from orchestration cost in the scorecard.

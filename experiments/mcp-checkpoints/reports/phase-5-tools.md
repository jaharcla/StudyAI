# Phase 5 — Tool efficiency and context consumption

Status: **partial — harness and real static tool-surface measurements run; model-driven task comparison not run.**

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

## Answer to the campaign question

**Not answerable.** With no model-driven runs there are no measured calls, tokens, invalid calls, retries, latency or artifact-quality values for the three arrangements. Static counts show the endpoints of the design space (5 vs 27 tools, ours at 10) but do not show which arrangement produces correct artifacts with the least unnecessary interaction. As the spec warns, a smaller surface is not automatically better, and a single enormous tool can degrade error recovery.

## To complete this phase

1. Implement the granular and batched surfaces as adapters behind the same artifact tasks from Task 1.
2. Run all six artifact prompts through each arrangement with a real model, capturing token counters and tool traces.
3. Feed each trace to `toolEfficiency` and compare all six metrics separately alongside final artifact quality.

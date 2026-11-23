# Integration prototype handoff

Branch: `spike/mcp-tools-2026-11-23`. Base: `d0b4398`.
A unified patch against the base is at `patches/mcp-tools-integration.patch` (excludes the throwaway `spike/` experiments and `.vendor/`).

## What changed

| File | Change |
| --- | --- |
| `package.json`, `package-lock.json` | Add `@modelcontextprotocol/sdk@1.32.2`, `vega-lite@6.4.2`, `vega-embed@7.1.0` |
| `server/mcp-tools.ts` | New: three LangGraph tools, Wolfram MCP client, output/error normalizers, local Vega spec guard |
| `server/agent.ts` | Register the tools when `STUDYAI_EXTERNAL_MCP_TOOLS=1`; add routing-safe inclusion and tool instructions |
| `src/charts/vega-contract.ts` | New: one Zod contract shared by server tool and chat renderer; builds the Vega-Lite spec from simple chart parameters and resolves model-supplied field names from row keys |
| `src/charts/VegaChartTool.tsx` | New: `useRenderTool` renderer, `vega-embed` SVG chart, dev-only browser-test bridge |
| `src/App.tsx` | Mount `VegaChartToolRenderer` inside `CopilotKitProvider` |
| `tests/mcp-tools.test.ts` | Unit tests for normalizers and spec guard |
| `tests/e2e/vega-chart-tool.spec.ts` | Browser test asserting the rendered SVG and marks |
| `playwright.spike.config.ts` | Prototype-only Playwright config that boots Vite alone |
| `scripts/smoke-mcp-tools.ts` | Live smoke script for all three tools |
| `scripts/agent-tool-selection.ts` | Real graph + real model tool-selection probe (`TEST_MODEL` overrides the model) |
| `server/agent.ts` (Ollama path) | Emits a `tool_use` content block so `@langchain/ollama@1.0.2` preserves `tool_calls` in the follow-up request |
| `docs/decisions/ADR-...` | Reuse/build decision, versions, limits, verification |

## Reproduce on main

```powershell
# 1. apply the patch from a clean main checkout at d0b4398 (or cherry-pick the branch)
git apply patches/mcp-tools-integration.patch

# 2. install app deps and the separate hosted worker deps (the latter is needed by tsc)
npm install
cd hosted && npm install && cd ..

# 3. opt in — without this the tutor is byte-for-byte the old behaviour
$env:STUDYAI_EXTERNAL_MCP_TOOLS = '1'

# 4. verify
npx tsc -b
npx vitest run tests/mcp-tools.test.ts
npx playwright test --config playwright.spike.config.ts --reporter=line
npx tsx scripts/smoke-mcp-tools.ts
```

Observed results on this machine:

- `tsc`: no errors.
- `vitest`: 7 passed.
- Playwright: 1 passed; the chart renders a real `<svg>` with `<path>` marks and no error alert.
- Smoke: `wolfram_compute` returned `1 + 3*x + 3*x^2 + x^3`; `wolfram_alpha` returned `18.015 g/mol`; `show_vegalite_chart` returned `status:"ok"` with the spec and data.
- Agent tool selection (real LangGraph graph, real provider calls): 4/4 cases selected correctly with each of local `qwen3.5:0.8b`, `hy4-flash-free`, and `beam-free`. Cases: symbolic calculus → `wolfram_compute`, molar mass → `wolfram_alpha`, chart → `show_vegalite_chart`, greeting → no tool. Run with `npx tsx scripts/agent-tool-selection.ts`; `TEST_MODEL` switches Ollama models. For the free OpenCode models set `TUTOR_PROVIDER=opencode-go`, `OPENCODE_GO_API_KEY` (injected from the local auth entry, never printed), and `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free` or `beam-free`.
- Full `npm run verify` in this worktree: TypeScript clean; 583/583 unit tests passed; Playwright 44 passed, 8 failed, 3 skipped. The 8 failures are the existing live-model e2e cases (`workspace`, `tutor-*`, `document-intelligence`, `integration`, `quickdraw-ai`, `canvas-analysis`, `direct-vector`) which need a real CopilotKit Intelligence key and the default model stack; this worktree had only a dummy key. The prototype's own Playwright spec passes in isolation.

## Pre-edit impact record

- GitNexus `impact({target:"tutor", file_path:"server/agent.ts", direction:"upstream"})` → `risk: UNKNOWN`, 0 resolved callers, index 96 commits behind. Text search confirms the node is wired at `server/agent.ts` via `.addNode("tutor", tutor)` and is the graph's only node, so it is not safe to treat the zero as "unused".
- GitNexus `impact({target:"App", file_path:"src/App.tsx", direction:"upstream"})` → same UNKNOWN/zero pattern; `src/main.tsx` imports and renders it.
- `detect_changes({scope:"all"})` before each commit → **risk HIGH** both times (first: 3 changed symbols / 12 processes; final: 10 symbols / 8 tutor processes). These are real high-risk warnings, not waived: the edits touch the single LangGraph node and the root App. The blast radius is contained by the `STUDYAI_EXTERNAL_MCP_TOOLS=1` gate (off by default), by keeping the old tools and prompt intact when the flag is off, and by the full unit suite passing. Anyone enabling the flag on main should treat the tutor answer flows as the regression surface.

## Before this ships on main

1. Measure tool selection with real questions — the tools are available but routing has not been evaluated.
2. Run `npm run benchmark:canvas` once the flag is intended to be on by default; the added tools change the prompt/tool surface.
3. Decide whether to keep the in-chart renderer or switch to CopilotKit's MCP Apps host. The current renderer uses tool arguments, not the `ui://` resource; that is deliberate for the prototype but is a second rendering path to reconcile later.
4. Consider `wolfram_context` only after measuring its ~17 s latency on a warm connection.

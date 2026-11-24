# Source handoff: integration prototype

Source branch: `spike/mcp-tools-2026-11-23` (PR #19), base `d0b4398`. This branch ports the pieces listed below into current main deliberately; the PR was not merged.
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
| `playwright.mcp-tools.config.ts` | Branch-only Playwright config that boots Vite alone |
| `scripts/smoke-mcp-tools.ts` | Live smoke script for all three tools |
| `scripts/agent-tool-benchmark.ts` | 12-case repeated benchmark with call dedupe, argument validation and repetition metrics |
| `docs/verification/tool-selection-benchmark-2026-11-23.md` | Benchmark results and limitations |
| `server/agent.ts` (tool-call cap) | Hard bound of 3 executed tool calls per turn, with `limit_reached` feedback |
| `server/agent.ts` (Ollama path) | Emits a `tool_use` content block so `@langchain/ollama@1.0.2` preserves `tool_calls` in the follow-up request |
| `docs/decisions/ADR-...` | Reuse/build decision, versions, limits, verification |

## Reproduce

The unified patch remains on the source branch for provenance; it targets `d0b4398` and was not applied here. This branch carries the ported source directly.

```powershell
npm install
$env:STUDYAI_EXTERNAL_MCP_TOOLS = '1'  # opt in; without this the tutor path is unchanged
npx tsc -b
npx vitest run tests/mcp-tools.test.ts tests/tutor-integration.test.ts
npx playwright test --config playwright.mcp-tools.config.ts --reporter=line
npx tsx scripts/smoke-mcp-tools.ts       # live calls; only with opt-in and synthetic data
```

Observed results on this machine:

- `tsc`: no errors.
- `vitest`: 7 passed.
- Playwright: 1 passed; the chart renders a real `<svg>` with `<path>` marks and no error alert.
- Smoke: `wolfram_compute` returned `1 + 3*x + 3*x^2 + x^3`; `wolfram_alpha` returned `18.015 g/mol`; `show_vegalite_chart` returned `status:"ok"` with the spec and data.
- The original 4-case probe (`scripts/agent-tool-selection.ts`) was a smoke test and its 4/4 result is superseded. It had a ceiling effect and once misreported cloud results because its interceptor only watched Ollama's endpoint; that is fixed and the documented results were checked against the corrected run.
- The discriminating run is `scripts/agent-tool-benchmark.ts`: 12 cases × 5 repeats × 3 models, with deduped call counts, schema-validated arguments, negative cases, multi-tool turns, and error/repetition metrics. Full numbers and caveats: `docs/verification/tool-selection-benchmark-2026-11-23.md`. Headline: `qwen3.5:0.8b` dropped to 2/5 on derivative and duplicated chart calls; both free models were 5/5 on positives but over-called on negative cases. This is not a model recommendation.
- A hard per-turn tool-call cap is enforced in the graph (`TUTOR_MAX_TOOL_CALLS_PER_TURN`, default 3) and unit-tested.
- Credential handling: the local `opencode-go` auth entry was injected into probe processes and never printed. A full-worktree grep (excluding dependencies) found no occurrence of the token in docs, patch, scripts, tests, or saved artifacts. Interceptors that log request bodies/headers remain a leak path to watch.
- Free-tier retention: cloud free models may retain or train on prompts. Only synthetic probe cases were sent. Real student content must not go through them until that flow is explicitly accepted.
- Full `npm run verify` on the **source branch** at that time: TypeScript clean; 583/583 unit tests passed; Playwright 44 passed, 8 failed, 3 skipped. The 8 failures were existing live-model e2e cases needing a real CopilotKit Intelligence key; the prototype's own spec passed in isolation. Current-main port results are in `docs/verification/2026-11-24-mcp-tools-integration.md`.

## Pre-edit impact record

- GitNexus `impact({target:"tutor", file_path:"server/agent.ts", direction:"upstream"})` → `risk: UNKNOWN`, 0 resolved callers, index 96 commits behind. Text search confirms the node is wired at `server/agent.ts` via `.addNode("tutor", tutor)` and is the graph's only node, so it is not safe to treat the zero as "unused".
- GitNexus `impact({target:"App", file_path:"src/App.tsx", direction:"upstream"})` → same UNKNOWN/zero pattern; `src/main.tsx` imports and renders it.
- `detect_changes({scope:"all"})` before each commit → **risk HIGH** on every round touching the agent (3, then 10, then 12 changed symbols; 8–12 tutor processes). These are real high-risk warnings, not waived: the edits touch the single LangGraph node, now including the tool-call cap. The blast radius is contained by the `STUDYAI_EXTERNAL_MCP_TOOLS=1` gate (off by default), by keeping the old tools and prompt intact when the flag is off, and by 585/585 unit tests passing. Anyone enabling the flag on main should treat the tutor answer flows as the regression surface.

## Before this ships on main

1. Measure tool selection with real questions — the tools are available but routing has not been evaluated.
2. Run `npm run benchmark:canvas` once the flag is intended to be on by default; the added tools change the prompt/tool surface.
3. Decide whether to keep the in-chart renderer or switch to CopilotKit's MCP Apps host. The current renderer uses tool arguments, not the `ui://` resource; that is deliberate for the prototype but is a second rendering path to reconcile later.
4. Consider `wolfram_context` only after measuring its ~17 s latency on a warm connection.

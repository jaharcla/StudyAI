# Verification: MCP tools integration port — 2026-11-24

Scope: deliberate port of the opt-in Wolfram/Vega prototype from `spike/mcp-tools-2026-11-23` (PR #19) onto current main at `ab39115`. No merge, no push, no provider key added, flag off. Source brief: `docs/research/2026-11-24-mcp-integration-brief.md`.

## Ledger

- Task: brief committed as `f006c74`; implementation as `5d7fc25`.
- Ruling: kept the prototype's simple chart parameters and local Vega compile; no generic MCP host, no new authoring authority — the flag stays off and the source ADR already records the reuse decision. Cost: chart rendering remains a second path beside CopilotKit's MCP Apps host.
- Ruling: dropped the `as unknown as VisualizationSpec` assertion from the renderer because `vega-embed@7.1.0` `build/embed.d.ts:9` types `VisualizationSpec = VlSpec | VgSpec` and the dataset-bearing object type-checks directly. Cost: none; `tsc -b` still clean.
- Ruling: omitted the throwaway `spike/` experiments, `agent-tool-selection.ts` (superseded), the source patch file and the live smoke run. Cost: the reported benchmark numbers remain source-branch evidence, not a current-main measurement.
- Ruling: the per-turn cap applies to every tutor turn, including with the flag off, because the brief asks for a bounded turn and unit test; only prompt, tools and canvas benchmark are required to be byte-for-byte unchanged. Cost: a repeated-call turn gets `limit_reached` feedback even without external tools.
- Final review: self-review (no subagent tool; the brief forbids subagents). The review is by the author and is weaker than a fresh reviewer.

## RED → GREEN evidence

Before implementation, `npx vitest run tests/mcp-tools.test.ts tests/tutor-integration.test.ts --reporter=dot` exited 1: 3 failed / 44 passed. Failures were the missing `server/mcp-tools` module, the absent `TOOL RULE` prompt when the flag was on, and the missing `limit_reached` message under the cap.

After implementation, the same command exited 0: **2 files passed, 55 tests passed**. `npx tsc -b` exited 0 with no errors.

Default-path invariance: a literal-level comparison of the `const instructions` block against `HEAD` found 15 string literals in each, with no missing and no extra literals; with the flag off the added conditional evaluates to `""`, so the system prompt is byte-for-byte the old string. Tests also assert that with the flag off no external tool name is bound and no `TOOL RULE` text appears, and that all three external tools appear when `STUDYAI_EXTERNAL_MCP_TOOLS=1`.

## Browser

`npx playwright test --config playwright.mcp-tools.config.ts --reporter=line` exited 0: **1 passed (37.2s)**. The chart spec asserts a visible `<svg>` with `<path>` marks and no error alert. Vite logged `ECONNREFUSED` proxy warnings for `/api/models`, `/api/tutor-status`, `/api/copilotkit/info` and `/api/courses` because the isolated config boots no API services; the chart still rendered, so these are unrelated to the renderer.

## Full verify

`npm run verify` (with local `.env` loaded, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`, ports `5621/8631/8632/8521`) exited 1 after 12.5m:

> tsc -b: no errors
> Test Files 128 passed (128)
> Tests 822 passed (822)
> 1 failed
> tests/e2e/tutor-math.spec.ts:3:1 › tutor math renders as KaTeX in the sidebar
> 2 flaky
> tests/e2e/canvas-analysis.spec.ts:192:1 › handwritten F = 5 N keeps source evidence and a unique force candidate through Analyze Board
> tests/e2e/canvas-visual-remediation.spec.ts:363:1 › phase 1 shared tokens render on the actual DOM in light and dark
> 6 skipped
> 93 passed (12.5m)

Provider-dependent, not in this port: `tutor-math` timed out three times waiting for the tutor's markdown renderer in the busy full run; the same spec passed alone afterwards (`1 passed (43.8s)`) with the same provider and model. Both flaky specs passed on retry. The ported Vega spec passed in the full run (`✓ 105 ... vega-chart-tool.spec.ts`, 1.1s). No assertion was weakened.

## Not run

- Live `scripts/smoke-mcp-tools.ts` and a fresh `scripts/agent-tool-benchmark.ts`: both make real provider/Wolfram calls. The brief rules out external calls with real student content and the source-branch numbers are recorded with their caveats; no key was added for a new run.
- `npm run benchmark:canvas`: the flag is off, so the default prompt and tool surface did not change. Running it becomes necessary before enabling the flag by default.

## Three strongest objections

1. The cap changes default turn behaviour even with the flag off; a model that repeats a call now receives `limit_reached` feedback. The prompt, bound tools and canvas benchmark are unchanged, but "default unchanged" is not literally true for every path.
2. The chart browser test injects a fixture through a dev-only global bridge. It proves `vega-embed` renders real SVG marks, but does not exercise a completed `useRenderTool` call from the chat DOM.
3. No live Wolfram or Vega call was re-verified on current main. The ported benchmark numbers come from the source branch, where only synthetic probes were sent; free-tier cloud models may retain prompts until that flow is explicitly accepted.

# ADR: MCP tool integration prototype (Wolfram + Vega)

Status: prototype on `spike/mcp-tools-2026-11-23`, opt-in, not enabled on main.

## Decision

Add three LangGraph tools to the tutor, enabled only when `STUDYAI_EXTERNAL_MCP_TOOLS=1`:

- `wolfram_compute` — calls the hosted Wolfram Cloud MCP `WolframLanguageEvaluator` over streamable HTTP.
- `wolfram_alpha` — calls the same server's `WolframAlpha` tool.
- `show_vegalite_chart` — validates a Vega-Lite v6 spec locally, then lets the chat panel render an interactive SVG chart from the tool-call arguments.

The tools are registered in `server/mcp-tools.ts`, wired into `server/agent.ts`, and the chart renderer is registered through CopilotKit's `useRenderTool` in `src/charts/VegaChartTool.tsx`.

## Reuse-vs-build

- Wolfram: reuse the hosted MCP service rather than building a computation engine. It is no-auth, exact, and already validated in `spike/mcp-tools`. Existing `Math.js` stays the deterministic default for arithmetic; Wolfram is the escape hatch for symbolic work and curated data.
- Vega: reuse `vega-lite` for compilation and `vega-embed` for rendering. The separate `vega-mcp-server` proved the pattern but is **not** a runtime dependency: its own validation is weak and its UI requires an MCP Apps host, while our renderer already owns the chat surface.
- `json-contracts` rejected: StudyAI already has Zod schemas and a repair path for artifacts; a second contract system adds no capability.
- A full MCP host layer (CopilotKit `mcpServers` + `MCPAppsActivityRenderer`) is deferred. It is viable — both are present in `@copilotkit/react-core@1.85.0` — but it changes provider configuration and needs the Intelligence runtime key, which is outside a prototype.

## Exact versions and licences

| Package | Version | Licence | Role |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.32.2 | MIT | MCP streamable-HTTP client |
| `vega-lite` | 6.4.2 | BSD-3-Clause | local spec compilation |
| `vega-embed` | 7.1.0 | BSD-3-Clause | SVG chart rendering in chat |

## Limits carried into the integration

- Wolfram is stateless: no definitions carry between calls.
- `@langchain/ollama@1.0.2` serializes an assistant message with string content as `{role:"assistant", content:""}` and drops its `tool_calls`. The agent now emits a `tool_use` content block before the follow-up invocation so the second Ollama request keeps the call/result pairing. Without this, the model answered from memory despite tools being executed.
- The chart tool deliberately accepts simple chart parameters (mark, field names, row array) rather than a raw Vega-Lite document; a 0.8B local model could not reliably produce nested JSON. The app builds and compiles the spec. Model-supplied field names that are absent from the rows are resolved from the first row's keys.
- Wolfram output is capped at roughly 10,000 characters by the service; `normalizeWolframText` adds a second 12,000-character guard and discloses the omitted middle.
- Wolfram failures arrive as message text (`Plot::argrx`) with `isError` unset; `normalizeWolframText` detects that and maps it to `ok:false`.
- The Vega MCP server accepts malformed specs; `normalizeVegaSpec` compiles locally and also checks that every referenced named data source has rows.
- Data is always passed explicitly; no remote data URLs.
- `wolfram_context` was excluded from the prototype: a single call took ~17 s in the spike.
- The flag is off by default, so the existing tutor prompt, tool set, and canvas benchmark are unchanged. Enabling it on main is a prompt change and therefore requires `npm run benchmark:canvas` against the tracked baseline.

## Verification performed

- `npx tsc -b` — no errors.
- `npx vitest run tests/mcp-tools.test.ts` — 7 passed.
- `npx playwright test --config playwright.spike.config.ts` — 1 passed; asserts a real SVG renders in the chat DOM.
- `npx tsx scripts/smoke-mcp-tools.ts` — live calls to both Wolfram tools and the Vega tool succeeded.
- `npx tsx scripts/agent-tool-selection.ts` — 4/4 cases selected the expected tool (or none for a greeting) with all three tested models: local `qwen3.5:0.8b`, and the free OpenCode models `hy4-flash-free` and `beam-free` via the app's `opencode-go` provider using the local auth entry. The tiny local model called the chart tool three times for one request; the two free models called it once. All chart calls produced a valid compiled spec after field resolution. No credential was printed.
- GitNexus `detect_changes` before commit — 0 changed symbols, no partial/truncated. The index is 96 commits behind HEAD; that staleness is recorded rather than ignored.

## What is deliberately not done

- No MCP server discovery or generic MCP host wiring.
- No tool-selection measurement with a real model: the agent sees the tools, but which questions trigger them has not been benchmarked.
- No `benchmark:canvas` run (flag off, no prompt change on the default path).

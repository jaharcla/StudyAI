# MCP tools spike — Wolfram Cloud + Vega

**Throwaway experiment.** Branch `spike/mcp-tools-*`. No StudyAI application source was changed; everything here is new files under `spike/mcp-tools/`.

## What this tests

Whether two external tools can serve as agent-callable capabilities for the tutor:

1. **Wolfram Cloud MCP** — hosted, streamable HTTP, no auth: `https://agenttools.wolfram.com/mcp`
2. **Vega MCP** — local FastMCP server over stdio, built from `hydrosquall/vega-mcp-server` (MIT)

The experiment covers connectivity, tool discovery, real calls, failure modes, and the limitations that would matter in an integration. It does **not** wire anything into the tutor yet.

## Setup

```powershell
cd spike/mcp-tools
npm install

# Vega is not published to npm — build from source
git clone --depth 1 https://github.com/hydrosquall/vega-mcp-server.git .vendor/vega-mcp-server
cd .vendor/vega-mcp-server
uv sync
npx vite build          # see Windows note below
cd ../..
```

`uv sync` needs Python 3.10+; this machine has uv 0.x and Python 3.10/3.13 available. The upstream `npm run build` script builds a POSIX-style `PATH` (`node_modules/.bin:$PATH`) and fails on Windows with `vite is not recognized`; running `npx vite build` directly produces the required `dist/index.html`.

## Run

```powershell
npm test
```

Result on this machine: **10 passed, 0 failed, 16.4 s** (Node's built-in test runner).

## Findings

### Wolfram Cloud MCP

- Connects with **no API key or sign-in**. Streamable HTTP works from this environment.
- Tools: `WolframContext`, `WolframLanguageEvaluator`, `WolframAlpha`.
- `WolframLanguageEvaluator` returned an exact expansion: `Expand[(x+1)^5]` → `1 + 5*x + 10*x^2 + 10*x^3 + 5*x^4 + x^5`.
- `WolframAlpha` returned curated, unit-bearing data: molar mass of water → `18.015 g/mol`.
- **Statelessness confirmed**: a definition made in one call (`f[x_] = x^2`) is not available in the next (`f[3]` returns unevaluated `f[3]`). Fine for one-shot tool use; rules out persistent symbolic state.
- Latency ranged from ~1.3 s (tool list) to ~7 s for an evaluation. Queries leave the machine — worth a settings note, not a blocker.

### Vega MCP

- Runs locally over stdio via `uv run fastmcp run server.py`; no credentials, no network egress from the server itself.
- Tools: `show_vegalite_chart`, `learn_vegalite_syntax`.
- The chart tool advertises an MCP App UI resource: `ui://vegalite/mcp-app.html`. **Whether the CopilotKit chat panel renders MCP Apps is unverified** — this spike only proves the server advertises it.
- Remote data URLs are blocked and named data sources must be supplied in the call; both rejections were verified.
- **Validation gap**: the README claims the Vega-Lite compiler validates specs, but an unknown mark (`"banana"`) and a missing encoding `type` both returned `success: true`. Callers must validate specs themselves (e.g. compile with `vega-lite` locally) if spec correctness matters.
- Failure is reported in `structuredContent.success === false`, with `isError: false` — a caller checking only `isError` will miss it.

## Integration implications

- The app has no MCP client code today; tools are LangGraph tools in `server/agent.ts` plus CopilotKit frontend actions. Two viable routes: register these capabilities as native LangGraph tools (call Wolfram HTTP directly, compile Vega specs with the `vega-lite` library and render in-app), or add an MCP client host layer so the agent can discover external servers.
- Wolfram's statelessness is a non-issue for per-call tool use. Vega's MCP App rendering is the only part that depends on host support.
- Both tools return structured, bounded output that fits the tutor's existing "show the input, label the result" presentation style.

## Reuse-vs-build decision (spike scope)

Neither capability exists in StudyAI today. Reusing the two upstream projects beats building equivalents: Wolfram's computation and Vega-Lite's grammar are large, maintained, MIT/Apache-classified dependencies. No dependency was added to the app in this spike; the SDK and vendored server live only under `spike/mcp-tools/` and are gitignored.

## Cleanup

`node_modules/` and `.vendor/` are gitignored inside this spike directory. To remove the experiment entirely, delete `spike/mcp-tools/` and drop the branch.

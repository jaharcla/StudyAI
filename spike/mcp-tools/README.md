# MCP tools spike — Wolfram Cloud + Vega

**Throwaway experiment.** Branch `spike/mcp-tools-2026-11-23`. No StudyAI application source was changed; everything here is new files under `spike/mcp-tools/`.

## Determination

**Vega is not a bust.** It is viable, with two conditions worth knowing before integration:

1. The app must enable CopilotKit's MCP Apps host support (currently present in the installed dependency but unused by the app).
2. Specs should be compiled locally before being sent, because this MCP server does not validate grammar.

Both are wiring gaps, not capability failures. The second round of tests therefore covered **both** tools.

## What this tests

1. **Wolfram Cloud MCP** — hosted, streamable HTTP, no auth: `https://agenttools.wolfram.com/mcp`
2. **Vega MCP** — local FastMCP server over stdio, built from `hydrosquall/vega-mcp-server` (MIT)

The experiment covers connectivity, tool discovery, real calls, failure modes, output bounds, and the limitations that would matter in an integration. It does **not** wire anything into the tutor yet.

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

`uv sync` needs Python 3.10+. The upstream `npm run build` script builds a POSIX-style `PATH` (`node_modules/.bin:$PATH`) and fails on Windows with `vite is not recognized`; running `npx vite build` directly produces the required `dist/index.html`.

## Run

```powershell
npm test
```

Result on this machine: **25 passed, 0 failed, ~42 s** (Node's built-in test runner).

## Findings

### Wolfram Cloud MCP

- Connects with **no API key or sign-in**. Streamable HTTP works from this environment.
- Tools: `WolframContext`, `WolframLanguageEvaluator`, `WolframAlpha`.
- Verified exact results across symbolic calculus, linear algebra, units, and curated data:
  - `Expand[(x+1)^5]` → `1 + 5*x + 10*x^2 + 10*x^3 + 5*x^4 + x^5`
  - `D[Sin[x] Exp[x], x]` → `E^x*Cos[x] + E^x*Sin[x]`
  - `Integrate[x^2, {x,0,1}]` → `1/3`
  - `Inverse[{{1,2},{3,4}}]` → `{{-2,1},{3/2,-1/2}}`
  - `Quantity[10,"Meters"]/Quantity[2,"Seconds"]` → `Quantity[5,"Meters"/"Seconds"]`
  - `Entity["Chemical","Water"]["MolarMass"]` → `Quantity[18.015..., "Grams"/"Moles"]`
  - `molar mass of water` (Alpha) → `18.015 g/mol`
- **Statelessness confirmed**: a definition made in one call is not available in the next. Fine for one-shot tool use; rules out persistent symbolic state.
- **Output is bounded**: a 10,000-element result came back as ~10,008 characters with a middle `...`. No wrapper cap needed for context safety, though the omitted middle must be disclosed.
- **Errors are text, not MCP errors**: invalid syntax returns `Plot::argrx...` with `isError` unset. Callers must inspect the text.
- `WolframContext` works but is slow (~17 s observed); it may be too costly for routine turns.
- Latency: ~1.5–7 s for evaluation calls, ~17 s for `WolframContext` (likely a one-time warm-up — worth re-measuring before judging).

### Vega MCP

- Runs locally over stdio via `uv run fastmcp run server.py`; no credentials, no network egress.
- Tools: `show_vegalite_chart`, `learn_vegalite_syntax`.
- Advertises **`ui://vegalite/mcp-app.html`**, readable as ~1.18 MB of self-contained HTML. Multiple chart shapes render: scatter, line, layered, and faceted.
- Remote data URLs are blocked; named data sources must be supplied in the call; missing named data is rejected.
- **Validation reality**: the server does not compile specs. An unknown mark (`"banana"`) is accepted. Compiling locally with `vega-lite@6.4.2` rejects it — a cheap, effective guard. A missing encoding `type` is accepted by Vega-Lite itself, so that is grammar behaviour, not a server defect.
- Failure is reported in `structuredContent.success === false` with `isError: false`; callers checking only `isError` will miss it.

### Host support evidence (why Vega is not a bust)

The installed `@copilotkit/react-core@1.85.0` declares `MCPAppsActivityRenderer` ("Renders MCP Apps UI in a sandboxed iframe with full protocol support") and an `mcpApps` config on the provider (see `node_modules/@copilotkit/react-core/dist/copilotkit-Dn4PbHJV.d.mts`, `MCPAppsActivityRenderer` around line 2275, `mcpApps` around line 3765). `@copilotkit/mcp-apps-renderer@1.85.0` is also installed. The app itself has no `mcp-apps`/`ui://` references, so this is an unwired capability, not a missing one.

## Integration implications

- The app has no MCP client code today; tools are LangGraph tools in `server/agent.ts` plus CopilotKit frontend actions. Two viable routes: register these capabilities as native LangGraph tools (call Wolfram HTTP directly, compile Vega specs locally and render in-app), or add an MCP client host layer so the agent can discover external servers — CopilotKit already exposes the renderer for the latter.
- Wolfram's statelessness and bounded output fit per-call tool use well. Error text needs explicit detection.
- Vega's chart is only visible if MCP Apps rendering is enabled; otherwise the tool returns just a success flag. That is the single hard dependency.

## Reuse-vs-build decision (spike scope)

Neither capability exists in StudyAI today. Reusing the two upstream projects beats building equivalents: Wolfram's computation and Vega-Lite's grammar are large, maintained, MIT/Apache-classified dependencies. No dependency was added to the app in this spike; the SDK, `vega-lite`, and the vendored server live only under `spike/mcp-tools/` and are gitignored.

## Cleanup

`node_modules/` and `.vendor/` are gitignored inside this spike directory. To remove the experiment entirely, delete `spike/mcp-tools/` and drop the branch.

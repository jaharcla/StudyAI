# Tool-selection benchmark — 2026-11-23

Status: **first discriminating run**, not a model recommendation and not a release gate. Replaces the earlier "4/4 smoke" claim with repeated measurements. This is independent of the Phase 4 pedagogy gate; it says nothing about composer pedagogy scores.

## Method

- `scripts/agent-tool-benchmark.ts` drives the real LangGraph graph with real provider calls, behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`.
- 12 cases × 5 repeats per model. Models: local `qwen3.5:0.8b`, free `hy4-flash-free`, free `beam-free` (the latter two via the `opencode-go` provider using the local auth entry, injected but never printed).
- The probe observes provider request payloads, not just the graph's final turn. It deduplicates tool calls by `id` (or name+args when no id) and handles both Ollama `/api/chat` and OpenAI `/chat/completions`.
- `argValid` parses each call's arguments and checks them against the actual tool Zod schemas (external + science tools).
- "Grounded" is a regex heuristic over the final answer; it is **not** proof the model used the tool result. `sourceMention` records whether the answer attributes the result to Wolfram. Low grounded counts on derivative/integral/speed-of-light are partly regex misses (LaTeX phrasing), which is exactly why this metric is weak.

## Results (selection = expected tool present / absent)

| Case | Expected | qwen3.5:0.8b | hy4-flash-free | beam-free |
|---|---|---|---|---|
| expand | wolfram_compute | 5/5 | 5/5 | 5/5 |
| derivative | wolfram_compute | **2/5** | 5/5 | 5/5 |
| integral | wolfram_compute | 5/5 | 5/5 | 5/5 |
| molar-mass | wolfram_alpha | 5/5 | 5/5 | 5/5 |
| speed-of-light | wolfram_alpha | 5/5 | 5/5 | 5/5 |
| bar-chart | show_vegalite_chart | 5/5 | 5/5 | 5/5 |
| line-chart | show_vegalite_chart | 5/5 | 5/5 | 5/5 |
| multi-tool | compute + alpha | 5/5 | 5/5 | 5/5 |
| arithmetic-negative ("2+2") | no call | 5/5 | **0/5** (local `calculate_expression` 5/5) | **3/5** (local tool 2/5) |
| concept-negative | no call | 5/5 | 5/5 | 5/5 |
| max-negative | no call | 5/5 | 5/5 | 5/5 |
| chart-no-data | no call | **2/5** | **0/5** (chart called 5/5) | **0/5** (chart called 5/5) |

Other signals:

- **Duplicate same-tool calls in one turn**: qwen3.5 had 2/5 on line-chart and 2/5 on chart-no-data; both free models 0/12. This is why a per-turn tool-call cap was added.
- **Tool errors**: qwen3.5 integral produced 5 tool errors (Wolfram messages / local tool misuse); both free models 0.
- **Argument validity**: all external chart/compute calls validated against their schemas. qwen3.5 had 6/7 valid line-chart calls and 3/5 valid chart-no-data calls; the free models were 5/5 on their external calls.
- **Repeated different tools** (multi-tool case) are expected: 2 calls/turn for all models, not duplication.

## What this does and does not establish

- It does **not** establish that tool selection is solved, nor that one model should be chosen. It shows the earlier 4/4 smoke test had a ceiling effect and that repeated cases expose variance the smoke test missed.
- Negative cases show over-calling: "2+2" invokes the deterministic local calculator for two of three models, and "draw a chart with no data" invokes the chart tool anyway for both cloud models.
- Grounding is heuristic. A correct-looking answer containing `18.015` may come from model recall, not the tool. Stronger grounding requires comparing answer tokens to the specific tool result, which this harness does not yet do reliably.
- Multi-turn error recovery, tool timeouts, and adversarial arguments are not covered here.
- The tool-call cap (`TUTOR_MAX_TOOL_CALLS_PER_TURN`, default 3) is now enforced in the graph and unit-tested; it bounds but does not fix repeated-call behaviour.

## Reproduce

```powershell
# local model
npx tsx scripts/agent-tool-benchmark.ts          # BENCH_REPEATS defaults to 3

# free OpenCode model (credential injected from local auth, not printed)
$auth = Get-Content "$env:USERPROFILE\.local\share\opencode\auth.json" -Raw | ConvertFrom-Json
$env:OPENCODE_GO_API_KEY = $auth.'opencode-go'.key
$env:TUTOR_PROVIDER = 'opencode-go'
$env:CANVAS_OPENCODE_GO_MODEL = 'hy4-flash-free'
$env:BENCH_REPEATS = '5'
npx tsx scripts/agent-tool-benchmark.ts
```

## Constraint before real student content

Free-tier cloud models may retain or train on prompts. These cases are synthetic. Do not send real student questions, course excerpts, or canvas content through them until that data flow is explicitly accepted.

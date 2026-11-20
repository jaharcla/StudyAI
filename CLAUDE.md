<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **StudyAI MK3** (167301 symbols, 547618 relationships, 910 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/StudyAI MK3/context` | Codebase overview, check index freshness |
| `gitnexus://repo/StudyAI MK3/clusters` | All functional areas |
| `gitnexus://repo/StudyAI MK3/processes` | All execution flows |
| `gitnexus://repo/StudyAI MK3/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- mcp-routing:start -->
## MCP & plugin routing

Inventory, live tool counts, and per-server detail: `docs/MCP_AND_PLUGINS.md`. Read it before reaching for
anything outside these rules. Only the rules below change how work is done here:

- **Two call styles.** `gitnexus`, `serena`, `gitlab`, `waterloo-learn`, `buffer` are direct — call the
  namespace. Everything else sits behind `mcpproxy`: run `retrieve_tools` first, then invoke the tool through
  the `call_with` variant it returns. Never report a capability as missing until `retrieve_tools` has been
  tried with at least two different wordings.
- **Graph before text.** `gitnexus` is local and indexed: `impact` / `context` / `query` cost nothing and are
  correct on this repo. grep and read are the fallback for literals and `UNKNOWN` results, not the default.
- **Don't write library APIs from memory.** LangGraph, LangChain, CopilotKit, ts-fsrs, React 19 and Vite all
  move; check `context7` first.
- **One memory authority: `agentmemory`.** The `memory` upstream is also connected. Do not split state across
  both.
- **No database MCP exists here.** Query `data/studyai.sqlite` with the PowerShell here-string recipe in
  `docs/MCP_AND_PLUGINS.md`. Do not look for, install, or assume a DB server.
- **Out of scope — do not reach for:** `buffer`, `penpot`, `treg`, `hf-mcp-server`, `com.supabase/mcp` (a
  different project's read-only database), and every `minecraft-*` / `mc-asset` / `rea` / `sonic-filesystem`
  entry.
- **Spend and egress.** `treg` bills per call; `firecrawl` and `exa` burn credits. Ask before any call that
  costs money, and never send `.env`, tokens, or user study data to an open-world tool.
- **Secrets.** PATs are literal strings in `~/.config/opencode/opencode.json`. Never echo, copy, or paste
  them; redact on sight.
- **Write-capable upstreams** (`github`, `com.supabase/mcp`, `com.figma.mcp/mcp`): stay on read variants
  unless the user asked for a change.
<!-- mcp-routing:end -->

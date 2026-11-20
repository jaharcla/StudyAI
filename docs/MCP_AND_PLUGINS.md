# MCP & Plugin Guide — StudyAI MK3

What agent tooling actually exists on this workstation, what to use for StudyAI work, and what to leave
alone. Companion to the routing rules at the end of `CLAUDE.md`.

Verified **2026-11-18** against `opencode mcp list` and `mcpproxy.upstream_servers({operation: "list"})`.
Re-verify with those two commands before trusting the counts below.

---

## 1. Two layers, two call styles

| Layer | How to call | Members |
| --- | --- | --- |
| Direct | Call the namespace directly (`gitnexus`, `serena`, …). In Code Mode: `tools.<ns>.<tool>`. | `gitnexus`, `serena`, `gitlab`, `waterloo-learn`, `buffer` |
| Proxied | `mcpproxy.retrieve_tools({query})` → then the returned `call_with` variant (`call_tool_read` / `call_tool_write` / `call_tool_destructive`). | 15 servers, below |

Proxied servers are **not** individually addressable. If a first `retrieve_tools` query comes back empty,
retry with different wording or just the service name before concluding the capability is absent.

### Proxied servers (live tool counts)

| Server | Tools | Relevant here |
| --- | --- | --- |
| `github` | 49 | Yes — `jaharcla/StudyAI` PRs, issues, checks |
| `com.figma.mcp/mcp` | 44 | Only for design→code work |
| `firecrawl-mcp-server` | 32 | Yes — upstream docs, issues, repo search |
| `playwright` | 25 | Yes — drive the running app, E2E debugging |
| `com.supabase/mcp` | 16 | **No** — read-only, different project (`zxoopxksfhakpvkrilox`) |
| `treg` | 12 | **No** — metered, bills per call |
| `memory` | 9 | **No** — superseded by `agentmemory` |
| `agentmemory` | 7 | Yes — cross-session decisions and gotchas |
| `repomix` | 5 | Only on request — output is huge |
| `context7` | 2 | Yes — library API truth |
| `exa` | 2 | Fallback search when firecrawl misses |
| `hf-mcp-server` | 4 | **No** — this project uses FTS5, not embeddings (`docs/DEPENDENCIES.md`) |
| `penpot` | 4 | **No** |
| `sequentialthinking` | 1 | Rarely; gitnexus + a plan file is better |
| `sub-agents` | 1 | No — use the native `subagent` tool |

### Direct servers

| Server | Status | Use for |
| --- | --- | --- |
| `gitnexus` | connected | Graph: `impact`, `context`, `query`, `explain`, `detect_changes`, `rename` |
| `serena` | connected | Precise TS/TSX symbol lookup and edits where the graph is coarse |
| `waterloo-learn` | connected | UW course/announcement shapes for Canvas fixtures — read-only |
| `gitlab` | connected | `git.uwaterloo.ca` work only |
| `buffer` | connected | Social scheduling — unrelated to this product |
| `figma` | **disabled** | Design work goes through the proxied `com.figma.mcp/mcp` only |

---

## 2. Routing by task

| Task | First choice | Not this |
| --- | --- | --- |
| Where is X / what calls X / what breaks if I change X | `gitnexus` `context` / `impact` | grep |
| Understand a flow end to end | `gitnexus` `query`, then the process resource | reading many files |
| Exact definition, references, safe symbol edit | `serena` | find-and-replace |
| Security question (taint, source→sink) | `gitnexus` `explain` | guessing |
| LangGraph / CopilotKit / ts-fsrs / React / Vite API questions | `context7` | writing from memory |
| Upstream bug, PR, changelog, error string | `firecrawl` developer/issue search, then `exa` | `webfetch` on a search page |
| Click through the app, capture console/network, screenshot | `playwright` | chrome-devtools (disabled) |
| Read a PR, issue, or CI status | `github` read methods | git log alone |
| Real course/assignment/announcement payload shapes | `waterloo-learn` | invented fixtures |
| Cross-session decision, past mistake, "did we try this" | `agentmemory` `memory_recall` / `smart_search` | `memory` |
| Git history on the UW GitLab remote | `gitlab` | — |
| Whole-repo bundle for an external reviewer | `repomix`, only when asked | — |

## 3. Hard rules

1. **`retrieve_tools` before claiming a gap.** Two wordings minimum.
2. **Money.** `treg` charges the team balance per catalog call — state the price from `catalog_get` and get
   consent above one cent. `firecrawl`/`exa` consume credits; batch queries instead of iterating.
3. **Egress.** This tool set is a full lethal trifecta: read + write + open-world. Never send `.env`,
   API keys, `docs/verification-results.json` with user paths, or study/course content to an open-world
   server without being asked.
4. **Secrets.** The GitLab PAT and GitHub PAT are literal strings in `~/.config/opencode/opencode.json`
   (plus its `.bak` chain). Never print them, copy them into a document, or pass them as tool arguments.
   Redact on sight.
5. **Graph rules still apply.** MCP availability never overrides the GitNexus requirements in `CLAUDE.md`:
   impact before editing a symbol, `detect_changes` before committing, `UNKNOWN` is unresolved.
6. **One memory authority.** `agentmemory` (also fed automatically by the `agentmemory-capture` plugin).
   Writing to both `memory` and `agentmemory` splits recall.
7. **Write variants need intent.** `github`, `com.supabase/mcp`, `com.figma.mcp/mcp` expose write and
   destructive tools. Read by default.

---

## 4. Inspecting the database (no DB MCP exists)

`data/studyai.sqlite` is SQLite via `better-sqlite3`. There is no database MCP and none should be installed
for routine work. Use a here-string — inline `-e` quoting breaks in PowerShell:

```powershell
@'
import Database from "better-sqlite3";
const db = new Database("data/studyai.sqlite", { readonly: true });
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name));
'@ | node --input-type=module
```

Current tables: `attempts`, `courses`, `documents`, `document_chunks`, `drawings`, `notes`, plus their
FTS5 shadow tables.

Two table families coexist, and both are correct:

| Family | Tables | Owner |
| --- | --- | --- |
| Legacy TXT | `documents`, `document_chunks`, `chunk_search` | `server/db.ts` + `server/api.ts` |
| Document intelligence | `di_documents`, `di_units`, `di_chunks`, `di_chunk_search` | `server/document-intelligence/schema.ts` |

The `di_*` tables are created when the data API starts (`server/api.ts` calls
`initializeDocumentIntelligenceSchema`). If they are missing from a database, that database has not run
`npm run dev:data` since the subsystem landed — start the data API rather than migrating by hand.

Open `{ readonly: true }` for inspection. For anything that writes, copy the file to `%TEMP%` first — it is
live user data and four dev processes may hold handles.

---

## 5. Plugins

| Plugin | What it does | How to use it |
| --- | --- | --- |
| `superpowers` | Process skills: brainstorming, writing/executing plans, TDD, systematic-debugging, verification-before-completion | Load for *approach*, not domain facts. Skills already injected into a turn must not be re-loaded |
| `agentmemory-capture` | Records session observations for `agentmemory` | Leave it alone; it explains why `memory_sessions` and `memory_recall` already know recent work |
| `rtk-rewrite` | Rewrites shell commands through `rtk hook opencode <cmd>` before execution; condenses output to cut tokens | Do not fight it. If output is empty when it should not be, contradicts its exit code, or is garbled, re-run as `rtk bypass <cmd>` |
| `opencode-gearbox` | Declared in the `plugins` array, **not found on disk** | Treat as inactive. Do not invoke or depend on it until it appears in the config's `node_modules` |

Domain skills (`studyai-project`, gitnexus-*, `test-driven-development`, etc.) live in `.opencode/skills/`
and `~/.config/opencode/skills/`; those are not plugins and cost nothing until loaded.

---

## 6. Known defects to fix, not work around

| Issue | Impact |
| --- | --- |
| Plaintext GitLab PAT in `~/.config/opencode/opencode.json` and its backups | Rotate it; move to `{env:GITLAB_TOKEN}` |
| 11 servers defined twice (disabled in OpenCode, enabled in mcpproxy) | Confusing; prune the disabled copies |
| ~~`figma` direct server unauthenticated~~ | **Fixed 2026-11-18** — direct `figma` disabled in `opencode.json`; the proxied `com.figma.mcp/mcp` is the only route |
| `memory` and `agentmemory` both live | Split-brain recall |
| `opencode-gearbox` listed but absent | Silent no-op at startup |

# Bring the Wolfram/Vega prototype into our branch

> "Don't merge it, look for integrations from that branch into your branch"

Source: open PR #19, branch `spike/mcp-tools-2026-11-23`, base `d0b4398`. Handoff: `docs/INTEGRATION_PROTOTYPE_HANDOFF.md` and `docs/decisions/ADR-2026-11-23-mcp-tools-integration-prototype.md` on that branch. Do not merge the PR and do not push.

## What to integrate

The branch has two throwaway spike commits (`fffa32f`, `0182a68`) and ten integration/doc commits from `9e45bc0` through `73f4f7a`. The valuable pieces:

- Opt-in Wolfram Cloud MCP tools and the Vega chart tool behind `STUDYAI_EXTERNAL_MCP_TOOLS=1`, off by default. Default tutor prompt, tools and canvas benchmark must stay byte-for-byte unchanged.
- Per-turn tool-call cap `TUTOR_MAX_TOOL_CALLS_PER_TURN` with `limit_reached` ToolMessage, unit-tested.
- Ollama `tool_use` content-block fix for `@langchain/ollama@1.0.2`.
- The ADR, verification record and benchmark docs, adapted to the current main.

## Boundaries

- Work only in this worktree and commit to `work/mcp-tools-integration-20261124` with the Discord link from the project instructions.
- Cherry-pick or port deliberately; do not merge the PR branch. Keep the flag off; no default flipped, no paid key, no external call with real student content.
- Resolve conflicts against current main conservatively: preserve the newer Tutor, Coach and acceptance-pass changes. If a hunk is ambiguous, keep main's behaviour and ledger the choice in a short note.
- No new authoring authority, no grounding-rule change, no subagents, no Groq models.

## Verification

- `tsc -b`, targeted Vitest (`tests/mcp-tools.test.ts`, `tests/tutor-integration.test.ts`) and the Vega browser spec. Quote `npm run verify` if the machine allows it; name provider-dependent failures separately.
- One critique URL per commit and three strongest objections inline. Record results in `docs/verification/2026-11-24-mcp-tools-integration.md`.
- Ports: `WEB_PORT=5621`, `RUNTIME_PORT=8631`, `DATA_PORT=8632`, `AGENT_PORT=8521`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8521`, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Load `.env` for local keys without printing them.

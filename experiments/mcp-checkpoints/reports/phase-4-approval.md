# Phase 4 — Approval, tool safety and side-effect correctness

Status: **partial — harness, real bridge unit tests and static metadata checks run; no live bypass probe.**

## What was actually run

### Harness conformance tests (RED → GREEN)

```
npm test -- --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/approval.test.ts
```
- RED: `Cannot find module './approval'`.
- One test-expectation correction: `incorrectPrompts` counts e1 (read-only demands approval), e2 (consequential without prompt) and e6 (consequential bypass, also without prompt) = 3, not 2 as I first wrote. The evaluator logic was unchanged.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- The dirty trace reproduces upstream issue patterns #111 (persisting tool advertises read-only), #112 (plain read demands approval) and #115 (documented input format invalid), plus approval reuse across operations and revisions and an alternate-tool bypass. These are **synthetic encodings**, not executions of the upstream server.

### Real StudyAI bridge tests

```
npx vitest run tests/canvas-ai-bridge.test.ts
```
Result: `Test Files 1 passed (1); Tests 18 passed (18)`, including `requires confirmation for broad batches`, `rejects stale board revisions and requires explicit current revision at approval`, and `rejects stale proposals and board scope changes`.

### Static side-effect and metadata evidence

Verified against this checkout (file:line):
- `src/canvas/ai/canvas-actions.ts:37` — `CANVAS_ACTION_TOOL_DESCRIPTION` begins "Consequential: requires user approval", so the mutation tool's description matches its side effects.
- `src/canvas/ai/canvas-bridge.ts:118,131` — read tools are described as "Read-only."; `:143` marks teaching-scene compilation "Consequential: requires user approval".
- `src/canvas/ai/canvas-actions.ts:35,150` — a proposal carries `id`, `boardId`, `baseRevision` and `expectedFingerprint`; `:176-177` re-checks revision and fingerprint at approval.
- `src/canvas/ai/canvas-actions.ts:187-188` — broad batches and destructive batches require explicit confirmation.
- Phase 2 static grep: all 12 mutation calls under `src/canvas/ai/**` are inside `approveCanvasProposal` or its rollback `restoreCanvasRecords`, so there is no second AI-side mutation path in this module.

These are static assertions plus passing unit tests; they are not a live attempt by a model to bypass the gate.

## Pass criteria assessment

- **No consequential operation bypasses approval** — supported by tool descriptions, the review gate in `propose_canvas_action`, the single-path grep and passing unit tests; **not** proven by a live bypass probe.
- **Approval for one operation cannot authorize another** — supported by proposal ID + board + revision + fingerprint checks and passing stale-approval tests; not proven by a live reuse probe against a running tutor.
- **Correct cancellation/rejection behavior** — not directly probed; the conformance harness models it but no runtime cancellation was executed.
- **Tool metadata accuracy** — our descriptions appear accurate by static inspection. The upstream metadata defects remain encoded as negative tests, not reproduced against the upstream server (no `tools/list` probe was run).

I am **not** claiming full conformance; the live probes listed in the plan remain unexecuted.

## Checkpoint mapping

MCP Elicitation (2025-06-18) specifies an `accept` / `decline` / `cancel` response model, a flat primitive-only requested schema, a prohibition on requesting sensitive information, and client duties to show which server is asking and allow decline at any time. OpenAI Agents SDK HITL persists paused `RunState` and scopes approvals per call ID and server. Our bridge implements an application-level review gate in CopilotKit rather than MCP elicitation; the closest equivalents are: approval record (proposal ID), revision/fingerprint scope (per-call state), and Apply path (resume). The two protocols are not interchangeable, and this campaign did not test a formal mapping between them.

## To complete this phase

1. Run a live tutor session and attempt each operation in `fixtures/approval/operations.json`, recording real approval events as `ApprovalTrace` input.
2. Attempt bypass through every registered tool path, including scientific-object and teaching-scene proposals.
3. Probe the upstream server's `tools/list` annotations to reproduce #111/#112 against the real implementation instead of the synthetic encoding.
4. Re-run the harness tests and regenerate the report from the captured traces.

# Phase 2 — Canvas integrity and mutation authority

Status: **partial — harness and real bridge unit tests run; full multi-actor simulation not run.**

## What was actually run

### Harness evaluator (RED → GREEN)

```
npm test -- --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/integrity.test.ts
```
- RED: `Cannot find module './integrity'`.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- Tests pin: clean trace passes all three campaign pass criteria; dirty trace flags 1 stale acceptance, 1 cross-board write, 1 lost write, 1 replay and a second mutation path.

Definition used by the evaluator: a stale acceptance is an `applied` mutation through `board-authority` whose `baseRevision` differs from its `appliedRevision`. A direct document write is counted separately by `singlePath`, not double-counted as stale.

### Real StudyAI bridge unit tests

Root dependencies were installed in this worktree (`npm install --no-audit --no-fund`, 1616 packages). Then:

```
npx vitest run tests/canvas-ai-bridge.test.ts
```
Result: `Test Files 1 passed (1); Tests 18 passed (18)`.

Note: `docs/QUICKDRAW_AI_BRIDGE.md` records "6 tests passed". The current checkout has 18 tests — another instance of the doc being stale.

Tests relevant to this phase:
- `rejects stale proposals and board scope changes without mutating either board`
- `rejects stale board revisions and requires explicit current revision at approval`
- `requires confirmation for broad batches`
- `reads bounded state and rejects malformed, unsupported, oversized, or conflicting requests`

These are real runtime assertions against the bridge's proposal/approval functions, not synthetic harness traces.

### Single mutation path — static evidence

A search for `.put(`, `.remove(`, `.update(` and `.transact(` under `src/canvas/ai/**/*.ts` found 12 mutation calls, all in `canvas-actions.ts`: 10 inside `approveCanvasProposal` (lines 195–216) and 2 inside `restoreCanvasRecords` (lines 230–234, the rollback of the same path, emitted as a `remote` diff). No AI tool creates a second way to change the document. This is static evidence, not a runtime bypass probe.

## Scenario coverage

The seven scenarios are encoded in `fixtures/concurrency/scenarios.json`.

| Scenario | Status | Evidence |
|---|---|---|
| User edits while agent works | Partially covered | `rejects stale proposals...` and `rejects stale board revisions...` unit tests |
| Agent edits an element changed since read | Partially covered | fingerprint check in `approveCanvasProposal` + stale-proposal tests |
| Two agent operations on same object | Partially covered | unit tests cover stale rejection, not true concurrency |
| Duplicated operation replay | Not run | no replay integration test exists |
| Cross-board target | Covered | `rejects stale proposals and board scope changes without mutating either board` |
| Crash between persistence and broadcast | Not run | requires server/process-level fault injection |
| Reconnect after missed changes | Not run | requires client/server integration environment |

## Pass criteria assessment

- **Zero unauthorized cross-board mutations** — supported by a passing unit test; not proven under live multi-actor conditions.
- **Zero lost acknowledged writes** — not tested; no persistence/broadcast fault injection was run.
- **Zero successful stale writes that should have been rejected** — supported by passing unit tests for revision and fingerprint checks; not proven under concurrency.

I am **not** claiming the pass criteria are met. The harness can evaluate a supplied trace, but no real trace from a multi-actor StudyAI session was captured.

## dim0 checkpoint

dim0 was not executed. Its backend requires Python ≥3.13 with uv plus live Postgres, Qdrant and Redis; only its source was used as an architectural reference. Its single-mutation-path design (`AgentBoardBridge`: persist via `GraphStore`, emit `peer-op`, oplog seq authority) remains the checkpoint to compare against once an integration environment exists.

## To complete this phase

1. Stand up StudyAI runtime with a real board and two actor sessions.
2. Instrument proposal/approval with authority markers, sequence numbers and persist/broadcast events so traces can be fed to `evaluateIntegrity`.
3. Add fault injection for crash-after-persist and client reconnect.
4. Re-run the harness tests and regenerate this report with real traces.

# Baseline — Artifact Intelligence System (Phase 0)

Date: 2026-11-23
Plan: `docs/superpowers/plans/2026-11-23-artifact-intelligence-system.md`
Spec: `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`
Response-quality acceptance criteria: `docs/superpowers/specs/2026-11-23-response-quality-acceptance.md` (owner-supplied examples; most relevant here: Example D, "creating an actual study artifact", and §6 final design principle — a structurally valid artifact must still be genuinely useful).

## Worktree identity (Step 1)

| Field | Value |
|---|---|
| Worktree | `C:/Users/Owner/.local/share/opencode/worktree/e35993/artifact-intelligence` |
| Branch | `work/artifact-intelligence` |
| HEAD / base | `d0b4398ae20a9239edfeb5571fd1f96712dce7ce` (current `main`, newer than the `4961dbb` cited in `docs/next.md`) |
| WEB_PORT | 5313 |
| RUNTIME_PORT | 8243 |
| DATA_PORT | 8244 |
| AGENT_PORT | 8163 |
| LANGGRAPH_DEPLOYMENT_URL | `http://127.0.0.1:8163` |
| Provider keys | none — worktree `.env` is local-only (Ollama + CopilotKit project key needed by the dev server); no cloud-provider spend |

`node_modules` and `hosted/node_modules` are read-only junctions to the root checkout's installed dependencies; no `npm install` was run.

## Foundation inventory (Step 3) — acceptance ledger for Phase 1

Copied from the design spec's "Gaps found in the shipped foundation" with file:line evidence and the task that closes each. This is the acceptance ledger for Phase 1.

| # | Gap (evidence in shipped tree) | Closed by |
|---|---|---|
| 1 | `artifact.kind` does not determine output: `compileArtifactBrief` (`src/canvas/ai/teaching-scene.ts:203-264`) always emits `count` question objects plus an optional figure for all five kinds | Task 1.1 |
| 2 | `problem-set` repeats one prompt N times (`tests/fixtures/canvas-authoring-tasks.ts:39-45` expects 8 identical questions) | Task 1.3 |
| 3 | Figure stubs: `graph` falls through to `equation`, `vector` hardcoded `[1,0,0]`, `anatomy` uses title as `structureId`, `equation` uses title as LaTeX (`teaching-scene.ts:244-263`) | Task 1.4 (graph, vector; anatomy/equation remain out of Phase 1 scope, see ruling below) |
| 4 | No validator beyond schema shape, id collision and `parseCanvasDocument`; physics/expression/geometry authorities exist but are unwired | Task 1.5 |
| 5 | `sourceRefs` filtered for containment only, not claim support (`server/agent.ts:370-378`) | Phase 2 / Review Focus #3 (not Phase 1) |
| 6 | Routing is regex-selected (`server/agent.ts:278-292`); lower-level tools can be hidden | Phase 3 (advisory routing) |
| 7 | Corpus measures compilation/placement/persistence, not intent fidelity, correctness, grounding, pedagogy, visual or interaction quality | Phase 3 quality benchmark |

Ruling: Phase 1's fully-specified tasks cover graph and vector stubs; anatomy and equation figure stubs are recorded as open gaps rather than being fixed by an unspecified change. — cost if wrong: an anatomy/equation brief still falls back to a title-as-identifier; no student-visible contract is advertised as fixed.

## Verification gates (Step 2)

All commands ran from the worktree at base `d0b4398`, before any product edit. Full logs are in `.superpowers/sdd/2026-11-23-artifact-intelligence-system/`.

### `npm run verify` (`tsc -b && vitest run && playwright test`)

- `tsc -b`: exit 0 (the first two attempts failed only because the fresh worktree lacked `node_modules` junctions; after junctioning root `node_modules` and `hosted/node_modules`, typecheck is clean).
- `vitest run`: **89 files / 576 tests passed**, duration 18.31 s.
- `playwright test`: **42 passed, 9 failed, 3 skipped** in 21.9 min; `EXIT=1`.
  - The two documented pre-existing flakes are present and were not hidden or "fixed": `tests/e2e/document-intelligence.spec.ts:5` and `tests/e2e/integration.spec.ts:4`.
  - Seven further failures are caused by this worktree's local-only provider configuration, not by product code: Ollama is not running (`Cannot check Ollama models at http://127.0.0.1:11434: fetch failed`), no cloud keys are present, and the e2e model selector is disabled (`workspace.spec.ts:21` — `waiting for getByTestId('model-select')`, `element is not enabled`). The other failures are timeouts in tutor specs that need a provider (`tutor-math`, `tutor-experience`, `quickdraw-ai`, `adaptive-learning`, `direct-vector`, `math-workspace`).

### `/canvas-verify` underlying commands

`/canvas-verify` is **not installed** in this worktree — reported as "not run — command absent". Its four underlying commands were run instead:

| Command | Result |
|---|---|
| `node node_modules/typescript/bin/tsc -b` | exit 0 |
| `node node_modules/vitest/vitest.mjs run` | 89 files / 576 tests passed |
| `node node_modules/@playwright/test/cli.js test tests/e2e/canvas*.spec.ts` (9 canvas specs, dataset spec excluded by config) | **12 passed, 1 skipped** (`CANVAS_SPECS_EXIT=0`), 56.1 s |
| `npm run benchmark:canvas` | **failed in this environment** — first run: `boardCount 7`, `hardFailures 7`, `mathExactCount 0`, `mathAverageF1 0`, `physAlignStructureCoverage 0`, `totalCostUsd 0`; every board reported `ERROR Cannot check Ollama models at http://127.0.0.1:11434: fetch failed`. A later post-change run with intermittent provider availability produced `hardFailures 4`, `mathAverageF1 0.317`, still failing the gate. Both runs: no prompt/model/provider change; baseline untouched. |

The benchmark could not reproduce a meaningful gate because the local Ollama service is down and no cloud provider keys are present in this worktree (the OpenRouter credit check reported exhausted credits). Per the plan's no-cloud-spend constraint, no keys were copied. **The tracked baseline was not updated.** Its four gate numbers remain **0 hard failures, 4/6 math exact, math F1 0.91, PhysAlign coverage 0.75**.

## Foundation decision

The plan's Phase 2 opens only after the owner approves the boundary ADR (`docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`). This baseline therefore carries Phase 0 and Phase 1 only.

# Canvas Reasoning State — Implementation Plan

> **For the Clancy agent:** Execute this plan task by task in the repository. Use TDD. Run every verification command and quote the output before claiming a task complete. Do not modify `clancy.yaml` while executing; it is the runner configuration.

**Goal:** Replace the single oversized canvas prompt with a sequential reasoning loop: the tutor reads one deterministic canvas chunk at a time, maintains a structured understanding state, revises earlier claims when later evidence contradicts them, and synthesizes the final answer from that state.

**Architecture:** A small blackboard service under `server/canvas-reasoning/` owns the state. The existing saved board, compact shape context, arrow attachments, scene graph, and OCR evidence remain the sources. Each pass sends the current state plus one chunk to the same tutor model with a strict JSON delta schema. Deterministic merge/validation owns identity, evidence, contradictions, and caps. The tutor answers from the final state, not from the raw board.

**Tech Stack:** TypeScript, Zod, existing `buildCanvasAIContext`, `server/canvas-intelligence/scene/`, `canvasInferenceJson`/tutor model providers, Vitest, the running app at `http://127.0.0.1:5183`.

**Spec:** This plan implements the sequential refinement design agreed on 2026-11-19. It supersedes the single-call large-board fallback added earlier.

## Clancy configuration

The repository root `clancy.yaml` is already set to this. Clancy v0.1.3 on Windows passes a fixed double-quoted instruction more reliably than an 18 KB `${PROMPT}` injection; the agent reads the plan from its absolute path.

```yaml
version: 1

agent:
  command: 'opencode run --auto -m opencode-go/deepseek-v4.1-flash "Read C:/Users/Owner/.opencode/plan/plan.md. In C:/Users/Owner/Downloads/StudyAI MK3, execute the first unchecked task, verify it, and check it off in plan.md. Do not redo checked tasks. When every task is checked and verified, end with <promise>DONE</promise>."'

loop:
  max_steps: 30
  timeout: "6h"
  delay: "10s"
  stop_phrase: "<promise>DONE</promise>"
  stop_mode: "suffix"

input:
  prompt: "file:C:/Users/Owner/.opencode/plan/plan.md"
```

With that file in place, run `clancy` from the repository root.

## Starting state

- Branch: `codex/whole-board-scene-experiment`.
- The worktree contains uncommitted user changes in `server/agent.ts`, `server/tutor-presentation.ts`, `src/App.tsx`, and tests. Preserve them. Stage only the files named by the current task; never `git add -A`.
- The plan lives outside the repository. Treat its checkboxes as the progress ledger: execute the first unchecked task, then check it off.
- The dev server may be running. Restart it after server-side changes; the LangGraph agent runs with `--no-reload`.

## Global Constraints

- The saved board revision is authoritative. Every pass is bound to `revisionHash`; a changed revision aborts the run with a stale-revision error.
- The model never invents canvas IDs. It may only cite IDs present in the chunk's `sourceIds`; unsupported claims are dropped.
- Observed, inferred, user-confirmed, and contradicted claims stay distinct.
- Never overwrite a conflicting claim silently. Record a contradiction and let the next pass resolve it.
- Bound the state: max 100 entities, 200 claims, 32 contradictions, 32 unresolved items, 40 KB serialized.
- Small boards keep the current single-call path. The reasoning loop applies to boards over 40 shapes or when the shape context is truncated.
- No new dependency. Reuse Zod, the existing providers, and the existing shape/scene builders.
- Do not lower any canvas OCR, recognition, or region cap.
- Run `npx tsc -b && npx vitest run` before each commit. Run `node .gitnexus/run.cjs detect-changes --scope all --repo .` before commits.
- Do not commit generated fixtures or model outputs; `data/` is ignored.

## Review Focus

1. **Premature absence.** A chunk cannot support “there is no molecule here” until every region that could contain it is covered. Test the Board 1 molecule case explicitly.
2. **Contradiction handling.** Later evidence must be able to revise an earlier claim without erasing it; the state must show both and the resolution.
3. **Evidence integrity.** Every claim cites a source ID from its chunk; IDs not in the chunk are rejected.
4. **Ordering.** Question-relevant chunks run first; early exit only when relevance and unresolved checks both pass.
5. **Fallback.** If a pass fails, malformed JSON arrives, or the call budget is exhausted, the tutor falls back to the existing single-call context with an explicit warning, not a silent blank answer.

---

## File Structure

**Create:**
- `server/canvas-reasoning/types.ts` — Zod schemas for state, chunks, deltas, results.
- `server/canvas-reasoning/state.ts` — normalization, merge, contradiction detection, caps.
- `server/canvas-reasoning/chunks.ts` — deterministic region clustering, overlap, relevance ordering.
- `server/canvas-reasoning/prompts.ts` — pass and synthesis prompts.
- `server/canvas-reasoning/service.ts` — sequential loop, early exit, synthesis, injected `call`.
- `server/canvas-reasoning/index.ts` — exports.
- `tests/canvas-reasoning-state.test.ts`
- `tests/canvas-reasoning-chunks.test.ts`
- `tests/canvas-reasoning-service.test.ts`
- `scripts/benchmark-canvas-reasoning.ts`
- `docs/decisions/ADR-2026-11-19-canvas-reasoning-state.md`
- `docs/verification/2026-11-19-canvas-reasoning-state.md`

**Modify:**
- `server/agent.ts` — run the reasoning pre-pass for large boards and inject the state.
- `server/tutor-context.ts` — accept the reasoning-state context within the budget.
- `tests/tutor-integration.test.ts` — assert the large-board path and fallback.
- `src/canvas/ai/canvas-context.ts` — expose a compact chunk view if needed; no new renderer.

---

### Task 1: State schema and deterministic merge

**Files:**
- Create: `server/canvas-reasoning/types.ts`, `server/canvas-reasoning/state.ts`
- Test: `tests/canvas-reasoning-state.test.ts`

**Interfaces:**
- `CanvasReasoningClaim = { id: string; subject: string; relation: string; object: string; value: string; status: "observed" | "inferred" | "contradicted" | "user"; confidence: number; evidence: string[] }`
- `CanvasReasoningEntity = { id: string; label: string; kind: string; regionId: string; evidence: string[] }`
- `CanvasReasoningState = { schemaVersion: 1; boardId: string; revisionHash: string; question: string; entities: CanvasReasoningEntity[]; claims: CanvasReasoningClaim[]; contradictions: Array<{ claimIds: string[]; reason: string }>; unresolved: Array<{ question: string; relatedIds: string[] }>; coveredChunks: string[]; calls: number }`
- `mergeDelta(state: CanvasReasoningState, delta: CanvasReasoningDelta, allowedSourceIds: ReadonlySet<string>): CanvasReasoningState`

- [ ] **Step 1: Write the failing tests**

  - Merge two claims with the same `subject` and `relation` but different `value` → both remain, one contradiction is recorded, both claims are `contradicted`.
  - A claim citing a source ID outside `allowedSourceIds` is dropped.
  - Duplicate entities/claims are deduplicated by normalized key.
  - Exceeding the cap trims lowest-confidence claims first.
  - A second merge is idempotent for identical deltas.

- [ ] **Step 2: Run it and confirm failure**

  `npx vitest run tests/canvas-reasoning-state.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

  Normalize keys: lowercase, collapse whitespace, trim punctuation. Claim IDs are deterministic hashes of `subject|relation|object|value`. Contradiction IDs are deterministic. Do not resolve contradictions in this module; only record them. Drop claims with empty evidence or out-of-chunk refs.

- [ ] **Step 4: Run the test**

  `npx vitest run tests/canvas-reasoning-state.test.ts` → PASS.

- [ ] **Step 5: Commit**

  `git add server/canvas-reasoning/types.ts server/canvas-reasoning/state.ts tests/canvas-reasoning-state.test.ts`
  `git commit -m "feat: add canvas reasoning state merge"`

---

### Task 2: Deterministic chunk builder

**Files:**
- Create: `server/canvas-reasoning/chunks.ts`
- Test: `tests/canvas-reasoning-chunks.test.ts`

**Interfaces:**
- `CanvasChunk = { id: string; bounds: { x: number; y: number; width: number; height: number }; sourceIds: string[]; labels: string[]; detail: string }`
- `buildCanvasChunks(input: { shapes: CanvasShapeContext[]; objects: ScientificObject[]; question: string; selectedIds: readonly string[] }): CanvasChunk[]`
- Deterministic. No model.

- [ ] **Step 1: Write the failing tests**

  - Six shapes in two spatial clusters produce two chunks with the correct source IDs.
  - An arrow whose endpoint lies in the overlap belongs to both chunks' candidate lists, but its ID is listed once per chunk.
  - A question containing “molecule” and “H” ranks the chunk containing those labels first.
  - “left”/“right”/“top”/“bottom” cues move the matching region earlier.
  - More than six clusters merge into at most six chunks; a single cluster over 40 shapes splits by grid.

- [ ] **Step 2: Run it and confirm failure**

  `npx vitest run tests/canvas-reasoning-chunks.test.ts` → FAIL.

- [ ] **Step 3: Implement**

  Use bounding-box connected components with a 40-unit expansion. Expand each chunk bounds by 10% for overlap. Order by relevance score: text-token overlap with labels plus selected IDs plus directional cues, then by area. Chunk `detail` is a compact JSON string of the chunk's shape summaries (labels, text, arrow attachments), not full bounds.

- [ ] **Step 4: Run the test**

  `npx vitest run tests/canvas-reasoning-chunks.test.ts` → PASS.

- [ ] **Step 5: Commit**

  `git add server/canvas-reasoning/chunks.ts tests/canvas-reasoning-chunks.test.ts`
  `git commit -m "feat: add deterministic canvas reasoning chunks"`

---

### Task 3: One reasoning pass

**Files:**
- Create: `server/canvas-reasoning/prompts.ts`, `server/canvas-reasoning/service.ts` (pass portion)
- Test: `tests/canvas-reasoning-service.test.ts`

**Interfaces:**
- `type ReasoningCall = (input: { system: string; prompt: string }) => Promise<unknown>`
- `runReasoningPass(input: { state: CanvasReasoningState; chunk: CanvasChunk; call: ReasoningCall; signal?: AbortSignal }): Promise<{ delta: CanvasReasoningDelta; callCount: number }>`
- The delta schema: `{ coveredChunkId, entitiesToAdd, claimsToAdd, contradictions, unresolved, confidence }`.
- Prompts instruct: revise freely; do not preserve a prior claim without evidence; absence is allowed only for the covered chunk; return only JSON.

- [ ] **Step 1: Write the failing tests**

  - A fake call returns a valid delta; the state merges and `coveredChunks` includes the chunk.
  - A malformed delta is rejected and retried once; a second malformed response throws.
  - A delta that attempts to add an entity with an unknown source ID is rejected for that entity only.
  - The prompt includes the current claims and the chunk's `sourceIds`.

- [ ] **Step 2: Run it and confirm failure**

  `npx vitest run tests/canvas-reasoning-service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

  Use `z.object` for the delta. Parse leniently (strip unknown keys), then validate source refs. The prompt serializes the state with caps and the chunk detail. One repair retry on parse failure.

- [ ] **Step 4: Run the test**

  `npx vitest run tests/canvas-reasoning-service.test.ts` → PASS.

- [ ] **Step 5: Commit**

  `git add server/canvas-reasoning/prompts.ts server/canvas-reasoning/service.ts tests/canvas-reasoning-service.test.ts`
  `git commit -m "feat: add structured canvas reasoning pass"`

---

### Task 4: Sequential loop, early exit, and synthesis

**Files:**
- Modify: `server/canvas-reasoning/service.ts`
- Test: `tests/canvas-reasoning-service.test.ts`

**Interfaces:**
- `reasonOverCanvas(input: { boardId; revisionHash; question; chunks; call; maxPasses?: number; signal? }): Promise<{ state; answerContext: string; calls: number; exhausted: boolean }>`
- `maxPasses` default 6. Stop when all chunks with relevance ≥ 0.5 are covered and no unresolved item is question-critical; otherwise continue.
- `answerContext` is compact JSON: claims, contradictions, unresolved, confidence.

- [ ] **Step 1: Write the failing tests**

  - Two relevant chunks → two calls, both covered, answer context contains both claims.
  - Low-relevance second chunk and a confident first claim → one call, early exit.
  - A contradiction introduced in pass 2 is present in the final state and the answer context.
  - Six passes with unresolved critical items → `exhausted: true` and `needs_user` in the state.
  - Call failure aborts with an error the caller can fall back from.

- [ ] **Step 2: Run it and confirm failure**

  `npx vitest run tests/canvas-reasoning-service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

  The loop is sequential. Never run chunks in parallel; the local model queues them anyway. On each pass, merge. Recompute relevance coverage. Do not synthesize with a separate call in this task; `answerContext` is the state projection.

- [ ] **Step 4: Run the test**

  `npx vitest run tests/canvas-reasoning-service.test.ts` → PASS.

- [ ] **Step 5: Commit**

  `git add server/canvas-reasoning/service.ts tests/canvas-reasoning-service.test.ts`
  `git commit -m "feat: add sequential canvas reasoning loop"`

---

### Task 5: Integrate into the tutor for large boards

**Files:**
- Modify: `server/agent.ts`
- Modify: `server/tutor-context.ts`
- Test: `tests/tutor-integration.test.ts`

**Interfaces:**
- Gate: `CANVAS_REASONING_MODE` = `auto` (default), `off`, `always`.
- `auto`: run when the saved board has more than 40 shapes or the compact shape context is truncated.
- Small boards keep the existing path.
- If the reasoning run fails or exhausts, inject a warning and keep the existing shape context.

- [ ] **Step 1: Write the failing tests**

  - A 60-shape saved board with a fake reasoning call receives the reasoning state in the system prompt and not the full 60-shape list.
  - A 10-shape board does not invoke reasoning.
  - A reasoning failure falls back to the existing context and adds a warning.
  - The state is bound to the revision: a changed revision rejects the run.

- [ ] **Step 2: Implement**

  Build chunks from the same saved-board shape context already loaded in `server/agent.ts`. Create `call` from the selected `baseModel` (no tools) using `invoke([SystemMessage, HumanMessage])`. Run before the main tutor invocation. Put `answerContext` in a protected context named `"Canvas reasoning state"`. Keep the shape context as a fallback only; if reasoning succeeds, drop the full shape list from the prompt.

- [ ] **Step 3: Budget**

  Update `server/tutor-context.ts` to protect `"Canvas reasoning state"` and bound it to 6,000 characters. Do not count it against the optional canvas-analysis budget.

- [ ] **Step 4: Run tests**

  `npx vitest run tests/tutor-integration.test.ts` → PASS.

- [ ] **Step 5: Commit**

  `git add server/agent.ts server/tutor-context.ts tests/tutor-integration.test.ts`
  `git commit -m "feat: use sequential canvas reasoning for large boards"`

---

### Task 6: Real-board verification

**Files:**
- Create: `scripts/benchmark-canvas-reasoning.ts`
- Create: `docs/verification/2026-11-19-canvas-reasoning-state.md`

- [ ] **Step 1: Build the script**

  Inputs: `--board <id>`, `--question "..."`, `--calls <n>`. It loads the saved board, builds chunks, and runs the reasoning loop with the selected provider. Output: chunks ordered, calls used, final claims, contradictions, answer context, latency. It must not write outside `data/`.

- [ ] **Step 2: Run Board 1**

  Question: “On the right side of the board, what molecule is drawn and what bonds connect the atoms?”
  Expected: the molecule chunk is covered first; the state contains H/C entities and four bond claims; no “no molecule” claim; calls ≤ 3.

- [ ] **Step 3: Run Board 1 force question**

  Question: “At the top left, list the force magnitudes and angle labels.”
  Expected: 70 N, 32 N, 34° (and any other labels in that chunk), calls ≤ 2.

- [ ] **Step 4: Run Board 2**

  Question: “Which change in orbit level produces the shortest wavelength?”
  Expected: one chunk, `b`, no regression.

- [ ] **Step 5: Record**

  Write exact outputs, calls, latency, and contradictions to the verification doc. Do not claim success from a single lucky run; run each question twice.

- [ ] **Step 6: Commit**

  `git add scripts/benchmark-canvas-reasoning.ts docs/verification/2026-11-19-canvas-reasoning-state.md`
  `git commit -m "test: verify sequential canvas reasoning"`

---

### Task 7: ADR and cleanup

**Files:**
- Create: `docs/decisions/ADR-2026-11-19-canvas-reasoning-state.md`

- [ ] **Step 1: Write the ADR**

  Cover: why one large prompt failed on Board 1; why sequential state beats map-reduce and manual selection; the state schema; contradiction policy; chunking and relevance; early-exit rule; costs (calls, latency); fallback; what is still limited (small local models, cross-chunk relations, no persisted board understanding yet).

- [ ] **Step 2: Full verification**

  `npx tsc -b && npx vitest run` → clean. Quote the counts.
  `node .gitnexus/run.cjs detect-changes --scope all --repo .` → inspect, no `partial`/`truncated`.

- [ ] **Step 3: Commit**

  `git add docs/decisions/ADR-2026-11-19-canvas-reasoning-state.md`
  `git commit -m "docs: record canvas reasoning state decision"`

---

## Verification Summary

| Check | Command | Pass condition |
|---|---|---|
| State merge | `npx vitest run tests/canvas-reasoning-state.test.ts` | contradictions, evidence, caps, idempotency |
| Chunking | `npx vitest run tests/canvas-reasoning-chunks.test.ts` | clusters, overlap, relevance, cap |
| Pass | `npx vitest run tests/canvas-reasoning-service.test.ts` | schema, retry, source filtering |
| Loop | same | early exit, exhaustion, contradiction survival |
| Tutor | `npx vitest run tests/tutor-integration.test.ts` | large-board path, small-board bypass, fallback |
| Real boards | `npx tsx scripts/benchmark-canvas-reasoning.ts` | Board 1 molecule + force, Board 2 b |
| Types | `npx tsc -b` | clean |
| Full | `npx vitest run` | all pass |

## Non-Goals

- Parallel model calls.
- Persisting a board-level understanding across revisions.
- A new vision/render pipeline.
- Changing the canvas schema or the provider defaults.
- Guaranteeing correctness on arbitrary handwriting; ambiguity remains explicit.

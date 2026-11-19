# Engineering reuse policy

- Before substantial work, inspect the current code, types, interfaces, and assigned file owners for reusable functionality.
- Research maintained upstream projects and official documentation before choosing to build or add a dependency.
- Compare correctness, maintenance, license obligations, security, performance, and compatibility with StudyAI's local-first architecture.
- Prefer adapting existing code and pinned dependencies. Do not create overlapping authorities or add a dependency without a demonstrated capability gap.
- Record significant reuse-versus-build decisions in a concise ADR before implementation, including alternatives, exact versions/licenses, limits, and verification.
- Bound untrusted expressions, model output, memory, and runtime. Keep calculations deterministic where possible and preserve user data and worktree ownership.

These rules apply to all StudyAI agents, research, implementations, and future phases.

# Canvas invariants

StudyAI's active work is the canvas and canvas intelligence. These rules are binding for every canvas change.

- Every canvas mutation bumps `revision` and persists through `server/canvas-persistence`. Do not write `canvases.document` directly.
- `CanvasDocument.version` may only change together with a migration in `parseCanvasDocument` and a test that loads the previous shape.
- A new `ScientificObject` kind requires all six: model type, registry entry, validation rule, evidence mapping, an e2e interaction test, and a benchmark fixture. Half a kind is not a kind.
- Do not lower OCR region caps, provider budgets, or recognition confidence thresholds without an ADR in `docs/decisions/`.
- Any change to a prompt, model, or provider requires `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json`, with the four gate numbers quoted in the handoff. `--update-baseline` needs an explicit request.
- One authority per board interpretation. Today that is `server/canvas-intelligence/scene/` for whole-board scene work and `server/canvas-analysis/` for direct manipulation. Do not add a third path or let two paths answer the same question.
- Generated outputs (`data/canvas-benchmark/`, `data/canvas-dataset-benchmark/runs/`) are never committed. The baseline and ground truth are.
- Before claiming canvas work is done, run `/canvas-verify`. A green build is not evidence that recognition still works.

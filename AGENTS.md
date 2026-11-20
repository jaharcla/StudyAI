# Engineering reuse policy

- Before substantial work, inspect the current code, types, interfaces, and assigned file owners for reusable functionality.
- Research maintained upstream projects and official documentation before choosing to build or add a dependency.
- Compare correctness, maintenance, license obligations, security, performance, and compatibility with StudyAI's local-first architecture.
- Prefer adapting existing code and pinned dependencies. Do not create overlapping authorities or add a dependency without a demonstrated capability gap.
- Record significant reuse-versus-build decisions in a concise ADR before implementation, including alternatives, exact versions/licenses, limits, and verification.
- Bound untrusted expressions, model output, memory, and runtime. Keep calculations deterministic where possible and preserve user data and worktree ownership.

These rules apply to all StudyAI agents, research, implementations, and future phases.

# Durable verification rules

- UI-visible features need a browser-level test (Playwright) asserting the actual DOM result. Unit tests on helper functions do not prove rendering.
- Never use `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make a prop or import compile. Needing one means the API is probably wrong. Verify against the installed package's type files or source. If suppression is truly unavoidable, use `@ts-expect-error` with a comment explaining why, and tell the user.
- When using a third-party library API, cite the file and line proving it exists in the installed version. Do not rely on memory or older-version docs.
- After wiring a prop or slot, add an assertion that it took effect (testid, class, or output).
- Do not report "done" or "working" without running `npm run verify` and quoting its output. State explicitly what was verified and what was not.
- Before large edits to long lines, view the region and make small edits; run tsc after each.
- Prefer one rendering path per feature. Remove superseded attempts when replacing them.

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

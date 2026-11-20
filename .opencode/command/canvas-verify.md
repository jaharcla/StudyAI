---
description: Verify canvas and canvas-intelligence changes before claiming they work
---

Verify the current working tree for canvas work. Run each command, keep its output, and stop at the first failure.

1. `npx tsc -b`
2. `npx vitest run tests/canvas --reporter=dot`
3. If anything under `tests/e2e/` or `src/canvas/` changed interaction behavior: `npx playwright test tests/e2e/canvas*.spec.ts`
4. If anything under `server/canvas-intelligence/`, `src/canvas/ai/`, or a prompt changed: `npm run benchmark:canvas`

Report, in this order:

- The exact command that failed and its first failing assertion or error, with file:line.
- For step 4: `hardFailures`, `mathExactCount`, `mathAverageF1`, `physAlignStructureCoverage` versus `docs/verification/canvas-benchmark-baseline.json`, and whether the gate exited non-zero.
- What you did not run, and why.

Rules:

- Do not edit or delete tests to make a run pass.
- Do not regenerate the baseline with `--update-baseline` unless the task explicitly asks for a new baseline, and say so if you do.
- "Build passes" is not a verification result for canvas intelligence; the benchmark is.

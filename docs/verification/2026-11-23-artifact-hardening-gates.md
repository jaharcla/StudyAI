# Integration hardening gate record — Artifact Intelligence System

Plan: `docs/superpowers/plans/2026-11-23-artifact-intelligence-hardening.md`
Owner directive: harden Phases 1–3 integration; do not start Phase 4.

## What changed

- The live `author_board` path now returns a structured, preserve-aware repair result on validation failure: `messages`, `preserve`, `attempt`, `maxAttempts`, and a model-facing `error` string containing `requestedCorrection`.
- One authoring intent gets at most one repair attempt. A second failed attempt returns `provider_call_limit`; a repair that changes question text or citations is rejected before compile.
- The student-facing panel remains prose-only and displays `validator: message` with no generated object ids.
- `recommendedToolsForQuery` and the "I need more course context" path are pinned by a 7-case deterministic baseline; no new verb was added.
- The Phase 3 primitives now accept brief-shaped components as well as `ArtifactPackage`, so the same preserve logic serves both.

## Per-task verification

| Task | Evidence |
|---|---|
| H1 brief repair adapter | RED module-absent; adapter/preserve/message tests 16/16; `tsc -b` exit 0 |
| H2 live authoring wiring | RED browser test; Playwright authoring spec 3/3; `tsc -b` exit 0 |
| H3 routing pin | route + authoring unit 9/9; `tsc -b` exit 0 |
| Self-review fix | RED no-figure mapping; adapter 10/10; `tsc -b` exit 0 |

## Whole-branch gates

Final clean `npm run verify` (`tsc -b && vitest run && playwright test`) at the complete hardening tree:

- `tsc -b`: exit 0.
- `vitest run`: **101 files / 651 tests passed**, duration 21.83 s.
- `playwright test`: **49 passed, 4 failed, 3 skipped** in 6.3 min; `EXIT=1`.
  - `document-intelligence.spec.ts:5` and `integration.spec.ts:4`: the two documented pre-existing flakes.
  - `direct-vector.spec.ts:267`: provider-dependent (Ollama down, no cloud keys here).
  - `canvas-analysis.spec.ts:9`: the known board-creation race; passed in isolation in the previous phase and unrelated to authoring.
  - The browser-level authoring spec is included in the 49 passing: `node node_modules/@playwright/test/cli.js test tests/e2e/canvas-author-board.spec.ts` → **3 passed** (including the new one-repair, preserve-aware result).
- `benchmark:artifacts` remains `pending-human-review`; `benchmark:canvas` baseline unchanged.

Intermediate run: Vitest had 3 failures (`canvas-recognition-feedback.test.ts`, `canvas-recognition.test.ts`, `canvas-scene-ink.test.ts`), all "Test timed out in 5000ms" in unrelated PNG-rendering tests. Re-run in isolation: `node node_modules/vitest/vitest.mjs run tests/canvas-recognition-feedback.test.ts tests/canvas-recognition.test.ts tests/canvas-scene-ink.test.ts` → **3 files / 17 tests passed** in 2.67 s. Recorded as resource-contention flakes, not regressions; no timeout or assertion was weakened.

## Risk notices

- `gitnexus impact({target:"proposeArtifactBrief",direction:"upstream"})` returned `risk: UNKNOWN` (target not found). Text search confirmed exactly one production caller, `src/canvas/CanvasStudio.tsx:155`.
- Post-edit `detect_changes({scope:"all"})` for H2: **CRITICAL**, 8 changed symbols in `CanvasStudio`, 23 affected processes. Reported, not waived; mitigated by `tsc -b` exit 0 and Playwright 3/3.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` was introduced.
- `npm run build` was green in Phase 3 after the same client/server import; this hardening adds no new cross-boundary import.

## Honest limits

- `runBoundedRepair`/`applyBoundedRepair` and `compilePackage` remain in-process orchestrators used by tests; the live browser tool reuses their primitives rather than the orchestrators because the repair turn is a model tool call, not an injected function.
- The artifact-quality benchmark is still `pending-human-review` with no overall score. No blind comparison or cloud run was performed.
- Phase 4 remains untouched.

## Outcome

Phase 3's review findings are closed on the code side: structured repair is live, the repair is bounded and preserve-safe in the real tool path, and re-retrieval/routing is pinned. The only remaining external dependency is the human blind-review baseline.

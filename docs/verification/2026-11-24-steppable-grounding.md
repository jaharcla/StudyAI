# Verification — steppable grounding (2026-11-24)

Branch: `work/fix-steppable-grounding-20261124`.

## What changed

- `src/artifacts/package.ts` — `parseArtifactPackage` now includes claims on `worked-example.states[]` in the retrieved-ref and literal-excerpt-containment gates. An invented or non-contained step claim can no longer enter a package.
- `src/artifacts/provenance.ts` — extracted one pure `reviewClaim` gate; `reviewProvenance` now reviews step claims as `componentId/stepId`, and `reviewCompiledStates` applies the same gates to compiler-produced replay states. No new authority, no provider call.
- `src/canvas/ai/teaching-scene.ts` — `CompiledExampleState` now carries `claims: ClaimProvenance[]` and `kind: "view" | "evidence"`. Authored step claims are carried through; claim-free layout/checkpoint steps are labelled `view`. The brief boundary rejects a state claim whose ref was not retrieved.
- `src/canvas/tutor.ts` — unchanged; proposals already forward `CompiledExampleState[]`, so claims and labels reach the rail without a revision bump.
- Tests: new `tests/steppable-grounding.test.ts` (8 cases), fixtures updated in `tests/steppable-player.test.ts`.

View-only stepping is preserved: `reducePlayer` still touches only local cursor state, Take over remains the only mode switch, and the first real edit still bumps revision through the existing persistence path.

## `npm run verify`

Command: `npm run verify` with `WEB_PORT=5521 RUNTIME_PORT=8561 DATA_PORT=8562 AGENT_PORT=8461`.

```
> tsc -b && vitest run && playwright test

Test Files  127 passed (127)
     Tests  811 passed (811)
  Duration  17.03s (transform 5.99s, setup 1.52s, collect 129.40s, tests 25.83s)
Error: Process from config.webServer was not able to start. Exit code: 1
```

TypeScript and all 811 unit tests pass, including the 8 new grounding cases and the existing steppable, provenance and player suites.

### Provider-dependent failure (named separately)

Playwright did not run. The `npm run dev` webServer exits before the browser tests start because the environment lacks a CopilotKit Intelligence project key:

```
[runtime] Error: CopilotKitIntelligence `apiKey` is required and cannot be blank.
[runtime]   at assertConfiguredApiKey (node_modules/@copilotkit/runtime/src/v2/runtime/intelligence-platform/client.ts:2619)
[runtime]   at new CopilotKitIntelligence (server/runtime.ts:12:22)
[runtime] tsx server/runtime.ts exited with code 1
```

This is a missing `CPK_INTELLIGENCE_API_KEY` credential in this worktree, not a regression from this change. No UI was changed, so no new Playwright assertion was added. The existing steppable DOM specs remain unexecuted here.

## Inline critique — three strongest objections

1. **The `view` / `evidence` label is data-only.** The brief forbids UI changes, so the rail still renders every step with the same `generated, not verified` chip and `course excerpt` links. A no-claim checkpoint is now distinguishable in data but not on screen. `reviewCompiledStates` gates the claims, yet a student still cannot see the distinction; surfacing `kind` in the rail is a separate, explicitly out-of-scope UI change.
2. **Containment cannot be enforced in `compileArtifactBrief`.** The compiler receives refs but no retrieved chunks, so a `direct` state claim with a fabricated excerpt is carried into the compiled state and only downgraded at review time. `parseArtifactPackage` still rejects it when chunks are supplied, so the package and canvas entry points are not byte-for-byte identical. Closing that gap means plumbing retrieved chunks into the compiler, which this brief rules out.
3. **`kind: "evidence"` reflects claim presence, not review outcome.** A state whose only claims are `unresolved-conflict` or non-contained direct claims is still `evidence` at the data layer even though review marks it `needs-review`. Consumers must read the `ClaimReview` outcome, not `kind`, before presenting anything as course fact. Step-claim reviews are also keyed to a synthetic `componentId/stepId` rather than a real component id; any consumer keyed strictly on component ids needs adjustment.

## Not verified

- No Playwright DOM assertion ran (missing CopilotKit Intelligence key, above).
- No `benchmark:canvas` run: no prompt, model, provider, recognition threshold or UI changed.
- No learning-outcome claim.

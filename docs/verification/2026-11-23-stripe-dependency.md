# Verification — root `stripe` dependency (2026-11-23)

Decision: `docs/decisions/ADR-2026-11-23-root-stripe-dependency.md`.

## Changes

- Root `package.json`: added `stripe: "23.2.0"` (same version as `hosted/package.json`).
- `package-lock.json`: regenerated with the pinned package; MIT license confirmed from the registry and installed `node_modules/stripe/LICENSE`.

## `npm run verify` output

```
> studyai-mk3@0.1.0 verify
> tsc -b && vitest run && playwright test

Test Files  102 passed (102)
Tests       668 passed (668)
7 failed
3 skipped
46 passed (9.9m)
```

`tsc -b` completed with no errors. The two previous `TS2307: Cannot find module 'stripe'` errors are gone, and no hosted test file fails to collect. The three pre-existing `stripe` collection failures are gone.

## Remaining failures

`npm run verify` is still **not green**: Playwright has 7 failures on the full suite:

- `adaptive-learning.spec.ts:3`
- `canvas-author-board.spec.ts:174`
- `canvas-physics-fbd.spec.ts:9`
- `canvas.spec.ts:53`
- `direct-molecule.spec.ts:9`
- `document-intelligence.spec.ts:5`
- `integration.spec.ts:4`

Two are known live-tutor citation flakes (`document-intelligence`, `integration`). The others are not caused by the Stripe declaration; the same physics, pen/chain and question-authoring specs passed earlier in this work on isolated ports. Diagnosing the full-suite failures is a separate item.

## Not done

No Playwright spec was weakened or skipped to make the chain pass. No Stripe API call or key was introduced at runtime.

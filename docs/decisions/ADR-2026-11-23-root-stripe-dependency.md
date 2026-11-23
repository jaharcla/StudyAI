# ADR-2026-11-23 — Root `stripe` dependency for unified verification

**Status:** Accepted 2026-11-23.

## Context

`hosted/package.json` declares `stripe` 23.2.0 for the credits worker, but the root TypeScript project includes `hosted/src/stripe.ts` and `hosted/src/stripe-webhook.ts` through `tests/*hosted.test.ts`. Root `tsc -b` reported two `TS2307: Cannot find module 'stripe'` errors, and hosted test files failed to collect when `node_modules` had no `stripe` package. That made `npm run verify` fail for a dependency-declaration reason rather than a code defect.

## Decision

Add `stripe: "23.2.0"` to the root `package.json` dependencies, matching the version already pinned by the credits worker, and update `package-lock.json`. License: MIT, confirmed from the registry and from `node_modules/stripe/LICENSE`. The root app remains local-first and does not call Stripe; this only makes the already-committed hosted code type-check and test from the root project.

## Alternatives rejected

- Excluding `hosted/` from `tsconfig.json` and Vitest: would stop verifying the credits worker and leave its tests unrun.
- Installing Stripe only under `hosted/`: root-compiled tests would still fail to resolve it.
- Adding a local ambient declaration for `stripe`: would hide real API type errors in paid-payment code.
- Upgrading Stripe: no capability gap; the worker already pins 23.2.0.

## Verification

Recorded in `docs/verification/2026-11-23-stripe-dependency.md` after running `npm run verify`. Playwright failures unrelated to this dependency are reported separately, not treated as a green chain.

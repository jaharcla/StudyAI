# Verification — Stripe support and credit purchases

Date: 2026-11-22. Branch: detached worktree `C:/Users/Owner/.local/share/opencode/worktree/e35993/work/studyai-credits`.

## What was verified

| Command | Result |
|---|---|
| `npx vitest run tests/ledger-credit.hosted.test.ts` | 3 passed |
| `npx vitest run tests/stripe.hosted.test.ts` | 4 passed |
| `npx vitest run tests/stripe-webhook.hosted.test.ts` | 4 passed |
| `npx vitest run tests/routes.hosted.test.ts` | 9 passed |
| `npx playwright test tests/e2e/stripe-support.spec.ts` | 2 passed |
| `npx tsc -b` | pass |
| `npx tsc -p hosted/tsconfig.json` | pass |
| `npm test` (full unit suite) | 73 files / 488 tests passed, 0 failed |
| GitNexus `detect_changes({scope:"all"})` before each commit | no HIGH/CRITICAL; final UI change medium risk, only `Workspace` and its four app processes |
| Stripe CLI `stripe whoami` | authenticated to `StudyAI sandbox`, acct_1UdwxeGcsHWTE1Jk |
| Stripe planner `stripe tools plan` | guide accepted (`iguide_61VnrfcOxDhSab89Z41GcsHWTE1Jk`); invoice blueprint rejected in favor of Checkout + Tax |
| Sandbox Tax Settings | `status: pending`, `head_office: null`, zero registrations, no threshold data |
| Installed Stripe SDK type checks | `Stripe.createFetchHttpClient` (`stripe.core.d.ts:146`), `StripeConfig.httpClient` (`lib.d.ts:56`), `automatic_tax` (`Sessions.d.ts:2168`), `integration_identifier` (`:2264`), `tax_code` on inline `product_data` (`:3379`), API version `2026-11-18.endive` (`apiVersion.d.ts:1`) |

## `npm run verify` result

Run on fresh ports (`WEB_PORT=5184`, `RUNTIME_PORT=8212`, `DATA_PORT=8213`, `AGENT_PORT=8134`) because a stale dev server on 5183 was serving old UI code.

```
 Test Files  2 failed | 71 passed (73)
      Tests  2 failed | 486 passed (488)

 FAIL  tests/learning-activities.test.ts > runs force and graph variants from validated data through the same lifecycle
      Test timed out in 5000ms
 FAIL  tests/math-workspace.test.ts > persists bounded typed state and rejects out-of-range or malformed saved values
      Test timed out in 5000ms
```

**The gate was not green in that run.** Both failures are 5-second timeouts in pre-existing, Math.js-heavy tests, unrelated to Stripe. Isolated rerun:

```
npx vitest run tests/math-workspace.test.ts tests/learning-activities.test.ts
 Test Files  2 passed (2)
      Tests  16 passed (16)
   Duration  2.05s
```

Recorded as flaky-under-load, not as a Stripe regression. The Stripe and credits tests passed in every run.

## What was NOT verified

- No live Stripe payment, no live webhook delivery, no deployed Worker, no real D1 instance.
- No legal or tax review. Tax code `txcd_10103000` was chosen by the user and must be confirmed with their tax advisor.
- Stripe collects **no tax** until the user sets a head office in Dashboard → Tax → Settings and adds active registrations. This was verified in the sandbox and is a launch limitation, not a bug.
- No live API key was used. Tests inject a fake Checkout client and a fake signature verifier. The user must set `STRIPE_SECRET_KEY` (restricted `rk_` key) and `STRIPE_WEBHOOK_SECRET` with `wrangler secret put`; the webhook endpoint URL must be registered in the Stripe Dashboard.
- Refunds are manual; credits are not revoked automatically. `checkout.session.expired` and disputes are not handled.
- Subscriptions (Billing) and hosted Invoices are out of scope, despite being in the initial product list.

## Deferred

- Customer Portal, saved cards, subscriptions, metered billing.
- Automatic refunds, chargebacks, dispute handling, and tax filing.
- Replacing the offline redemption codes — they remain the zero-cost path.
- Any paid restriction on core features.

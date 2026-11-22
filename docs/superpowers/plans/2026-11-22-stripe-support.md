# Stripe Support and Credit Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Support panel offering a Stripe donation or a credit purchase that automatically credits the buyer's StudyAI wallet, without changing BYOK or any existing feature.

**Architecture:** The React app posts a kind and a server-known amount *choice* to the existing Worker. The Worker resolves the choice to a fixed amount, creates a Stripe Checkout session, and returns only the redirect URL. A signed Stripe webhook is the sole authority that credits the wallet, through the same ledger `creditWallet` function the redemption path will also use. Event IDs are recorded so a replay is a no-op.

**Tech Stack:** TypeScript, Cloudflare Workers + D1, `stripe@23.2.0` (MIT), Vitest, Playwright, existing Vite/React app.

**Spec:** `docs/superpowers/specs/2026-11-22-stripe-support-design.md` — read it before starting. It owns the product decisions; this plan implements them.

## Global Constraints

- Donation choices are $2 / $5 / $10. Credit choices are $5 / $10 / $20. Resolve them server-side only; never accept a client-supplied amount.
- `creditMicros = amountCents * 10_000` (integer arithmetic; $1 = 1,000,000 micros).
- Webhook requests are exempt from `x-studyai-client` but must pass Stripe signature verification with `STRIPE_WEBHOOK_SECRET`. All other routes keep the client-marker and restricted-origin checks.
- Only `checkout.session.completed` with `payment_status: "paid"` and `metadata.kind === "credits"` credits a wallet.
- A replayed Stripe event must credit at most once, using the event ID as the idempotency key.
- Refunds are manual in the Stripe dashboard; no automatic refund or revocation is built.
- BYOK remains primary and free. Nothing becomes paid-only.
- `stripe@23.2.0` is the only new dependency; add it to `hosted/package.json` and amend the ADR before implementation. Use API version `2026-11-18.endive`.
- Use a restricted API key (`rk_`) stored as a Worker secret, not a secret key. No secrets or live payment calls in tests. No new `VITE_*` variables are needed; Stripe stays server-side.
- Credit Checkout Sessions use `automatic_tax: { enabled: true }`, Product tax code `txcd_10103000`, Prices with `tax_behavior: "exclusive"`, USD. Donation Sessions do not enable `automatic_tax`.
- Verified sandbox state 2026-11-22: Tax Settings `pending` (no head office), zero registrations, no thresholds — automatic_tax collects no tax until the user sets a head office and adds registrations with a tax advisor.
- Never pass `payment_method_types`. Every Checkout Session carries `integration_identifier` with an 8-random-letter suffix.
- Webhook handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`; fulfillment only when `payment_status !== "unpaid"`.
- Never use `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`. Cite installed type definitions when using the Stripe SDK.
- UI changes require a Playwright test asserting real DOM (`data-testid`).
- Run `npx tsc -b`, `npx tsc -p hosted/tsconfig.json`, and `npm test` before each commit; run `npm run verify` at the end and quote its output. The two known live-tutor e2e flakes are tracked separately.
- Detect changes with GitNexus before committing; if `.gitnexus/run.cjs` is absent, use the MCP tool with the worktree path and record the result.

## Review Focus

1. **Amount tampering.** A crafted request with an arbitrary amount must be rejected; the Worker never uses a client number. Test: `resolveAmount` rejects unknown choices and the checkout route returns 400 for one.
2. **Webhook replay.** Stripe retries the same event; the wallet must be credited once. Test: two `handleStripeWebhook` calls with the same event ID yield one credit.
3. **Unpaid or abandoned session.** An event with `payment_status !== "paid"` must not credit. Test that explicitly.
4. **Donation vs credits.** A `kind: "donation"` checkout must never credit a wallet. Test that explicitly.
5. **Redirect without webhook.** The browser returning from Stripe must only refresh the displayed balance; it must not credit anything itself. Test the UI refresh path without a webhook call.

---

## File Structure

**Create:**
- `hosted/migrations/0002_stripe.sql` — `stripe_events(event_id TEXT PRIMARY KEY, kind TEXT, created_at TEXT)`.
- `hosted/tests/ledger-credit.test.ts`
- `hosted/tests/stripe.test.ts`
- `hosted/tests/stripe-webhook.test.ts`
- `tests/ledger-credit.hosted.test.ts`, `tests/stripe.hosted.test.ts`, `tests/stripe-webhook.hosted.test.ts` — one-line wrappers so root Vitest discovers hosted tests.
- `tests/e2e/stripe-support.spec.ts`
- `docs/verification/2026-11-22-stripe-support.md`

**Modify:**
- `hosted/src/ledger.ts` — add `creditWallet`; `redeemCode` delegates to it.
- `hosted/src/index.ts` — extend `WorkerEnv`, add `/v1/checkout` and `/v1/stripe/webhook`, add the D1 event adapter, exempt the webhook from the client marker.
- `hosted/package.json` / `hosted/package-lock.json` — add `stripe@23.2.0`.
- `src/App.tsx` — Support panel in settings plus the return-from-Stripe refresh.
- `docs/decisions/ADR-2026-11-21-studyai-scoped-credits.md` — amendment for the dependency, webhook, and manual refunds.

---

### Task 1: Ledger credit function and stripe events table

**Files:**
- Modify: `hosted/src/ledger.ts`
- Create: `hosted/migrations/0002_stripe.sql`, `hosted/tests/ledger-credit.test.ts`, `tests/ledger-credit.hosted.test.ts`

**Interfaces:**
- Consumes: `LedgerStore`, `WalletRow`, `LedgerEntry` from `hosted/src/ledger.ts`.
- Produces:
  - `creditWallet(walletId: string, amountMicros: number, reason: string, store: LedgerStore): Promise<{ balanceMicros: number }>`
  - `redeemCode` keeps its existing signature and now calls `creditWallet` with reason `code_redeem`.

- [ ] **Step 1: Write the failing tests**

In `hosted/tests/ledger-credit.test.ts`, reuse the in-memory `LedgerStore` fake pattern from `hosted/tests/ledger.test.ts`. Assert: `creditWallet` increases the balance by exactly `amountMicros` and appends one `ledger_entries` row with the given reason; zero and negative amounts throw; an amount above 20_000_000 micros throws; `redeemCode` still credits exactly once and writes reason `code_redeem`; a repeat `redeemCode` still throws `CodeError`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ledger-credit.hosted.test.ts`
Expected: FAIL — `creditWallet` does not exist.

- [ ] **Step 3: Implement `creditWallet` and refactor `redeemCode`**

`creditWallet` reads the wallet, increments `balance_micros` and `version`, calls `store.updateWallet`, and inserts an entry with `delta_micros = amountMicros` and the supplied reason. Validate amount before any store call. `redeemCode` keeps its code checks and delegates the balance change to `creditWallet`.

- [ ] **Step 4: Add the migration**

`0002_stripe.sql` creates `stripe_events(event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ledger-credit.hosted.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hosted/src/ledger.ts hosted/migrations/0002_stripe.sql hosted/tests/ledger-credit.test.ts tests/ledger-credit.hosted.test.ts
git commit -m "feat(support): add ledger credit function and stripe events table"
```

---

### Task 2: Amount allowlist and Checkout session creation

**Files:**
- Create: `hosted/src/stripe.ts`, `hosted/tests/stripe.test.ts`, `tests/stripe.hosted.test.ts`
- Modify: `hosted/package.json`, `hosted/package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SupportKind = "donation" | "credits"`
  - `type Amount = { amountCents: number; creditMicros: number }`
  - `resolveAmount(kind: SupportKind, choice: string): Amount`
  - `type StripeCheckoutClient = { createSession(params: CheckoutParams): Promise<{ url: string }> }`
  - `createCheckoutSession(input: { kind: SupportKind; choice: string; walletId: string; origin: string; integrationIdentifier: string }, client: StripeCheckoutClient): Promise<{ url: string }>`
  - `createStripeCheckoutClient(secretKey: string): StripeCheckoutClient` — the real adapter over the installed Stripe SDK.

- [ ] **Step 1: Add the dependency and verify the SDK API**

Add `stripe@23.2.0` to `hosted/package.json` `dependencies`, run `npm install --prefix hosted`, then read the installed Stripe type definitions to find the Worker-compatible HTTP client and the Checkout Sessions create method. Record the exact file and line in the report. Do not write SDK calls from memory.

- [ ] **Step 2: Write the failing tests**

Assert: `resolveAmount("donation", "small")` → `{ amountCents: 200, creditMicros: 0 }`; `resolveAmount("credits", "medium")` → `{ amountCents: 1000, creditMicros: 10_000_000 }`; every declared choice is exact; unknown kind or choice throws. `createCheckoutSession` with an injected fake client passes mode `payment`, currency `usd`, `client_reference_id = walletId`, metadata `{ kind, credit_micros }`, the supplied `integrationIdentifier`, the supplied `origin` in success/cancel URLs, and returns the fake URL. For `kind: "credits"` it sets `automatic_tax: { enabled: true }`; for `donation` it does not. It must not pass `payment_method_types` and must not forward any client-supplied amount.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/stripe.hosted.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the allowlist and session factory**

Pin the exact maps: donation `{ small: 200, medium: 500, large: 1000 }`, credits `{ small: 500, medium: 1000, large: 2000 }` cents. Compute `creditMicros = amountCents * 10_000` for credits, zero for donation. Export `createStripeCheckoutClient(secretKey)` using the Worker-compatible Stripe HTTP client confirmed in Step 1; tests inject a fake instead.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/stripe.hosted.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hosted/src/stripe.ts hosted/tests/stripe.test.ts tests/stripe.hosted.test.ts hosted/package.json hosted/package-lock.json
git commit -m "feat(support): add server-side amount allowlist and Stripe checkout sessions"
```

---

### Task 3: Signed webhook with idempotent crediting

**Files:**
- Create: `hosted/src/stripe-webhook.ts`, `hosted/tests/stripe-webhook.test.ts`, `tests/stripe-webhook.hosted.test.ts`

**Interfaces:**
- Consumes: `creditWallet` from Task 1.
- Produces:
  - `type StripeEvent = { id: string; type: string; data: { object: { payment_status?: string; client_reference_id?: string | null; metadata?: Record<string, string> } } }`
  - `interface StripeEventStore { hasEvent(id: string): Promise<boolean>; recordEvent(id: string, kind: string, createdAt: string): Promise<void> }`
  - `handleStripeWebhook(request: Request, env: { STRIPE_WEBHOOK_SECRET: string; store: LedgerStore; events: StripeEventStore }, constructEvent: (body: string, signature: string, secret: string) => StripeEvent): Promise<Response>`
  - `verifyStripeSignature(body: string, signature: string, secret: string): StripeEvent` — the real verifier over the installed Stripe SDK.

- [ ] **Step 1: Write the failing tests**

Use `new Request` with a raw body and `stripe-signature` header; inject a stub `constructEvent`. Assert: an invalid signature (stub throws) → 400 and no store writes; `checkout.session.completed` + `paid` + `metadata.kind = "credits"` credits the hashed wallet id exactly once; the same event ID delivered twice credits once; `checkout.session.async_payment_succeeded` + paid credits once; `checkout.session.async_payment_failed` credits nothing; `payment_status: "unpaid"` credits nothing; `kind: "donation"` credits nothing; an event with no `client_reference_id` credits nothing; an unrelated event type credits nothing but is recorded.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/stripe-webhook.hosted.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the handler and the real verifier**

Implement `verifyStripeSignature` using the Stripe SDK method confirmed from installed types. In `handleStripeWebhook`, read the request body as text, pass it and the signature header to `constructEvent`, and return 400 on any throw. For a completed paid credit event, check `events.hasEvent(event.id)` first, call `creditWallet` with `reason = "stripe_event:" + event.id` and `creditMicros` from metadata, then `events.recordEvent(...)`. Record every successfully verified event ID, including donation and non-credit events. The reason string is the second idempotency guard.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/stripe-webhook.hosted.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/stripe-webhook.ts hosted/tests/stripe-webhook.test.ts tests/stripe-webhook.hosted.test.ts
git commit -m "feat(support): add signed Stripe webhook with idempotent crediting"
```

---

### Task 4: Worker routes and D1 event adapter

**Files:**
- Modify: `hosted/src/index.ts`, `hosted/tests/routes.test.ts`

**Interfaces:**
- Consumes: `resolveAmount`, `createCheckoutSession`, `StripeCheckoutClient` from Task 2; `handleStripeWebhook`, `StripeEventStore` from Task 3.
- Produces: `makeFetch(store: LedgerStore, env: WorkerEnv, deps?: { stripe?: StripeCheckoutClient; constructEvent?: (body: string, sig: string, secret: string) => StripeEvent })`. `WorkerEnv` gains `STRIPE_SECRET_KEY: string`, `STRIPE_WEBHOOK_SECRET: string`.

- [ ] **Step 1: Write the failing tests**

Extend `hosted/tests/routes.test.ts`. Assert: `POST /v1/checkout` with a valid choice returns 200 and the mocked session URL; an unknown choice returns 400; a missing wallet token returns 401; the client marker is still required for checkout; `POST /v1/stripe/webhook` works without the client marker, delegates signature verification to the injected stub, and returns 400 when the stub throws; ordinary routes still reject a missing client marker.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/routes.hosted.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the routes and adapter**

Add `POST /v1/checkout` before the generic fallback: hash the bearer token to a wallet id, resolve the amount, generate `integrationIdentifier` as `studyai-<8 random letters>`, call the injected or real Stripe client with `origin = env.STUDYAI_ORIGIN`, return `{ url }`. Add `POST /v1/stripe/webhook` before the client-marker check, using an injected `constructEvent` or the Stripe SDK verifier and a D1-backed `StripeEventStore` over the `stripe_events` table. Keep CORS restricted to `env.STUDYAI_ORIGIN`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/routes.hosted.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/index.ts hosted/tests/routes.test.ts
git commit -m "feat(support): add checkout and webhook routes to the Worker"
```

---

### Task 5: Support panel and post-checkout refresh

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/e2e/stripe-support.spec.ts`

**Interfaces:**
- Consumes: `CREDITS_API` from `src/api.ts`; `POST /v1/checkout` from Task 4.
- Produces test ids: `support-panel`, `support-kind-donation`, `support-kind-credits`, `support-amount`, `support-checkout-button`, `support-status`.

- [ ] **Step 1: Write the failing browser test**

In `tests/e2e/stripe-support.spec.ts`, intercept `**/v1/checkout` and `**/v1/wallet`, navigate with `waitUntil: "domcontentloaded"`, open Settings, assert the panel and both kind controls are visible, select `credits` and amount `medium`, click the checkout button, assert the intercepted request body is `{ kind: "credits", choice: "medium" }`, and assert the resulting status text names Stripe. Add a second test that loads `/?checkout=success`, asserts the wallet endpoint was called, and shows the "credits may take a moment" message.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/stripe-support.spec.ts`
Expected: FAIL with missing test ids.

- [ ] **Step 3: Implement the panel**

Add state for kind, choice, and status. Render the Support panel in the existing settings modal, independent of the selected provider. The checkout handler posts `{ kind, choice }` with the existing wallet-token and client-marker headers; on a `{ url }` response it sets `window.location.href = url`. On mount, if the URL contains `checkout=success`, call `refreshCreditBalance` and show the pending-credits message. No Stripe publishable key and no new `VITE_*` variable.

- [ ] **Step 4: Run the browser test to verify it passes**

Run: `npx playwright test tests/e2e/stripe-support.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck and unit tests**

Run: `npx tsc -b && npx tsc -p hosted/tsconfig.json && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx tests/e2e/stripe-support.spec.ts
git commit -m "feat(support): add Stripe support panel to settings"
```

---

### Task 6: ADR amendment, verification, and handoff record

**Files:**
- Modify: `docs/decisions/ADR-2026-11-21-studyai-scoped-credits.md`
- Create: `docs/verification/2026-11-22-stripe-support.md`

**Interfaces:**
- Consumes: all of Tasks 1–5.
- Produces: a recorded decision and an honest verification record.

- [ ] **Step 1: Amend the ADR**

Record `stripe@23.2.0` (MIT) as a new Worker dependency, the webhook authority model, event-ID idempotency, the manual-refund policy with its limitation (credits are not revoked on refund), tax code `txcd_10103000` with exclusive tax behavior in USD, the planner reconciliation (invoice blueprint rejected in favor of Checkout + Tax), and that automatic_tax collects nothing without a head office and active registrations.

- [ ] **Step 2: Run the full verification set**

Run: `npm run verify`, then GitNexus `detect_changes({scope:"all", worktree: <path>})`. Expected: quote the real `npm run verify` output, including any known live-tutor e2e failures; record the detect-changes result and its staleness limitation.

- [ ] **Step 3: Write the verification record**

State exactly what was verified (ledger crediting, allowlist, webhook signature/replay/unpaid/donation/async events, routes, browser DOM, typechecks) and what was not (no live Stripe payment, no deployed webhook, no legal or tax review, no refund automation). Include the verified sandbox Tax Settings state (`pending`, no head office), zero registrations, and the consequence that automatic_tax collects no tax until the user configures them with a tax advisor.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/ADR-2026-11-21-studyai-scoped-credits.md docs/verification/2026-11-22-stripe-support.md
git commit -m "docs(support): record Stripe decision and verification"
```

---

## Deferred (explicitly out of this plan)

- Stripe Customer Portal, saved cards, subscriptions, and metered billing.
- Automatic refunds, chargebacks, and tax calculation beyond Stripe defaults.
- Replacing the offline redemption codes — they remain the zero-cost path.
- Any paid restriction on core features.

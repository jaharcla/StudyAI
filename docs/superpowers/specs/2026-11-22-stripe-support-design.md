# Stripe support and credit purchases — design

## Intent

Give people two optional ways to support StudyAI from inside the app: a pure donation, and a purchase that adds StudyAI credits to their wallet. BYOK stays the primary path and nothing becomes paid-only. The GitHub Student Developer Pack supplies $25 in Stripe credits and waived fees on the first $1,000 processed, so this can start at zero cost.

## Goals

- One "Support StudyAI" panel in the settings modal with both choices side by side.
- Donations complete with no change to any wallet.
- Credit purchases add credits automatically to the buyer's StudyAI wallet.
- No new payment logic in the React app beyond a POST and a redirect.
- Reuse the existing ledger; do not create a second credit authority.

## Non-goals

- No subscriptions (Billing), no emailed invoices (Invoicing), no saved cards, no Customer Portal, no metered billing.
- No Managed Payments (3.5% add-on; eligibility unknown for this account).
- No automatic refunds or chargebacks.
- No change to BYOK, the tutor, the canvas, or any core feature.
- No general-purpose API or resale of provider keys.

## Anti-goals

- A paywall on any existing capability.
- Trusting a client-supplied amount or wallet id at credit time.
- Double-crediting a wallet if Stripe retries a webhook.

## Constraints

- `hosted/` is a Cloudflare Worker with D1 and a strict TypeScript build; no new runtime dependency without an ADR amendment.
- The existing Worker rejects requests without `x-studyai-client`; the Stripe webhook arrives from Stripe, not the app, so it needs an explicit, narrow exemption.
- Provider-terms boundary from ADR-2026-11-21 still applies: credits are StudyAI-scoped, not portable API access.
- Legal review remains a gate before taking real money. This design is not legal or tax advice.
- Stripe Tax: use the latest API version (`2026-11-18.endive`) and Node SDK `23.2.0`. Use a restricted API key (`rk_`) in Worker secrets, not a secret key.
- `automatic_tax` must not be trusted without active registrations and a `status: active` Tax Settings. Verified in the sandbox on 2026-11-22: Tax Settings `pending` (no head office), zero registrations, no threshold data — so no tax will be collected anywhere until those are added.
- Never pass `payment_method_types`; dynamic payment methods stay enabled. Tag sessions with `integration_identifier` (label + 8 random letters) as required on API versions after `2026-03-25.dahlia`.

## Approaches

1. **Two hosted Stripe Payment Links** — zero new code; the credits link needs codes delivered manually by email. Rejected: the credit half stays manual and the two buttons behave differently.
2. **Worker-owned Checkout + signed webhook** (chosen) — one Support panel, automatic credit delivery, one place to audit. Costs a `stripe` dependency, a webhook endpoint, an events table, and a documented refund policy.
3. **Gumroad / Ko-fi** — storefront handles everything but the purchase happens off-site. Rejected: the user wants both options inside StudyAI.

**Planner reconciliation (2026-11-22):** the Stripe implementation planner was run with the full business context (`stripe tools plan`, guide `iguide_61VnrfcOxDhSab89Z41GcsHWTE1Jk`, status accepted). It produced a *hosted invoice payment* blueprint because "Invoicing" was listed as a required product. That blueprint conflicts with this product: there are no customer emails or accounts, and the Support panel is anonymous and browser-scoped. The user then chose **Checkout + Stripe Tax, USD, worldwide students**, so the invoice and subscription paths are explicitly out of scope. This design overrides the planner blueprint for this integration; the planner's general guidance (Link, Dynamic Payment Methods, Adaptive Pricing) is retained where it fits.

## How it will work

- **Amounts are server-side allowlists.** Donation: $2 / $5 / $10. Credits: $5 / $10 / $20. The browser sends a `kind` and an amount *choice*, never a number. The Worker resolves the choice to cents and, for credits, to micros.
- **`POST /v1/checkout`** requires the normal wallet token and client marker. It creates a Stripe Checkout session in `payment` mode with `client_reference_id = hashToken(walletToken)`, metadata `{ kind, credit_micros }`, and an `integration_identifier` label plus 8 random letters. `payment_method_types` is omitted so dynamic payment methods stay enabled. It returns only the session URL; the browser redirects. No publishable key is needed in the app.
- **Stripe Tax:** credit purchases use `automatic_tax: { enabled: true }` on the Checkout Session, a Product carrying tax code `txcd_10103000` (SaaS, personal use, cloud delivered), and Prices with `tax_behavior: "exclusive"` so the $5/$10/$20 shown to students are before tax. Prices are USD. Donation sessions do **not** enable `automatic_tax` (no taxable goods are delivered). Stripe collects no tax until a head office address is set in Tax Settings and an active registration exists in the customer's jurisdiction; this is a known, documented limitation at launch, and the user must review obligations with a tax advisor.
- **`POST /v1/stripe/webhook`** is exempt from the client-marker check but verifies the raw body with `STRIPE_WEBHOOK_SECRET` using Stripe's signature verification. It handles both `checkout.session.completed` and `checkout.session.async_payment_succeeded`, gated on `payment_status !== "unpaid"`, and records `checkout.session.async_payment_failed` without crediting. For a paid credit event it inserts the Stripe event ID into a new `stripe_events` table (unique primary key) and credits `client_reference_id` through a new `creditWallet(walletId, amountMicros, reason)` function in `hosted/src/ledger.ts`. `redeemCode` is refactored to call that same function. An already-seen event ID is a no-op. Donation sessions are recorded as seen and not credited. Fulfillment is driven only by the webhook, never by the success page.
- **Wallet identity** is the existing browser token. A person on a different browser uses a different wallet; the recovery code is the only way to move a balance. This is stated in the panel.
- **Refunds are manual** in the Stripe dashboard. Credits already granted are not revoked automatically; this limitation is documented in the panel and the ADR.
- **`stripe@23.2.0` (MIT)** is added to `hosted/package.json` dependencies, with an ADR amendment. Implementation must configure Stripe's fetch-based HTTP client for Workers and verify the exact method against the installed type definitions.
- **Migration `0002_stripe.sql`** adds `stripe_events(event_id TEXT PRIMARY KEY, kind TEXT, created_at TEXT)`.
- **Return from Stripe:** `success_url` points back to the app with `?checkout=success`. On load, the settings panel refreshes the wallet balance and shows "payment received — credits may take a moment" for a credit purchase. The webhook is the authority; the redirect is only a prompt to refresh.
- **UI:** the Support panel appears in settings regardless of selected provider. Two segmented choices, an amount selector, a "Continue to Stripe" button, the wallet/recovery disclosure, and a short "payments processed by Stripe" line. Test ids: `support-panel`, `support-kind-donation`, `support-kind-credits`, `support-amount`, `support-checkout-button`.
- **Tests:** ledger test for `creditWallet`; webhook tests for signature rejection, idempotent replay, no credit on donation, no credit when payment is unpaid; checkout test that an unknown amount choice is rejected; Playwright test that the panel renders and a mocked `/v1/checkout` response redirects. No live Stripe call in tests.

## What is left to the builder

- Confirm Stripe SDK's Worker-compatible HTTP client from installed types before writing the session call.
- Choose the exact Stripe dashboard configuration (webhook endpoint URL, events to send, secret keys) without committing secrets.
- Add an ADR amendment for the new dependency and the manual-refund policy.
- Re-run the full verification gate; the two known live-tutor e2e flakes are tracked separately.

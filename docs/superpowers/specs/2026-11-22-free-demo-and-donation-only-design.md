# Free demo credits and donation-only Stripe — design

## Intent

Remove paid StudyAI credits. Keep Stripe for donations only, keep BYOK as the path for real usage, and make the keyless experience a small free allowance backed by a free tier that costs the author nothing. This resolves the conflict between the promise "credits buy AI" and the constraint "I never pay the provider."

## Goals

- No user payment ever funds inference. Donations promise no service; delays are harmless.
- A student without a key can still try the tutor a few times per day.
- BYOK remains the primary, unlimited path and is unchanged.
- Existing ledger, wallet, and Groq gateway code is reused; nothing is thrown away.

## Non-goals

- No paid credit packs, no token resale, no Stripe Tax on credits.
- No contributor revenue split — deferred until contributors actually join.
- No x402 or crypto rail — future option only.
- No new provider for the demo; Groq free tier is sufficient at the chosen cap.

## Anti-goals

- A free allowance large enough to be oversubscribed or to trigger provider charges.
- A checkout button that implies payment buys AI usage.
- Silently keeping the credit-granting webhook path alive after paid credits are removed.

## Constraints

- Groq free tier: 30 req/min, ~1,000 req/day, 8,000 tok/min, 200,000 tok/day. No card charge while within limits.
- Chosen cap: **20,000 micros ($0.02) per browser per UTC day**, **5,000 micros ($0.005) per request**. At pinned rates (~600 micros per typical message) that is ≈30 messages/day, far inside the free tier.
- The demo grant must be idempotent per wallet per day: ledger entry reason `demo_grant:<walletId>:<YYYY-MM-DD>`.
- The browser wallet token stays browser-scoped; a new browser can reset the allowance. The cap is deliberately tiny.
- Stripe remains a direct merchant account. Donation checkout uses `kind: "donation"` only, no `automatic_tax`, no product tax code.

## Approaches

1. **Automatic daily grant per browser** (chosen) — self-serve, no signup, tiny cap. Abuse is bounded by the $0.02/day ceiling and per-request cap.
2. **Manual free codes only** — author hands out codes; zero abuse but a bottleneck.
3. **Both** (chosen as a supplement) — keep the already-built offline redemption codes as manual top-ups for people who need more; no payment involved.

## How it will work

- On the first chat request of each UTC day, the Worker calls `creditWallet` with reason `demo_grant:<walletId>:<day>` for 20,000 micros, guarded by a check for an existing entry with that reason. Then the normal `reserve → callGroq → capture` flow runs.
- When the daily allowance is exhausted, the gateway returns 402 with a clear message: free demo used for today — use your own key or support the project.
- The Support panel shows **Donate only**; the "Buy credits" choice and amount options disappear. `POST /v1/checkout` rejects `kind: "credits"`.
- The Stripe webhook no longer credits wallets. It records event IDs only, or is removed if no bookkeeping is wanted. No tax code or `automatic_tax` on donation sessions.
- Existing redemption codes remain, relabelled as free top-up codes. No money moves.
- ADR and verification records are amended; the research document already states the constraint.

## Tests

- Idempotent daily grant: two calls in one day credit once; a new UTC day credits again.
- Gateway 402 after the allowance is spent; 400 for over-per-request amounts.
- Checkout route rejects `kind: "credits"`; donation checkout still returns a URL.
- Webhook never credits a wallet.
- Playwright: Support panel has no credit-purchase control; BYOK path still available.

## What is left to the builder

- Decide whether to keep the webhook endpoint for donation bookkeeping or remove it; my call is to keep it as a no-credit event recorder to avoid breaking the registered Stripe endpoint.
- Update the deployed Worker and rebuild the website with the existing Stripe donation config.

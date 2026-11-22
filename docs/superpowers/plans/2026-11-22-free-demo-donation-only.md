# Free Demo Credits and Donation-Only Stripe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paid AI credits with a tiny free daily allowance and leave Stripe as donations only.

**Architecture:** The existing D1 ledger gains a per-wallet `demo_day` marker so a 20,000-micro grant can happen once per UTC day. The gateway grants before reserving, then keeps the existing reserve→capture→release metering. The Worker rejects `kind: "credits"` at checkout and the webhook records events without crediting. The React panel shows Donate only.

**Tech Stack:** TypeScript, Cloudflare Workers + D1, Stripe (donations only), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-free-demo-and-donation-only-design.md`

## Global Constraints

- Free demo cap: 20,000 micros ($0.02) per browser per UTC day; 5,000 micros ($0.005) per request.
- Grant reason: `demo_grant:<walletId>:<YYYY-MM-DD>`; the same wallet/day must never grant twice.
- No user payment funds inference. Donations promise no service. No Stripe Tax, no paid credits.
- BYOK and all existing features stay available and free.
- Never use `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`.
- UI changes need Playwright DOM assertions. Run `npx tsc -b`, `npx tsc -p hosted/tsconfig.json`, `npm test`, and `npm run verify`; quote output.
- GitNexus `detect_changes({scope:"all", worktree:...})` before each commit.

## Review Focus

1. **Double grant on replay** — two requests in one day must grant once. Test in Task 1.
2. **Exhausted allowance** — gateway returns 402 with a clear message. Test in Task 2.
3. **No paid credits** — checkout rejects `kind: "credits"`. Test in Task 3.
4. **Webhook cannot grant credits** — paid events are recorded only. Test in Task 3.
5. **Donation-only UI** — no credit purchase control in the panel. Test in Task 4.

---

### Task 1: Daily demo grant in the ledger

**Files:** Modify `hosted/src/ledger.ts`, `hosted/migrations/0001_ledger.sql` (add `demo_day` column via new `0003_demo_day.sql`), `hosted/tests/ledger-demo.test.ts`; create `tests/ledger-demo.hosted.test.ts`.

**Interfaces:**
- Consumes: `LedgerStore`, `WalletRow`, `creditWallet`.
- Produces: `grantDailyDemo(walletId: string, day: string, amountMicros: number, store: LedgerStore): Promise<boolean>` — returns true when it granted.

- [ ] Step 1: Write a failing test: first call grants 20,000 and writes reason `demo_grant:<wallet>:<day>`; second call same day grants nothing; a different day grants again; `createWallet` starts with `demo_day: ""`.
- [ ] Step 2: Run `npx vitest run tests/ledger-demo.hosted.test.ts` — expect FAIL.
- [ ] Step 3: Add `demo_day: string` to `WalletRow` and `createWallet`; add migration `0003_demo_day.sql` (`ALTER TABLE wallets ADD COLUMN demo_day TEXT NOT NULL DEFAULT ''`); implement `grantDailyDemo` using an optimistic `updateWallet` guarded by `wallet.demo_day !== day`.
- [ ] Step 4: Update the D1 adapter in `hosted/src/index.ts` to include `demo_day` in SELECT-to-row mapping, INSERT, and UPDATE statements.
- [ ] Step 5: Run the test — expect PASS; run `npx tsc -b` and `npm test`.
- [ ] Step 6: Commit `feat(demo): add idempotent daily free credit grant`.

### Task 2: Gateway grants before reserving

**Files:** Modify `hosted/src/gateway.ts`, `hosted/tests/gateway.test.ts`.

**Interfaces:** Consumes `grantDailyDemo`; produces unchanged `handleChat`.

- [ ] Step 1: Add a test: a fresh wallet gets a grant then a successful chat; a second chat same day uses the remaining balance; after exhausting the grant a chat returns 402 with `error: "insufficient_credits"`.
- [ ] Step 2: Run `npx vitest run tests/gateway.hosted.test.ts` — expect FAIL.
- [ ] Step 3: In `handleChat`, after wallet creation and before `reserve`, call `grantDailyDemo(walletId, new Date().toISOString().slice(0,10), 20_000, store)`.
- [ ] Step 4: Run the test — expect PASS; full typecheck and unit suite.
- [ ] Step 5: Commit `feat(demo): grant daily free allowance before metering chat`.

### Task 3: Worker removes paid credits

**Files:** Modify `hosted/src/index.ts`, `hosted/src/stripe-webhook.ts`, `hosted/tests/routes.test.ts`, `hosted/tests/stripe-webhook.test.ts`, `hosted/src/stripe.ts`, `hosted/tests/stripe.test.ts`.

- [ ] Step 1: Update tests: checkout rejects `kind: "credits"` with 400; webhook paid credit event does NOT credit the wallet but records the event; `createCheckoutSession` no longer sets `automatic_tax`, `taxCode`, or `taxBehavior` and throws for `kind: "credits"`.
- [ ] Step 2: Run `npx vitest run tests/routes.hosted.test.ts tests/stripe-webhook.hosted.test.ts tests/stripe.hosted.test.ts` — expect FAIL.
- [ ] Step 3: Implement: index checkout rejects non-donation kinds; webhook removes the `creditWallet` call; `resolveAmount` rejects `credits`; session builder drops tax fields.
- [ ] Step 4: Run the three tests — expect PASS; typecheck and full suite.
- [ ] Step 5: Commit `feat(demo): remove paid credit path from Worker`.

### Task 4: Donation-only UI

**Files:** Modify `src/App.tsx`, `tests/e2e/stripe-support.spec.ts`.

- [ ] Step 1: Change the e2e test: the Support panel shows only Donate; no amount selector for credits; clicking Donate and checkout still works; the free demo balance is visible when the credits provider is selected.
- [ ] Step 2: Run `npx playwright test tests/e2e/stripe-support.spec.ts` — expect FAIL.
- [ ] Step 3: Remove the credits option from the Support panel; keep the BYOK/credits provider selector for the free demo chat; relabel credits as "Free demo". Update status text.
- [ ] Step 4: Run the browser test — expect PASS; run typecheck and unit tests.
- [ ] Step 5: Commit `feat(demo): make Support panel donation-only`.

### Task 5: Documentation and verification

**Files:** Modify `docs/decisions/ADR-2026-11-21-studyai-scoped-credits.md`; create `docs/verification/2026-11-22-free-demo-donation-only.md`.

- [ ] Step 1: Amend the ADR: paid credits removed, free demo cap, Stripe donations only, no tax, contributor split and x402 deferred.
- [ ] Step 2: Run `npm run verify`, GitNexus detect-changes, and quote real output in the verification record (never claim green if it is not).
- [ ] Step 3: Commit `docs(demo): record free demo decision and verification`.

## Deferred

- Contributor revenue split, x402/crypto rails, paid credits, Stripe Tax registrations, automatic refunds.

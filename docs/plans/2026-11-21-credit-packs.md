# StudyAI Credit Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, prepaid, StudyAI-scoped credit rail for users without a provider key, while BYOK stays the primary and free path.

**Architecture:** A separate Cloudflare Worker in `hosted/` holds the Groq key, owns a D1 ledger, and exposes a narrow `/v1/chat/completions` + `/v1/redeem` + `/v1/wallet` API that only StudyAI calls. The browser holds an anonymous wallet token and sends it to the Worker; it never sees a provider key. The core React app gains a "StudyAI Credits" option in its existing settings/chat UI, reusing the current chat renderer.

**Tech Stack:** TypeScript, Cloudflare Workers + D1, Groq OpenAI-compatible API, Vitest, Playwright, existing Vite/React app.

**Spec:** `docs/decisions/ADR-2026-11-21-studyai-scoped-credits.md` — read it before starting. It owns the legal, pricing, and scope decisions; this plan implements them.

## Global Constraints

- BYOK remains primary and free. Credits are optional and never gate a core feature.
- Credits are usable only inside StudyAI. Do not issue portable provider keys, advertise a general-purpose API, or accept arbitrary clients.
- Groq is the only upstream in this plan. Price against Groq paid rates, never the free tier. No shared free-tier key.
- Prepaid only. No card-required trial, subscription, credit line, or post-paid usage. Maximum pack value: $20. Per-wallet daily cap: $1.00. Per-request maximum: $0.05.
- No raw provider key in browser code, bundles, or logs.
- Non-streaming chat only, so cost is exact from upstream usage before returning.
- Wallet token is a browser secret; recovery code is the only restoration path. State this in the purchase UI before redemption.
- No generated codes, ledger dumps, or runtime data committed. `data/` stays ignored.
- Never use `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`. Cite installed package types when using a library API.
- UI changes require a Playwright test asserting real DOM (`data-testid`), per `AGENTS.md`.
- Run `npx tsc -b && npx vitest run` before each commit; run `node .gitnexus/run.cjs detect-changes --scope all --repo .` before each commit; quote `npm run verify` output in the verification record.
- No new dependency in the root `package.json`. `hosted/` may add dependencies only with an ADR amendment.

## Review Focus

1. **Concurrent spend.** Two simultaneous requests from one wallet must not both reserve the same balance. Test with two parallel `reserve` calls against one fake store; only one may succeed.
2. **Upstream failure after reservation.** A Groq error or timeout must release the hold, not debit. Test with an injected fetch that throws.
3. **Code replay.** A redemption code must work once. Test redeeming the same code into two wallets and into the same wallet twice.
4. **Over-cap capture.** If upstream usage costs more than the estimate, the capture must clamp to the reserved amount. Test with a usage payload above the estimate.
5. **ToS boundary / non-StudyAI client.** A request without a valid wallet token, or one that is not sent by the StudyAI app, must be rejected. Test 401 on missing token and rejection of an unknown client marker.

---

## File Structure

**Create:**
- `hosted/package.json` — Worker scripts (`dev`, `test`, `deploy`); reuses root Vitest version if resolvable, otherwise pins it with an ADR note.
- `hosted/tsconfig.json` — strict TypeScript for the Worker tree.
- `hosted/wrangler.toml` — Worker name, D1 binding `CREDITS_DB`, secrets `GROQ_API_KEY`.
- `hosted/migrations/0001_ledger.sql` — wallets, codes, reservations, ledger_entries.
- `hosted/src/ledger.ts` — pure ledger rules over an injected store.
- `hosted/src/pricing.ts` — token prices in micros and `costMicros(...)`.
- `hosted/src/groq.ts` — one non-streaming call to Groq with injected fetch.
- `hosted/src/token.ts` — wallet token creation, hashing, recovery code.
- `hosted/src/gateway.ts` — authenticated, metered chat handler.
- `hosted/src/index.ts` — Worker fetch entry, route switch, client marker check.
- `hosted/scripts/generate-codes.ts` — offline code batch generator.
- `hosted/tests/ledger.test.ts`, `hosted/tests/gateway.test.ts`, `hosted/tests/routes.test.ts`, `hosted/tests/token.test.ts`, `hosted/scripts/generate-codes.test.ts`.
- `tests/e2e/credits-ui.spec.ts`
- `.github/workflows/credits-deploy.yml`
- `docs/verification/2026-11-21-credit-packs.md`

**Modify:**
- `src/api.ts` — add `CREDITS_API` base URL constant.
- `src/App.tsx` — add the credits option and wallet/redeem UI to the existing settings panel; route the credits chat through the existing `CustomMarkdownRenderer`.

---

### Task 1: Ledger schema and rules

**Files:**
- Create: `hosted/migrations/0001_ledger.sql`, `hosted/src/ledger.ts`, `hosted/tests/ledger.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type WalletRow = { id: string; balance_micros: number; version: number; daily_cap_micros: number; spent_today_micros: number; day: string }`
  - `interface LedgerStore` with `getWallet`, `insertWallet`, `updateWallet`, `getCode`, `markCodeRedeemed`, `getReservation`, `insertReservation`, `insertEntry`.
  - `class InsufficientCredits extends Error`, `class CodeError extends Error`
  - `createWallet(id: string, store: LedgerStore): Promise<WalletRow>`
  - `redeemCode(rawCode: string, walletId: string, store: LedgerStore): Promise<{ creditedMicros: number }>`
  - `reserve(walletId: string, amountMicros: number, requestId: string, store: LedgerStore): Promise<{ id: string; amountMicros: number }>`
  - `capture(reservationId: string, actualMicros: number, store: LedgerStore): Promise<void>`
  - `release(reservationId: string, store: LedgerStore): Promise<void>`
  - `getWallet(walletId: string, store: LedgerStore): Promise<WalletRow>`

- [ ] **Step 1: Write the migration for four tables**

`wallets(id TEXT PRIMARY KEY, balance_micros INTEGER NOT NULL, version INTEGER NOT NULL, daily_cap_micros INTEGER NOT NULL, spent_today_micros INTEGER NOT NULL, day TEXT NOT NULL)`; `codes(code TEXT PRIMARY KEY, value_micros INTEGER NOT NULL, redeemed_by TEXT)`; `reservations(id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL, amount_micros INTEGER NOT NULL, request_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL)`; `ledger_entries(id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_id TEXT NOT NULL, delta_micros INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)`.

- [ ] **Step 2: Write failing tests in `hosted/tests/ledger.test.ts`**

Use an in-memory fake `LedgerStore` in the test file. Assert: `createWallet` starts at zero; `redeemCode` credits exactly the code value; a second redemption of the same code throws `CodeError`; `reserve` reduces balance by the amount; two parallel `reserve` calls with distinct requestIds whose sum exceeds the balance yield exactly one success and one `InsufficientCredits`; repeating `reserve` with the same requestId returns the same reservation without a second debit; `capture` with `actualMicros > reserved` debits exactly the reserved amount; `capture` with less returns the difference; `release` restores the full amount; a reservation cannot be captured twice.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- --run hosted/tests/ledger.test.ts` from `hosted/`
Expected: FAIL because `ledger.ts` does not exist.

- [ ] **Step 4: Implement `hosted/src/ledger.ts`**

Use a conditional update (`UPDATE wallets SET balance_micros = ?, version = version + 1 WHERE id = ? AND version = ? AND balance_micros >= ? AND spent_today_micros + ? <= daily_cap_micros`), check the affected-row count, and retry once on version conflict. Reset `spent_today_micros` when `day` differs from the current UTC date. Treat `requestId` as the idempotency key via the unique constraint. All money is integer micros; never use floating point.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- --run hosted/tests/ledger.test.ts`
Expected: PASS (all tests from Step 2).

- [ ] **Step 6: Commit**

```bash
git add hosted/migrations/0001_ledger.sql hosted/src/ledger.ts hosted/tests/ledger.test.ts
git commit -m "feat(credits): add D1 ledger schema and bounded ledger rules"
```

---

### Task 2: Groq client and pinned pricing

**Files:**
- Create: `hosted/src/pricing.ts`, `hosted/src/groq.ts`, `hosted/tests/groq.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `costMicros(model: string, promptTokens: number, completionTokens: number): number`
  - `type ChatRequest = { model: string; messages: Array<{ role: "system" | "user" | "assistant"; content: string }> }`
  - `type ChatResult = { text: string; promptTokens: number; completionTokens: number }`
  - `callGroq(req: ChatRequest, apiKey: string, fetchImpl?: typeof fetch): Promise<ChatResult>`

- [ ] **Step 1: Write failing tests**

Assert `costMicros` returns exact integer micros for a known model and token count, is zero for zero tokens, and throws for an unknown model. Assert `callGroq` posts to `https://api.groq.com/openai/v1/chat/completions` with an `Authorization: Bearer` header and `stream: false`, returns the assistant text and both usage token counts from a stubbed response, and propagates an upstream error status as an `Error` containing the status.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run hosted/tests/groq.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement pricing and the Groq client**

Pin a small model map in `hosted/src/pricing.ts` using Groq's published per-million-token rates; compute micros with integer arithmetic and round up. In `callGroq`, use the injected `fetch` (default global `fetch`) and read `usage.prompt_tokens` / `usage.completion_tokens` from the response. Verify the installed TypeScript types for `fetch` and `Response` against the project's `@types/node` before writing casts; no suppression comments.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run hosted/tests/groq.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/pricing.ts hosted/src/groq.ts hosted/tests/groq.test.ts
git commit -m "feat(credits): add pinned Groq pricing and metered non-streaming client"
```

---

### Task 3: Wallet tokens and recovery codes

**Files:**
- Create: `hosted/src/token.ts`, `hosted/tests/token.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `newWalletToken(): { token: string; id: string }`
  - `hashToken(token: string): string`
  - `recoveryCode(token: string): string`
  - `parseRecoveryCode(code: string): string`

- [ ] **Step 1: Write failing tests**

Assert `newWalletToken` returns a token of at least 32 random hex characters and an id of 32 hex characters; the same token always hashes to the same id; two tokens hash differently; `parseRecoveryCode(recoveryCode(token))` returns the original token; a malformed recovery code throws.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run hosted/tests/token.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `hosted/src/token.ts`**

Use Web Crypto `crypto.getRandomValues` and `crypto.subtle.digest("SHA-256", ...)`. The worker stores only `id`; the browser stores `token`. The recovery code is the token with a prefix and grouping for readability; parsing strips non-hex characters and validates length.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run hosted/tests/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/token.ts hosted/tests/token.test.ts
git commit -m "feat(credits): add anonymous wallet tokens and recovery codes"
```

---

### Task 4: Metered gateway handler

**Files:**
- Create: `hosted/src/gateway.ts`, `hosted/tests/gateway.test.ts`

**Interfaces:**
- Consumes: `reserve`, `capture`, `release`, `getWallet` from Task 1; `callGroq`, `ChatRequest` from Task 2; `hashToken` from Task 3.
- Produces:
  - `handleChat(request: Request, env: { GROQ_API_KEY: string; store: LedgerStore }): Promise<Response>`

- [ ] **Step 1: Write failing tests**

Inject a fake store and a stubbed Groq fetch. Assert: missing or malformed `Authorization: Bearer` token → 401; a valid token with zero balance → 402 with a JSON body naming insufficient credits; a successful call debits exactly `costMicros` of the returned usage and returns `{ text, balanceMicros }`; a Groq 500 releases the reservation (balance unchanged); a Groq response whose usage cost exceeds the estimate debits at most the reserved amount; a request whose model is not in the pricing map → 400 before any reservation.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run hosted/tests/gateway.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `hosted/src/gateway.ts`**

Order of operations: validate model and body → hash token to wallet id → `reserve` using the maximum permitted per-request cost → call Groq → `capture` the exact usage cost → respond. Wrap the Groq call in `try/catch`; call `release` on any throw. Use `requestId` from a generated UUID so retries are idempotent. Never log prompt text or the Groq key.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run hosted/tests/gateway.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/gateway.ts hosted/tests/gateway.test.ts
git commit -m "feat(credits): add metered Groq gateway with reservation and release"
```

---

### Task 5: Worker routes, redemption, and client marker

**Files:**
- Create: `hosted/src/index.ts`, `hosted/tests/routes.test.ts`

**Interfaces:**
- Consumes: `handleChat` from Task 4; `redeemCode`, `getWallet`, `createWallet`, `LedgerStore` from Task 1; `hashToken` from Task 3.
- Produces: `export default { fetch(request: Request, env: WorkerEnv): Promise<Response> }` where `WorkerEnv` has `CREDITS_DB: D1Database`, `GROQ_API_KEY: string`, `STUDYAI_CLIENT_TOKEN: string`.

- [ ] **Step 1: Write failing tests**

Assert: `POST /v1/chat/completions` delegates to `handleChat`; `GET /v1/wallet` returns the balance for a valid wallet token and 401 otherwise; `POST /v1/redeem` credits the wallet once and 400s on a used code; a request missing the `x-studyai-client` header matching `STUDYAI_CLIENT_TOKEN` → 403; an unknown path → 404.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run hosted/tests/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `hosted/src/index.ts`**

Switch on `new URL(request.url).pathname`. Build the `LedgerStore` adapter over the D1 binding in a separate function inside this file. Check the client marker before any wallet or inference work. On `GET /v1/wallet`, call `createWallet` when the hashed wallet id has no row yet, so a first-time browser gets a zero-balance wallet. Keep CORS restricted to the configured StudyAI origin from `env`; do not use a wildcard.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run hosted/tests/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/src/index.ts hosted/tests/routes.test.ts
git commit -m "feat(credits): add Worker routes with client marker and origin restriction"
```

---

### Task 6: Offline code generator

**Files:**
- Create: `hosted/scripts/generate-codes.ts`, `hosted/scripts/generate-codes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateCodes(count: number, valueMicros: number, prefix?: string): string[]`

- [ ] **Step 1: Write failing tests**

Assert: `generateCodes(100, 500_000)` returns 100 unique strings; every code matches the expected prefix/format; `count <= 0` throws; `valueMicros <= 0` throws.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run hosted/scripts/generate-codes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the generator**

Use Web Crypto random bytes with rejection sampling for uniqueness. Print codes as CSV to stdout; the caller redirects to a local file that is never committed. No database or network access.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run hosted/scripts/generate-codes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hosted/scripts/generate-codes.ts hosted/scripts/generate-codes.test.ts
git commit -m "feat(credits): add offline one-time code generator"
```

---

### Task 7: StudyAI settings and credits chat UI

**Files:**
- Modify: `src/api.ts`, `src/App.tsx`
- Test: `tests/e2e/credits-ui.spec.ts`

**Interfaces:**
- Consumes: `CREDITS_API` from `src/api.ts`; the Worker routes from Task 5.
- Produces: `data-testid="credit-provider-option"`, `data-testid="credit-balance"`, `data-testid="credit-redeem-input"`, `data-testid="credit-redeem-button"`, `data-testid="credit-recovery-code"`.

- [ ] **Step 1: Write the failing browser test**

In `tests/e2e/credits-ui.spec.ts`, intercept `CREDITS_API` routes with Playwright `page.route`. Assert: the settings panel shows a "StudyAI Credits" option with `data-testid="credit-provider-option"`; selecting it shows `data-testid="credit-balance"` with the mocked balance; entering a code in `data-testid="credit-redeem-input"` and clicking `data-testid="credit-redeem-button"` shows the new balance returned by the mocked endpoint; the recovery code is visible with `data-testid="credit-recovery-code"`; the purchase disclosure text about browser-scoped wallets and no recovery without the code is present before the redeem field.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/credits-ui.spec.ts`
Expected: FAIL with missing testids.

- [ ] **Step 3: Add the credits API constant and wallet token bootstrap**

In `src/api.ts`, add `export const CREDITS_API = import.meta.env.VITE_CREDITS_API_URL ?? "";`. In the existing `src/App.tsx` settings state near `selectedModel` and `aiStatus`, load or create a random wallet token with `crypto.getRandomValues` (32 bytes, hex) in `localStorage` under `studyai.credits.token`, and store the client marker from `VITE_STUDYAI_CLIENT_TOKEN`. The browser generates the token itself and never imports `hosted/src/token.ts`; the Worker derives the wallet id with `hashToken`. Do not log the token.

- [ ] **Step 4: Add the settings UI and credits chat path**

Add the "StudyAI Credits" option to the existing provider selector. Render balance, redeem field, and recovery code inside the existing settings panel using the testids from the Interfaces block. The credits chat path posts to `CREDITS_API + "/v1/chat/completions"` with the wallet token and client marker, and renders assistant text through the existing `CustomMarkdownRenderer` — do not create a second renderer. Keep BYOK selection unchanged and available.

- [ ] **Step 5: Run the browser test to verify it passes**

Run: `npx playwright test tests/e2e/credits-ui.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run typecheck and unit tests**

Run: `npx tsc -b && npx vitest run`
Expected: PASS with no suppression comments.

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/App.tsx tests/e2e/credits-ui.spec.ts
git commit -m "feat(credits): add optional credits provider and wallet UI"
```

---

### Task 8: Worker config, deploy workflow, and verification record

**Files:**
- Create: `hosted/package.json`, `hosted/tsconfig.json`, `hosted/wrangler.toml`, `.github/workflows/credits-deploy.yml`, `docs/verification/2026-11-21-credit-packs.md`

**Interfaces:**
- Consumes: all of Tasks 1–7.
- Produces: a deployed Worker and a verification record quoting real command output.

- [ ] **Step 1: Add Worker config**

`wrangler.toml` declares the D1 binding `CREDITS_DB`, a Worker name, and compatibility date; secrets `GROQ_API_KEY` and `STUDYAI_CLIENT_TOKEN` are set through the platform, never committed. `hosted/package.json` pins the Wrangler and Vitest versions actually installed, with a note in the ADR if either is new.

- [ ] **Step 2: Add the deploy workflow**

`.github/workflows/credits-deploy.yml` runs the Worker tests, applies `migrations/0001_ledger.sql`, and deploys on an explicit tag or manual dispatch — never on every push. Use the repository's existing pinned-action style from `.github/workflows/canvas.yml`.

- [ ] **Step 3: Run the full verification set**

Run: `npm run verify`
Then: `node .gitnexus/run.cjs detect-changes --scope all --repo .`
Expected: `npm run verify` output quoted verbatim in `docs/verification/2026-11-21-credit-packs.md`; detect-changes clean (no `partial: true` or `truncated: true`).

- [ ] **Step 4: Write the verification record**

Record exactly what was verified and what was not: ledger and gateway unit tests, browser DOM test, typecheck, detect-changes, and the fact that no live payment, live Groq charge, or legal review was performed. State that Stripe, streaming, and agent/tutor integration are deferred.

- [ ] **Step 5: Commit**

```bash
git add hosted/package.json hosted/tsconfig.json hosted/wrangler.toml .github/workflows/credits-deploy.yml docs/verification/2026-11-21-credit-packs.md
git commit -m "feat(credits): add Worker deployment config and verification record"
```

---

## Deferred (explicitly out of this plan)

- Stripe Checkout, webhooks, refunds, and chargebacks.
- Streaming chat with reservation holds.
- Wiring credits into the LangGraph tutor/CopilotKit agent path; Phase 1 uses the browser chat path only.
- Multiple upstream providers, account/email identity, and a general-purpose API.

# Verification — StudyAI credit packs

Date: 2026-11-22. Branch: `work/studyai-credits` (isolated worktree at `C:\Users\Owner\.local\share\opencode\worktree\e35993\work\studyai-credits`).

## What was verified

| Command | Result |
|---|---|
| `npx tsc -b` (root) | PASS — no diagnostics |
| `npx tsc -p hosted/tsconfig.json` | PASS — no diagnostics |
| `npx vitest run tests/ledger.hosted.test.ts` | PASS (implementer report; included in the full suite below) |
| `npx vitest run tests/groq.hosted.test.ts` | PASS (implementer report; included in the full suite below) |
| `npx vitest run tests/token.hosted.test.ts` | 4 passed |
| `npx vitest run tests/gateway.hosted.test.ts` | 6 passed |
| `npx vitest run tests/routes.hosted.test.ts` | 6 passed |
| `npx vitest run tests/generate-codes.hosted.test.ts` | 4 passed |
| `npx vitest run` (full suite) | 69 test files passed, 473 tests passed, 0 failed |
| `npx playwright test tests/e2e/credits-ui.spec.ts` | 1 passed |
| `npm run verify` (full gate) | NOT GREEN on final run — 2 live-tutor e2e failures; see detail below |
| GitNexus `detect_changes({scope:"all"})` | `changed_count: 0`, `risk_level: "none"`, no `partial` or `truncated` flag |

### `npm run verify` quoted output (tail of the final run)

```
 Test Files  69 passed (69)
      Tests  473 passed (473)
   Start at  00:14:19
   Duration  13.52s (transform 5.62s, setup 0ms, collect 34.10s, tests 28.49s, environment 16ms, prepare 18.32s)

Running 33 tests using 1 worker
  ✓  11 tests\e2e\credits-ui.spec.ts:2:1 › credits provider shows balance, redeems a code, and chats (1.2s)
  ✘  18 tests\e2e\direct-vector.spec.ts:267:1 › tutor reads vector components and proposes synchronized visual edits (2.3m)
  ✘  31 tests\e2e\tutor-math.spec.ts:3:1 › tutor math renders as KaTeX in the sidebar (1.5m)
  3 skipped
  28 passed (6.4m)
```

**The final `npm run verify` was not green.** An earlier run of the same command passed all 30 active e2e tests, including both of these. Isolated retries afterwards: `direct-vector` passed; `tutor-math` failed again because the live tutor returned the raw, malformed string `$\text{m},\text{s` instead of rendered KaTeX. Both failing tests depend on a live provider response and neither exercises the credit rail (the app defaults to the unchanged "local" provider). They are recorded as live-provider flakiness, not as a clean gate. The credits-specific browser test passed in both full runs and in isolation.

The credits browser test asserts real DOM: `credit-provider-option`, `credit-balance`, `credit-recovery-code`, `credit-disclosure` (positioned before the redeem field), `credit-redeem-input`, `credit-redeem-button`, `credit-chat-input`, `credit-chat-send`, and `credit-chat-answer`, with the Worker endpoints intercepted by Playwright.

## What was NOT verified

- **No live D1 instance.** The `LedgerStore` adapter in `hosted/src/index.ts` uses local structural D1 types; statement shapes were written from the plan, not observed against Wrangler 4.166.0. The first deploy must confirm them.
- **No live Groq charge and no live payment.** All upstream calls in tests are stubbed. No credit was bought, sold, or redeemed for real money.
- **No legal review.** The provider-terms quotes in ADR-2026-11-21 were read from published pages; no lawyer reviewed the resale boundary before this code was written. Legal review is a gate before taking money.
- **No deployment.** `.github/workflows/credits-deploy.yml` and `wrangler.toml` are not exercised; `database_id` is a placeholder and Cloudflare secrets are not configured here.
- **GitNexus limitation.** `detect_changes` returned a clean zero, but the index is 4 commits behind and anchored at the main checkout; the new `hosted/` tree is not indexed at all. A clean zero here is not evidence that graph analysis covered the new code — it means the graph had nothing to say about it.
- Root `tsc -b` does not include `hosted/`; the separate `hosted/tsconfig.json` check above covers it.

## Deferred by the plan (not defects)

- Stripe Checkout, webhooks, refunds, chargebacks, and subscriptions — Phase 1 sells offline redemption codes.
- Streaming chat with reservation holds — Phase 1 is non-streaming so cost is exact.
- Wiring credits into the LangGraph tutor / CopilotKit agent path — Phase 1 uses the browser chat path only; BYOK remains the primary tutor path.
- Multiple upstream providers, account/email identity, and a general-purpose API — explicitly out of scope.

## Rulings made during implementation

See `.superpowers/sdd/2026-11-21-credit-packs/progress.md` (git-ignored scratch, removed after review) and the final handoff message for the exhaustive list. The load-bearing ones are: capture clamps to the reserved amount; the spec wins over the test's original numeric expectation; `handleChat` takes an injectable fetch; `PER_REQUEST_MAX_MICROS` is exported; the Worker store is injectable and D1 types are structural; browser generates its own wallet token; `newWalletToken` is async because Web Crypto SHA-256 is async.

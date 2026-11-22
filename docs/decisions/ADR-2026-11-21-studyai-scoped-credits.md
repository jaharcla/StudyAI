# ADR-2026-11-21: StudyAI-scoped prepaid credits (BYOK stays primary)

## Context

Outreach wants a hosted edition that a student can use without obtaining their own provider key. Publik demonstrates the pattern: a platform owns the billing relationship and a shared model account, and pays app developers half the markup. Reproducing Publik as a general API reseller is not viable for this project. The provider terms draw a consistent line between *embedding a model in your own product* and *selling model access as a product*:

- **Groq Services Agreement** (last modified 22 June 2026) §3.1 grants the right to integrate the services into a "Customer Application" and "to make the Cloud Services and AI Model Services available to End Users through your Customer Applications"; §6.3(c) forbids resale "except as expressly approved by Groq"; §6.3(e) forbids competing services.
- **OpenAI Services Agreement** §3.1: "Customer may not resell or lease access to its Account or any End User Account."
- **Anthropic** commercial terms permit resale only where expressly approved; the Usage Policy bars "Resell, proxy, or otherwise provide access to Claude through unauthorized means."
- **Google Gemini** Additional ToS: "You will not, and will not allow your end user or any third party to… resell…"
- **OpenRouter Terms** (31 August 2026) §7.4/§7.14 prohibit reselling API access and developing a competing service.

The choice of upstream does not remove this constraint; it only changes the wording. Groq is nevertheless the best first upstream because §3.1 is unusually explicit about end users of a customer application, and Groq is already the project's default cloud provider.

## Decision

1. **BYOK remains the primary path.** A user with their own key keeps full use of the app, with no credits, no account, and no payment. Free tiers remain the on-ramp.
2. **Add an optional prepaid credit rail scoped to StudyAI.** Credits are redeemable only through StudyAI's own gateway, for StudyAI's own features. The service does not issue portable provider keys, does not advertise a general-purpose API, and does not accept arbitrary clients.
3. **Groq is the first and only upstream for credits.** Price the packs against Groq's paid token rates, not its free tier. Do not pool many users onto one free-tier key.
4. **Prepaid only.** Sell fixed-value packs. No card-required free trial, no monthly subscription, no credit line, no post-paid usage. A small keyless demo allowance is a separate, capped, clearly-labelled item and is not a credit pack.
5. **Phase 1 sells through redemption codes.** Codes are generated offline and sold through an existing storefront (for example Gumroad or Ko-fi). This keeps payment processing, KYC, refunds, and chargebacks out of the code and keeps startup cost at zero. Stripe Checkout is Phase 2, after demand is evidenced.
6. **Host the credit gateway separately** in `hosted/` as a Cloudflare Worker with D1, deployed from GitHub Actions. Cloudflare's Worker/D1 free allocation is available through the Student Developer Pack with no card and no expiry. Keep it out of the core app's build.
7. **Wallets are anonymous and browser-scoped.** A random wallet token is generated in the browser and stored in `localStorage`; a copyable recovery code restores it on another device. There is no email, password, or account system in Phase 1. Losing both the browser and the recovery code loses the balance — this must be stated in the UI before purchase.
8. **No raw provider key ever reaches the browser.** The Worker holds the Groq key; the browser calls only the StudyAI gateway.
9. **Non-streaming chat only in Phase 1**, so the metered cost can be computed exactly from the upstream usage response before the response is returned. Streaming is a later task with reservation holds.

## Alternatives considered

1. **General-purpose "StudyAI API" / key reseller** — rejected. Provider terms prohibit it, it would compete with the upstream, and it requires a commercial reseller agreement that cannot be obtained with zero capital.
2. **Plug into Publik instead of building rails** — deferred. It solves legal and float problems, but fits the local/desktop edition rather than the Pages web edition, and the developer share is small at low volume. Revisit if the hosted edition gains traction.
3. **Stripe Checkout in Phase 1** — deferred. Adds KYC, webhooks, refunds, chargebacks, and float before there is evidence anyone will buy. Redemption codes validate demand first.
4. **LiteLLM as the gateway** — rejected for Phase 1. It is MIT-licensed and solves routing, virtual keys, and budgets, but requires Python plus Postgres (and Redis at scale), which conflicts with this Node-only, local-first stack and with free Worker hosting. With a single upstream, a small TypeScript metering proxy is less machinery. Revisit if the number of upstreams grows.
5. **Donation button only** — retained as a complement, not a replacement. It has no ToS or float exposure but does not meter usage.
6. **Turn core features paid** — rejected. It contradicts ADR-2026-11-22 (plain MIT, open core); the paid rail is additive and optional.

## Limits and consequences

- **Legal review is required before taking money.** The quotes above are from current published terms and are not legal advice; terms change and jurisdiction matters.
- The app remains fully usable for free with BYOK or a provider free tier. Credits are a convenience purchase, never a gate.
- Revenue is the difference between pack price and actual Groq spend, less platform fees; at small volume this is small. Do not project meaningful income from early numbers.
- A wallet is a browser secret, not an identity. No refunds, no dispute process, and no recovery without the recovery code in Phase 1. State this plainly in the purchase UI.
- Hard caps bound the liability: per-request maximum, per-wallet daily cap, and a maximum pack value. A reservation must never be capturable above its approved amount.
- The Worker holds a shared Groq key. Abuse controls (rate limits, daily caps, rejection of non-StudyAI clients) are part of the build, not an afterthought.
- Generated code files, ledger exports, and runtime data are never committed.

## Compatibility with existing decisions

- ADR-2026-11-22 (plain MIT / open core): compatible. The core stays MIT and fully usable; credits are an optional hosted service, not a restriction on the licence. A later paid edition would be a separate work, as that ADR specifies.
- `AGENTS.md` reuse policy: the Worker, ledger, and gateway are new modules in a separate `hosted/` tree, so no new authority is created inside `src/` or `server/`. Any new npm dependency must be justified in this ADR before implementation.

## Verification (to be performed by the implementation plan)

- Ledger tests prove no negative balance, single-use codes, idempotent reservations, and release-on-upstream-failure.
- Gateway tests prove 401 without a wallet token, 402 on insufficient balance, and exact debit from upstream usage.
- A browser-level Playwright test asserts the credits UI renders the balance and redeem field with real DOM selectors.
- `npm run verify` output is quoted in the verification record; `node .gitnexus/run.cjs detect-changes --scope all --repo .` is clean before any commit.

## Amendment (2026-11-22): Worker tooling dependency

`hosted/package.json` adds two **dev-only** dependencies, justified by a demonstrated capability gap:

- `wrangler@4.166.0` (MIT OR Apache-2.0) — required to run the Cloudflare Worker locally, apply D1 migrations, and deploy. No Wrangler CLI exists in the root project. Version confirmed from npm on 2026-11-22; commands checked against `https://developers.cloudflare.com/workers/wrangler/commands/d1/`.
- `vitest@3.2.4` (MIT) — the same version already pinned in the root `package.json`, so the hosted tree is not introducing a second test runner.

No runtime dependency is added. `wrangler.toml` uses a placeholder `database_id`, and secrets (`GROQ_API_KEY`, `STUDYAI_CLIENT_TOKEN`, plus CI `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`) are set through the platform and never committed.

Limits: the structural D1 types in `hosted/src/index.ts` were written from the plan without a live D1 instance; the first real deploy must confirm the statement shapes against Wrangler 4.166.0. Deployment is not part of this branch's verification.

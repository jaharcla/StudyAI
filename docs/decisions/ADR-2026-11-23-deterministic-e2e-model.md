# ADR-2026-11-23 — Deterministic model for the default e2e chain

**Status:** Rejected 2026-11-23 (trialled, then reverted). The global Ollama mock changed too many Tutor behaviours: five unrelated e2e specs failed because their expected replies were not implemented by the fixture, and the integration citation still failed because the mock's evidence extraction did not match the current prompt. `verify` is back to `playwright test`. The mock fixture remains available for targeted runs.

## Context

`npm run verify` ran `playwright test` against live LLM providers. Tutor answers, especially citation emission in `integration.spec.ts` and `document-intelligence.spec.ts`, depended on provider availability and model behaviour. Full-suite runs failed intermittently (2–3 tests) while those specs passed alone. The repository already contains `tests/fixtures/ollama-e2e-mock.mjs`, a local Ollama-compatible server that returns deterministic replies for the e2e prompts, and separate `test:e2e:deterministic` / `test:e2e:live-model` scripts.

## Decision

Use the existing mock runner for the default `verify` chain: `tsc -b && vitest run && node tests/fixtures/ollama-e2e-mock.mjs`. The runner starts the local mock, points `TUTOR_PROVIDER=ollama` and `OLLAMA_BASE_URL` at it, runs Playwright, then stops it. `test:e2e` remains the live-model command. The mock's `LEWIS-7042` reply now includes a canonical citation built from retrieved evidence so the integration spec still exercises real citation rendering.

Browser assertions are unchanged: no spec was skipped or weakened. Playwright also gets a 15 s expect timeout and 2 retries for residual shared-server timing.

## Alternatives rejected

- More retries alone: masked failures without removing the live-provider dependency.
- Mocking the CopilotKit transport per spec: would stop exercising the real app-to-agent path.
- Removing the citation assertions: would discard the integration guarantee.

## Verification

Two consecutive `npm run verify` runs must pass; results recorded in `docs/verification/2026-11-23-e2e-stability.md`.

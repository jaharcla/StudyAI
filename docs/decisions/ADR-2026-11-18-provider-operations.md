# ADR: Provider budget, circuit breaker, egress disclosure, and structured logs

Status: accepted and implemented (Phase 4 of the canvas intelligence handoff).

## Decision

Keep the existing provider chain and make its operational state durable and inspectable:

1. **Budgets and usage persist in SQLite.** `canvas_provider_budgets(day, provider, used)` and `canvas_provider_usage(day, provider, calls, prompt_tokens, completion_tokens, cost_usd, failures, backoffs, backoff_ms)` are created lazily on the existing database. The in-memory maps remain the hot path; SQLite is written through on every allowed request, usage record, backoff, and failure. `configureProviderBudgetDatabase` / `configureProviderUsageDatabase` bind the database at server startup and reset the in-memory view from the persisted day. No new dependency.

2. **A per-provider circuit breaker skips failing providers.** After `CANVAS_PROVIDER_CIRCUIT_THRESHOLD` (default 3) consecutive failures a provider's circuit opens for `CANVAS_PROVIDER_CIRCUIT_COOLDOWN_MS` (default 30 s), then half-opens on the next attempt. A closed circuit is only restored by a successful call. When a chain has more than one provider, open circuits are skipped without consuming their daily budget; a single explicit provider still surfaces the real error. Deterministic and local stages never use the breaker.

3. **Image egress is explicit and revocable.** `CANVAS_ALLOW_IMAGE_EGRESS=0` (or `false`/`off`/`no`) and a per-request `allowImageEgress: false` both restrict OCR to local providers. With no local provider the OCR stage records a failed region and analysis continues on deterministic geometry, OCR-less structure, and fusion instead of failing the whole request. CanvasStudio exposes a persisted "Cloud ink OCR" checkbox and a one-line disclosure; the value is sent with each analysis request.

4. **Per-analysis telemetry is returned, not stored.** The analysis response carries `telemetry: { totalMs, imageEgress, usage[] }`, where `usage[]` is the per-provider delta observed during that request. The canvas tools bar renders seconds and cost after each analysis and shows the per-provider breakdown on hover. `GET /api/canvas-providers` additionally reports persisted daily usage and circuit state.

5. **Structured logs redact secrets and images.** When `AI_DIAGNOSTICS=1`, `canvas_provider_call` entries include stage, provider, model, latency, status, and a truncated error. Base64 image payloads and configured API keys are redacted before logging; raw images are never logged.

## Alternatives

- A separate telemetry database/table per analysis was rejected: per-request deltas are enough for display and avoid retaining board content or prompt text.
- A token-bucket rate limiter was rejected: the existing daily counters plus provider-side limits already bound cost, and Gemini requests are already serialized at 15/minute in `openai-compatible.ts`.
- Client-side image redaction before upload was rejected: the server already owns crop selection and the recognizer's rasterizer, and the existing source-region validation rejects client-fabricated crops.

## Limits

- Usage and budget counters are UTC-day scoped; no historical rollups are kept beyond the persisted daily rows.
- The circuit state is per process (not persisted), because it is a short-lived liveness signal.
- Telemetry deltas assume one analysis at a time per server process; under concurrent analyses the delta may include another request's calls. Cost display is still bounded by the global usage counters.

## Verification

- `tests/canvas-providers.test.ts`: budget/usage persistence across a simulated restart, circuit trip/skip/recovery, egress blocking, and log redaction.
- `tests/canvas-analysis-producer.test.ts`: `allowImageEgress` reaches the analysis stage and telemetry accompanies the validated analysis response.
- `/canvas-verify`: `npx tsc -b`, `npx vitest run tests/canvas`, benchmark gate when prompts/models change.

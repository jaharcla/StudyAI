# ADR: OpenAI-compatible provider routing (OmniRoute / Strata / local gateways)

Status: accepted for implementation.

## Decision

Add one canonical provider id, `openai-compatible`, for both the Tutor and Canvas inference/OCR paths. `omniroute` is accepted as an alias and normalized to `openai-compatible`.

- Default endpoint: `OMNIROUTE_BASE_URL=http://localhost:20128/v1`; default model `OMNIROUTE_MODEL=agnes/agnes-2.5-flash-high` (free, `$0` pricing, advertises `tool_calling` and `vision`); Canvas may override with `CANVAS_OMNIROUTE_MODEL`.
- Live gateway check (2026-11-20): `free-stack` is listed by `/v1/models` but returns 503 `ALL_TARGETS_SKIPPED`. Free combos (`auto/best-free`, `auto/chat`, `auto/best-coding`, `auto/smart`) answer chat but their targets (`zai-org/glm-5.2`, `openai/gpt-oss-*`) do not emit native `tool_calls`, so they cannot drive canvas tools. `agnes/agnes-2.5-flash-*` and `agnes/agnes-3.0-flash-*` are free and do emit native `tool_calls` — verified end-to-end through `ChatOpenAI.bindTools` with a Zod schema. Vision aliases (`auto/best-vision`, `auto/vision`, `auto/multimodal`) return 403 and Agnes vision returns 502/400 gateway errors, so no canvas OCR default was added.
- `OMNIROUTE_API_KEY` is optional in code: an empty value sends a fixed non-secret placeholder (`studyai-local-gateway`) for gateways that need no credential; a supplied value is sent as `Authorization: Bearer …`. The current OmniRoute gateway returns HTTP 401 without a key, so this deployment needs the real key in `.env`.
- Tutor: every configured provider is selectable via `TUTOR_PROVIDER` — `groq`, `ollama`, `omniroute`/`openai-compatible`, `opencode-go`, `openrouter`, `gemini`. Explicit modes stay single-provider; each cloud mode requires its matching key. `auto` keeps Groq primary and Groq → Ollama fallback when no gateway is configured; with an explicit `OMNIROUTE_*` setting the chain becomes Groq → openai-compatible → Ollama. The other cloud providers reuse the Canvas base URLs/models/headers, do not inherit the Groq-only cost cap, and get the same fact-check and tool-binding path as Groq.
- Canvas: the new provider joins `CanvasProviderId`, so the existing SQLite provider budgets, circuit breaker, retry/backoff, egress disclosure, and redacted `AI_DIAGNOSTICS` logs apply unchanged.

## Reuse versus build

- **Reused** `server/canvas-intelligence/openai-compatible.ts` and `server/canvas-intelligence/groq.ts` for Canvas. The new provider is another entry in the existing provider chain, not a second interpretation path (canvas-invariant: one authority per board interpretation).
- **Rejected** extending the raw-`fetch` Canvas client to drive Tutor tool calls: it has no `bindTools`/LangGraph integration and would duplicate message/tool serialization.
- **Added one dependency**: `@langchain/openai@1.8.2` (MIT), pinned exactly. It is the maintained LangChain chat model that supports `bindTools` and tool-call message shapes on `@langchain/core` 1.3.x. Its declared peer range is `@langchain/core ^1.3.5`, matching the pinned 1.3.5 in `package.json`. Verified in the installed package: `BaseChatOpenAIFields.configuration?: ClientOptions` (`node_modules/@langchain/openai/dist/chat_models/base.d.ts:163-168`) and `configuration.baseURL` being threaded into the OpenAI client (`.../base.js:234, 268-274`).
- No new secret storage path: keys stay in `.env`; `.env.example` has the gateway variables commented out.

## Limits

- The gateway is assumed to expose the standard `/chat/completions` OpenAI-compatible endpoint.
- Explicit `groq`, `ollama`, and `openai-compatible` modes remain single-provider, matching existing Groq/Ollama behavior.
- `auto` opts into the gateway only when at least one `OMNIROUTE_*` variable is explicitly set, so copying `.env.example` cannot silently change existing behavior.
- API keys are never written to diagnostics logs; the same redaction as other Canvas providers applies.
- Tool calling depends on the selected model, not on StudyAI's request shape. Free combos that advertise `capabilities.tool_calling: true` can still route to targets that emit tool invocations as text. `POST /v1/models/query` with `capabilities: ["tool_calling"]` is the reliable way to shortlist workable targets; the Agnes free tier was the first verified to return native `tool_calls` through `ChatOpenAI.bindTools`.
- Canvas OCR through this gateway remains unavailable: all tested vision aliases and the Agnes vision path fail gateway-side (403/502/400). `CANVAS_INFERENCE_PROVIDER=groq` or a working vision endpoint is still needed for OCR.

## Verification

- Unit tests cover config parsing, alias normalization, provider selection, baseURL/model routing, placeholder-key behavior, and mocked Groq → gateway fallback.
- Commands: `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
